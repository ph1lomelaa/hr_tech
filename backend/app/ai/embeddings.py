import logging

from app.config import settings

logger = logging.getLogger(__name__)

_model = None


def get_embedding_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(settings.embedding_model)
            logger.info(f"Loaded embedding model: {settings.embedding_model}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            _model = None
    return _model


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    model = get_embedding_model()
    if model is None:
        return None
    embeddings = model.encode(texts, show_progress_bar=False)
    return embeddings.tolist()


def embed_text(text: str) -> list[float] | None:
    result = embed_texts([text])
    return result[0] if result else None
