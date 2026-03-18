import unittest

from app.utils.citation import (
    attach_reference_to_quote,
    format_source_reference,
    infer_paragraph_span,
    infer_section_from_text,
)


class CitationUtilsTestCase(unittest.TestCase):
    def test_infer_section_from_heading(self) -> None:
        section_id, section_title = infer_section_from_text("3.2.1 Логика алертов\nОписание блока...")
        self.assertEqual(section_id, "§3.2.1")
        self.assertTrue((section_title or "").startswith("3.2.1"))

    def test_infer_paragraph_span(self) -> None:
        content = (
            "1. Введение\n\n"
            "Параграф про стратегию и KPI.\n\n"
            "Параграф про цифровизацию и сроки."
        )
        chunk = "стратегию и KPI"
        start, end = infer_paragraph_span(content, chunk)
        self.assertEqual((start, end), (2, 2))

    def test_attach_reference_to_quote(self) -> None:
        ref = format_source_reference(
            source_ref="DOC2",
            section_id="§3.2",
            paragraph_start=14,
            paragraph_end=15,
            chunk_index=7,
        )
        quote = attach_reference_to_quote("Снизить операционные затраты на 12%", ref)
        self.assertIn("[DOC2 §3.2 ¶14-15 chunk:7]", quote)


if __name__ == "__main__":
    unittest.main()
