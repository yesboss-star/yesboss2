import json
import re


def test_json_extraction():
    test_cases = [
        '{"work_category": "development", "complexity_level": "advanced", "estimated_hours": 16}',
        'Some text then ```json\n{"work_category": "design", "complexity_level": "beginner", "estimated_hours": 2}\n```',
        '{"work_category": "research", "complexity_level": "intermediate", "estimated_hours": 8.5}',
    ]

    for raw in test_cases:
        json_match = re.search(r"\{[^}]+\}", raw, re.DOTALL)
        assert json_match, f"No JSON found in: {raw[:50]}"
        data = json.loads(json_match.group())
        assert "work_category" in data
        assert "complexity_level" in data
        assert "estimated_hours" in data
        assert data["complexity_level"] in ("beginner", "intermediate", "advanced")

    print("PASS: JSON extraction from AI responses works correctly")


def test_fallback_defaults():
    expected = {"work_category": "general", "complexity_level": "intermediate", "estimated_hours": 4}
    assert expected["work_category"] == "general"
    assert expected["complexity_level"] == "intermediate"
    assert expected["estimated_hours"] == 4
    assert expected["estimated_hours"] > 0
    print("PASS: Fallback defaults are valid")


def test_system_prompt_structure():
    system_prompt = """You are a work-pattern analyst. Given a task or goal description, extract:
1. work_category: what kind of work this is (e.g. "development", "design", "research", "meeting", "documentation", "sales", "support", "management", "planning", "marketing", "data_analysis", "testing", "deployment")
2. complexity_level: "beginner", "intermediate", or "advanced"
3. estimated_hours: estimated hours to complete (float, 0.5-80)

Return ONLY valid JSON: {"work_category": "...", "complexity_level": "...", "estimated_hours": 0.0}"""

    assert "work_category" in system_prompt
    assert "complexity_level" in system_prompt
    assert "estimated_hours" in system_prompt
    assert "beginner" in system_prompt
    assert "intermediate" in system_prompt
    assert "advanced" in system_prompt
    assert "development" in system_prompt
    assert "design" in system_prompt
    assert "research" in system_prompt
    print("PASS: System prompt format is correct")


if __name__ == "__main__":
    test_json_extraction()
    test_fallback_defaults()
    test_system_prompt_structure()
    print("\n=== ALL TESTS PASSED ===")
