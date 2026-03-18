from __future__ import annotations

import re

_PARAGRAPH_SPLIT_RE = re.compile(r"\n\s*\n+")
_HEADING_PREFIX_RE = re.compile(r"^\s*((?:\d+(?:\.\d+){0,4}|[IVXLC]+(?:\.[IVXLC]+){0,3}))[\).:\-]?\s+")
_WORD_RE = re.compile(r"[a-zA-Zа-яА-Я0-9]+")


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in _PARAGRAPH_SPLIT_RE.split(text or "") if p.strip()]


def normalize_snippet(text: str) -> str:
    return " ".join((text or "").replace("\n", " ").split()).strip().lower()


def infer_section_from_text(text: str) -> tuple[str | None, str | None]:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return None, None
    first = lines[0]
    match = _HEADING_PREFIX_RE.match(first)
    if match:
        section_raw = match.group(1)
        return f"§{section_raw}", first[:160]

    letters = [ch for ch in first if ch.isalpha()]
    if letters and first.isupper() and len(first.split()) <= 12:
        return "§AUTO", first[:160]
    if first.endswith(":") and len(first.split()) <= 12:
        return "§AUTO", first[:160]
    return None, None


def _token_overlap(a: str, b: str) -> float:
    ta = {t for t in _WORD_RE.findall(normalize_snippet(a)) if len(t) > 2}
    tb = {t for t in _WORD_RE.findall(normalize_snippet(b)) if len(t) > 2}
    if not ta or not tb:
        return 0.0
    union = ta | tb
    if not union:
        return 0.0
    return len(ta & tb) / len(union)


def infer_paragraph_span(document_content: str, chunk_text: str) -> tuple[int | None, int | None]:
    paragraphs = split_paragraphs(document_content)
    if not paragraphs:
        return None, None

    chunk_norm = normalize_snippet(chunk_text)
    if not chunk_norm:
        return None, None

    # 1) Exact-ish containment.
    for idx, paragraph in enumerate(paragraphs, start=1):
        p_norm = normalize_snippet(paragraph)
        if not p_norm:
            continue
        if chunk_norm in p_norm or p_norm in chunk_norm:
            return idx, idx

    # 2) Token-overlap fallback.
    scored: list[tuple[float, int]] = []
    for idx, paragraph in enumerate(paragraphs, start=1):
        score = _token_overlap(chunk_text, paragraph)
        if score >= 0.12:
            scored.append((score, idx))
    if not scored:
        return None, None

    scored.sort(reverse=True)
    top_indices = sorted(idx for _, idx in scored[:3])
    return top_indices[0], top_indices[-1]


def format_source_reference(
    *,
    source_ref: str | None,
    section_id: str | None,
    paragraph_start: int | None,
    paragraph_end: int | None,
    chunk_index: int | None,
) -> str | None:
    parts: list[str] = []
    if source_ref:
        parts.append(source_ref)
    if section_id:
        parts.append(section_id)
    if paragraph_start is not None:
        if paragraph_end is not None and paragraph_end != paragraph_start:
            parts.append(f"¶{paragraph_start}-{paragraph_end}")
        else:
            parts.append(f"¶{paragraph_start}")
    if chunk_index is not None:
        parts.append(f"chunk:{chunk_index}")
    return " ".join(parts) if parts else None


def attach_reference_to_quote(quote: str, reference: str | None) -> str:
    clean_quote = " ".join((quote or "").split()).strip()
    if not clean_quote:
        clean_quote = "Источник определен автоматически по релевантному фрагменту ВНД."
    if not reference:
        return clean_quote
    tag = f"[{reference}]"
    if clean_quote.startswith(tag):
        return clean_quote
    return f"{tag} {clean_quote}"
