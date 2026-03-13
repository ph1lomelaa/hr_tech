import logging

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings

logger = logging.getLogger(__name__)

_client: chromadb.AsyncHttpClient | None = None
_collection = None


async def get_chroma_client() -> chromadb.AsyncHttpClient:
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
        _collection = await client.get_or_create_collection(
            name=settings.chroma_collection,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


async def search_documents(query: str, n_results: int = 5, where: dict | None = None) -> list[dict]:
    """
    RAG-поиск по векторной базе ВНД.
    Возвращает список чанков с метаданными.
    """
    try:
        collection = await get_collection()
        results = await collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
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
    except Exception as e:
        logger.error(f"ChromaDB search failed: {e}")
        return []


async def add_documents(
    ids: list[str],
    texts: list[str],
    metadatas: list[dict],
) -> bool:
    try:
        collection = await get_collection()
        await collection.add(
            ids=ids,
            documents=texts,
            metadatas=metadatas,
        )
        return True
    except Exception as e:
        logger.error(f"ChromaDB add failed: {e}")
        return False
