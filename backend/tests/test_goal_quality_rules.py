import unittest

from app.services.rule_based_evaluator import evaluate_goal_rule_based

try:
    from app.services.goal_quality_rules import extract_goal_scale_value, goal_similarity
    HAS_QUALITY_RULES = True
except Exception:
    HAS_QUALITY_RULES = False


class GoalQualityRulesTestCase(unittest.TestCase):
    @unittest.skipUnless(HAS_QUALITY_RULES, "quality rules dependencies are unavailable")
    def test_similarity_detects_semantic_overlap(self) -> None:
        goal_a = "Сократить время обработки заявок с 48 до 24 часов к концу Q2"
        goal_b = "Уменьшить срок обработки заявок до 24 часов к Q2"
        score = goal_similarity(goal_a, goal_b)
        self.assertGreaterEqual(score, 0.7)

    @unittest.skipUnless(HAS_QUALITY_RULES, "quality rules dependencies are unavailable")
    def test_extract_scale_value_uses_numeric_targets(self) -> None:
        goal = "Повысить конверсию с 12% до 18% к 30.06.2026"
        scale = extract_goal_scale_value(goal)
        self.assertIsNotNone(scale)
        # median(12, 18) = 15
        self.assertAlmostEqual(scale or 0.0, 15.0, places=1)

    def test_rule_based_evaluator_returns_smart_payload(self) -> None:
        payload = evaluate_goal_rule_based(
            goal_text="Увеличить долю автоматизации отчетов до 80% к концу Q3 2026",
            position="Аналитик",
            department="Финансы",
            context_block="",
        )
        self.assertIn("scores", payload)
        self.assertIn("smart_index", payload)
        self.assertIn("goal_type", payload)
        self.assertIn("alignment_level", payload)
        self.assertIn("criteria_explanations", payload)
        self.assertIn("recommendations", payload)
        self.assertEqual(set(payload["criteria_explanations"].keys()), {"S", "M", "A", "R", "T"})
        self.assertGreaterEqual(payload["smart_index"], 0.0)
        self.assertLessEqual(payload["smart_index"], 1.0)


if __name__ == "__main__":
    unittest.main()
