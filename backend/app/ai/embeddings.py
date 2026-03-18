import asyncio
import hashlib
import logging
import time
from collections import OrderedDict
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_model: Any | None = None
_model_init_attempted = False
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_EMBEDDING_CACHE: OrderedDict[str, tuple[float, list[float]]] = OrderedDict()


def get_embedding_model():
    global _model, _model_init_attempted
    if not _model_init_attempted:
        _model_init_attempted = True
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(
                settings.embedding_model,
                local_files_only=settings.embedding_local_files_only,
            )
            logger.info(
                "Loaded embedding model: %s (local_files_only=%s)",
                settings.embedding_model,
                settings.embedding_local_files_only,
            )
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            _model = None
    return _model


def gemini_embeddings_available() -> bool:
    return bool(
        settings.api_key
        and settings.api_key.strip()
        and settings.api_key != "AIza..."
        and settings.gemini_embedding_model
        and settings.gemini_embedding_model.strip()
    )


def embeddings_available(*, include_remote: bool = False) -> bool:
    if get_embedding_model() is not None:
        return True
    return include_remote and gemini_embeddings_available()


def _embedding_model_name() -> str:
    model = settings.gemini_embedding_model.strip()
    return model if model.startswith("models/") else f"models/{model}"


def _embedding_cache_key(text: str, task_type: str | None, title: str | None) -> str:
    digest = hashlib.sha256(
        "\n".join(
            [
                _embedding_model_name(),
                str(settings.gemini_embedding_output_dimensionality),
                task_type or "",
                title or "",
                text,
            ]
        ).encode("utf-8")
    ).hexdigest()
    return digest


def _read_embedding_cache(cache_key: str) -> list[float] | None:
    ttl = max(0, settings.llm_cache_ttl_seconds)
    if ttl <= 0:
        return None

    cached = _EMBEDDING_CACHE.get(cache_key)
    if cached is None:
        return None

    expires_at, vector = cached
    if expires_at <= time.monotonic():
        _EMBEDDING_CACHE.pop(cache_key, None)
        return None

    _EMBEDDING_CACHE.move_to_end(cache_key)
    return list(vector)


def _write_embedding_cache(cache_key: str, vector: list[float]) -> None:
    ttl = max(0, settings.llm_cache_ttl_seconds)
    max_entries = max(1, settings.llm_cache_max_entries * 4)
    if ttl <= 0:
        return

    _EMBEDDING_CACHE[cache_key] = (time.monotonic() + ttl, list(vector))
    _EMBEDDING_CACHE.move_to_end(cache_key)
    while len(_EMBEDDING_CACHE) > max_entries:
        _EMBEDDING_CACHE.popitem(last=False)


def _coerce_embedding(values: Any) -> list[float]:
    if not isinstance(values, list):
        raise ValueError("Embedding payload must be a list")
    return [float(value) for value in values]


def _embed_texts_local(texts: list[str]) -> list[list[float]] | None:
    model = get_embedding_model()
    if model is None:
        return None
    embeddings = model.encode(texts, show_progress_bar=False)
    return embeddings.tolist()


def embed_texts(
    texts: list[str],
    *,
    task_type: str | None = None,
    titles: list[str] | None = None,
    allow_remote: bool = False,
) -> list[list[float]] | None:
    embeddings = _embed_texts_local(texts)
    if embeddings is not None:
        return embeddings
    if allow_remote:
        logger.info(
            "Synchronous remote embeddings are disabled; returning no embeddings for task_type=%s",
            task_type,
        )
    return None


def embed_text(
    text: str,
    *,
    task_type: str | None = None,
    title: str | None = None,
    allow_remote: bool = False,
) -> list[float] | None:
    result = embed_texts([text], task_type=task_type, titles=[title] if title else None, allow_remote=allow_remote)
    return result[0] if result else None


async def _embed_texts_gemini_async(
    texts: list[str],
    *,
    task_type: str | None = None,
    titles: list[str] | None = None,
) -> list[list[float]] | None:
    if not texts or not gemini_embeddings_available():
        return None

    resolved_titles = titles or [None] * len(texts)
    if len(resolved_titles) != len(texts):
        raise ValueError("titles length must match texts length")

    cached_vectors: list[list[float] | None] = [None] * len(texts)
    uncached_indices: list[int] = []
    requests: list[dict[str, Any]] = []

    for index, text in enumerate(texts):
        cache_key = _embedding_cache_key(text, task_type, resolved_titles[index])
        cached = _read_embedding_cache(cache_key)
        if cached is not None:
            cached_vectors[index] = cached
            continue

        request: dict[str, Any] = {
            "model": _embedding_model_name(),
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": settings.gemini_embedding_output_dimensionality,
        }
        if task_type:
            request["taskType"] = task_type
        if resolved_titles[index]:
            request["title"] = resolved_titles[index]
        requests.append(request)
        uncached_indices.append(index)

    if requests:
        headers = {
            "x-goog-api-key": settings.api_key,
            "Content-Type": "application/json",
        }
        timeout = max(5.0, float(settings.llm_request_timeout_seconds))
        model_name = _embedding_model_name()

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if len(requests) == 1:
                    response = await client.post(
                        f"{_GEMINI_BASE_URL}/{model_name}:embedContent",
                        headers=headers,
                        json=requests[0],
                    )
                    response.raise_for_status()
                    data = response.json()
                    vectors = [_coerce_embedding((data.get("embedding") or {}).get("values"))]
                else:
                    response = await client.post(
                        f"{_GEMINI_BASE_URL}/{model_name}:batchEmbedContents",
                        headers=headers,
                        json={"requests": requests},
                    )
                    response.raise_for_status()
                    data = response.json()
                    embeddings_payload = data.get("embeddings") or []
                    vectors = [
                        _coerce_embedding((item or {}).get("values"))
                        for item in embeddings_payload
                    ]
        except Exception:
            logger.exception(
                "Gemini embeddings request failed for %s texts (task_type=%s)",
                len(requests),
                task_type,
            )
            return None

        if len(vectors) != len(requests):
            logger.error(
                "Gemini embeddings count mismatch: expected %s, got %s",
                len(requests),
                len(vectors),
            )
            return None

        for vector, index in zip(vectors, uncached_indices):
            cache_key = _embedding_cache_key(texts[index], task_type, resolved_titles[index])
            _write_embedding_cache(cache_key, vector)
            cached_vectors[index] = vector

    if any(vector is None for vector in cached_vectors):
        return None
    return [list(vector) for vector in cached_vectors if vector is not None]


async def embed_texts_async(
    texts: list[str],
    *,
    task_type: str | None = None,
    titles: list[str] | None = None,
    allow_remote: bool = False,
) -> list[list[float]] | None:
    local_embeddings = await asyncio.to_thread(_embed_texts_local, texts)
    if local_embeddings is not None:
        return local_embeddings
    if allow_remote:
        return await _embed_texts_gemini_async(texts, task_type=task_type, titles=titles)
    return None


async def embed_text_async(
    text: str,
    *,
    task_type: str | None = None,
    title: str | None = None,
    allow_remote: bool = False,
) -> list[float] | None:
    result = await embed_texts_async(
        [text],
        task_type=task_type,
        titles=[title] if title else None,
        allow_remote=allow_remote,
    )
    return result[0] if result else None
