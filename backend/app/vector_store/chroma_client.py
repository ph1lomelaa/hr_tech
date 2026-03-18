import logging
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from chromadb.api.types import IncludeEnum

from app.ai.embeddings import embed_text_async
from app.config import settings

logger = logging.getLogger(__name__)

_client: Any | None = None
_collection = None
QUERY_INCLUDE = [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances]


async def get_chroma_client() -> Any:
    global _client
    if _client is None:
        _client = await chromadb.AsyncHttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


async def get_collection():
    global _collection
    if _collection is None:
        client = await get_chroma_client()
        try:
            _collection = await client.get_or_create_collection(
                name=settings.chroma_collection,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception:
            logger.exception(
                "Failed to initialize Chroma collection '%s'. "
                "Check client/server version compatibility.",
                settings.chroma_collection,
            )
            raise
    return _collection


async def search_documents(query: str, n_results: int = 5, where: dict | None = None) -> list[dict]:
    """
    RAG-поиск по векторной базе ВНД.
    Возвращает список чанков с метаданными.
    """
    try:
        collection = await get_collection()

        query_embedding = await embed_text_async(
            query,
            task_type="RETRIEVAL_QUERY",
            allow_remote=True,
        )
        if query_embedding is None:
            logger.warning("Vector search skipped: no embeddings available for query '%s'", query)
            return []

        results = await collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where,
            include=QUERY_INCLUDE,
        )

        chunks = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                chunks.append({
                    "text": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 1.0,
                })
        return chunks
    except Exception:
        logger.exception("ChromaDB search failed for query='%s'", query)
        return []


async def add_documents(
    ids: list[str],
    texts: list[str],
    metadatas: list[dict],
    embeddings: list[list[float]] | None = None,
) -> bool:
    try:
        if embeddings is None:
            logger.warning("ChromaDB add skipped: explicit embeddings are required for %s documents", len(texts))
            return False
        collection = await get_collection()
        payload: dict[str, Any] = {
            "ids": ids,
            "documents": texts,
            "metadatas": metadatas,
            "embeddings": embeddings,
        }
        await collection.add(**payload)
        return True
    except Exception as e:
        logger.error(f"ChromaDB add failed: {e}")
        return False


async def delete_documents_by_doc_id(doc_id: str) -> bool:
    try:
        collection = await get_collection()
        await collection.delete(where={"doc_id": doc_id})
        return True
    except Exception as e:
        logger.error(f"ChromaDB delete failed: {e}")
        return False
