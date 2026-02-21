"""Tests for LLM utility functions."""

import pytest

from app.agent.llm_utils import parse_llm_json_response


class TestDirectParsing:
    """Test direct JSON parsing (Strategy 1)."""

    def test_parse_dict(self):
        """Should parse a plain dict."""
        result = parse_llm_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_parse_list(self):
        """Should parse a plain list."""
        result = parse_llm_json_response('["item1", "item2"]')
        assert result == ["item1", "item2"]

    def test_parse_empty_dict(self):
        """Should parse empty dict."""
        result = parse_llm_json_response("{}")
        assert result == {}

    def test_parse_empty_list(self):
        """Should parse empty list."""
        result = parse_llm_json_response("[]")
        assert result == []

    def test_parse_nested_json(self):
        """Should parse nested structures."""
        result = parse_llm_json_response('{"outer": {"inner": [1, 2, 3]}}')
        assert result == {"outer": {"inner": [1, 2, 3]}}

    def test_parse_with_unicode(self):
        """Should handle unicode characters."""
        result = parse_llm_json_response('{"message": "你好世界"}')
        assert result == {"message": "你好世界"}

    def test_parse_with_whitespace(self):
        """Should handle leading/trailing whitespace."""
        result = parse_llm_json_response('  \n  {"key": "value"}  \n  ')
        assert result == {"key": "value"}


class TestTrailingCommaFix:
    """Test trailing comma handling."""

    def test_trailing_comma_in_dict(self):
        """Should fix trailing comma in dict."""
        result = parse_llm_json_response('{"a": 1, "b": 2,}')
        assert result == {"a": 1, "b": 2}

    def test_trailing_comma_in_list(self):
        """Should fix trailing comma in list."""
        result = parse_llm_json_response('["a", "b",]')
        assert result == ["a", "b"]

    def test_trailing_comma_nested(self):
        """Should fix trailing commas in nested structures."""
        result = parse_llm_json_response('{"items": [1, 2,], "count": 2,}')
        assert result == {"items": [1, 2], "count": 2}

    def test_multiple_trailing_commas(self):
        """Should fix multiple trailing commas."""
        result = parse_llm_json_response('[{"a": 1,}, {"b": 2,}]')
        assert result == [{"a": 1}, {"b": 2}]


class TestCodeBlockExtraction:
    """Test markdown code block extraction (Strategy 2)."""

    def test_extract_json_code_block(self):
        """Should extract from ```json block."""
        content = """```json
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_python_code_block(self):
        """Should extract from ```python block."""
        content = """```python
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_javascript_code_block(self):
        """Should extract from ```javascript block."""
        content = """```javascript
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_js_code_block(self):
        """Should extract from ```js block."""
        content = """```js
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_text_code_block(self):
        """Should extract from ```text block."""
        content = """```text
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_plain_code_block(self):
        """Should extract from plain ``` block."""
        content = """```
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_case_insensitive(self):
        """Should handle case-insensitive language tags."""
        content = """```JSON
{"key": "value"}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_with_surrounding_text(self):
        """Should extract code block with text before and after."""
        content = """Here is the JSON response:
```json
{"key": "value"}
```
Hope this helps!"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_first_code_block(self):
        """Should extract only the first code block."""
        content = """```json
{"first": true}
```
Some text
```json
{"second": true}
```"""
        result = parse_llm_json_response(content)
        assert result == {"first": True}

    def test_code_block_with_trailing_comma(self):
        """Should fix trailing comma in code block."""
        content = """```json
{"key": "value",}
```"""
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}


class TestMixedTextExtraction:
    """Test JSON extraction from mixed text (Strategy 3)."""

    def test_extract_dict_from_text(self):
        """Should extract dict from explanatory text."""
        content = 'The result is {"key": "value"} as shown above.'
        result = parse_llm_json_response(content)
        assert result == {"key": "value"}

    def test_extract_list_from_text(self):
        """Should extract list from explanatory text."""
        content = 'Here are the items: ["a", "b", "c"] for your reference.'
        result = parse_llm_json_response(content)
        assert result == ["a", "b", "c"]

    def test_extract_nested_from_text(self):
        """Should extract nested JSON from text."""
        content = 'Response: {"data": [1, 2, 3], "status": "ok"} - success!'
        result = parse_llm_json_response(content)
        assert result == {"data": [1, 2, 3], "status": "ok"}

    def test_extract_with_string_containing_brackets(self):
        """Should handle JSON strings containing brackets."""
        content = 'Result: {"message": "Use [brackets] carefully"} done.'
        result = parse_llm_json_response(content)
        assert result == {"message": "Use [brackets] carefully"}

    def test_extract_with_escaped_quotes(self):
        """Should handle escaped quotes in strings."""
        content = r'Data: {"text": "He said \"hello\""} end.'
        result = parse_llm_json_response(content)
        assert result == {"text": 'He said "hello"'}

    def test_extract_first_json_object(self):
        """Should extract first complete JSON object."""
        content = 'First: {"a": 1} and second: {"b": 2}'
        result = parse_llm_json_response(content)
        assert result == {"a": 1}


class TestErrorCases:
    """Test error handling."""

    def test_empty_string(self):
        """Should raise ValueError for empty string."""
        with pytest.raises(ValueError, match="Empty LLM response"):
            parse_llm_json_response("")

    def test_none_input(self):
        """Should raise ValueError for None."""
        with pytest.raises(ValueError, match="Empty LLM response"):
            parse_llm_json_response(None)

    def test_whitespace_only(self):
        """Should raise ValueError for whitespace only."""
        with pytest.raises(ValueError, match="no valid JSON found"):
            parse_llm_json_response("   \n   ")

    def test_plain_text(self):
        """Should raise ValueError for plain text."""
        with pytest.raises(ValueError, match="no valid JSON found"):
            parse_llm_json_response("This is just plain text")

    def test_invalid_json(self):
        """Should raise ValueError for invalid JSON."""
        with pytest.raises(ValueError, match="no valid JSON found"):
            parse_llm_json_response("{invalid json}")

    def test_incomplete_json(self):
        """Should raise ValueError for incomplete JSON."""
        with pytest.raises(ValueError, match="no valid JSON found"):
            parse_llm_json_response('{"key": "value"')


class TestCallerScenarios:
    """Test scenarios from actual callers."""

    def test_intent_classification_response(self):
        """Simulate intent classification response from classifier.py."""
        # Typical response with code block
        content = """```json
{
    "intent": "content_generation",
    "confidence": 0.95,
    "reasoning": "User wants to learn about a topic"
}
```"""
        result = parse_llm_json_response(content)
        assert isinstance(result, dict)
        assert result["intent"] == "content_generation"
        assert result["confidence"] == 0.95

    def test_entity_extraction_response(self):
        """Simulate entity extraction response from content.py."""
        # Typical response with list
        content = """```json
["Python", "FastAPI", "SQLAlchemy", "Pydantic"]
```"""
        result = parse_llm_json_response(content)
        assert isinstance(result, list)
        assert len(result) == 4
        assert "FastAPI" in result

    def test_entity_extraction_with_text(self):
        """Simulate entity extraction with explanatory text."""
        content = """Based on the content, I've identified the following entities:
```json
["Machine Learning", "Neural Networks", "TensorFlow"]
```
These are the key technical terms."""
        result = parse_llm_json_response(content)
        assert isinstance(result, list)
        assert len(result) == 3

    def test_follow_up_questions_response(self):
        """Simulate follow-up questions response from content.py."""
        content = """```json
[
    {
        "question": "What are the benefits of async programming?",
        "category": "深入理解"
    },
    {
        "question": "How does FastAPI compare to Flask?",
        "category": "对比分析"
    }
]
```"""
        result = parse_llm_json_response(content)
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["question"].startswith("What are")
        assert result[1]["category"] == "对比分析"

    def test_follow_up_with_trailing_comma(self):
        """Simulate follow-up questions with LLM trailing comma error."""
        content = """```json
[
    {
        "question": "What is async/await?",
        "category": "基础概念",
    },
]
```"""
        result = parse_llm_json_response(content)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["question"] == "What is async/await?"

    def test_mixed_response_format(self):
        """Simulate LLM response with mixed format."""
        content = """I'll provide the intent classification:

{"intent": "chitchat", "confidence": 0.8}

This indicates a casual conversation."""
        result = parse_llm_json_response(content)
        assert isinstance(result, dict)
        assert result["intent"] == "chitchat"

    def test_empty_entity_list(self):
        """Simulate empty entity extraction."""
        content = "```json\n[]\n```"
        result = parse_llm_json_response(content)
        assert isinstance(result, list)
        assert len(result) == 0
