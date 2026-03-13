import logging

from app.vector_store.chroma_client import search_documents

logger = logging.getLogger(__name__)


async def get_relevant_vnd(
    position: str,
    department: str,
    focus_direction: str | None = None,
    n_results: int = 5,
) -> list[dict]:
    """
    RAG-поиск по ВНД для генерации целей.
    Возвращает релевантные чанки с метаданными.
    """
    query = f"{position} {department}"
    if focus_direction:
        query += f" {focus_direction}"

    chunks = await search_documents(query=query, n_results=n_results)

    if not chunks:
        # Возвращаем заглушку если ChromaDB не доступен
        logger.warning("ChromaDB returned no results, using stub VND context")
        return _stub_vnd_context(department)

    return chunks


def format_vnd_context(chunks: list[dict]) -> str:
    """
    Форматирует чанки ВНД в текст для промпта.
    """
    if not chunks:
        return "Документы ВНД не найдены."

    lines = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata", {})
        title = meta.get("doc_title", "Документ")
        doc_type = meta.get("doc_type", "ВНД")
        lines.append(f"[{i}] {doc_type}: {title}")
        lines.append(chunk["text"][:400])
        lines.append("")

    return "\n".join(lines)


def _stub_vnd_context(department: str) -> list[dict]:
    return [
        {
            "text": f"Сотрудники {department} обязаны устанавливать измеримые цели с конкретными KPI и сроками выполнения. Каждая цель должна быть связана со стратегическими приоритетами компании.",
            "metadata": {
                "doc_title": "ВНД-001 Положение о целеполагании",
                "doc_type": "ВНД",
                "doc_id": "00000000-0000-0000-0000-000000000001",
            },
            "distance": 0.2,
        },
        {
            "text": "Стратегическими приоритетами компании на 2026 год являются: цифровизация процессов, повышение клиентского NPS до 75 баллов, снижение операционных издержек на 15%.",
            "metadata": {
                "doc_title": "Стратегия компании 2026",
                "doc_type": "Стратегия",
                "doc_id": "00000000-0000-0000-0000-000000000002",
            },
            "distance": 0.25,
        },
    ]
