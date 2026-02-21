"""LLM utility functions."""

import json
from typing import Any


def parse_llm_json_response(content: str | None) -> dict[str, Any] | list[Any]:
    """Parse LLM JSON response with robust error handling.

    Handles various response formats from LLMs:
    - Plain JSON
    - Markdown code blocks with language identifier (```json, ```python)
    - Markdown code blocks without language identifier (```)

    Args:
        content: Raw LLM response content

    Returns:
        Parsed JSON as dict or list (preserves original type)

    Raises:
        ValueError: If content is empty or parsing fails
    """
    if not content:
        raise ValueError("Empty LLM response")

    cleaned = content.strip()

    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 2:
            cleaned = parts[1].strip()
            if "\n" in cleaned:
                cleaned = cleaned.split("\n", 1)[1]

    cleaned = cleaned.strip().strip("`").strip()

    for prefix in ("json", "JSON", "python", "Python"):
        if cleaned.lower().startswith(prefix.lower()):
            cleaned = cleaned[len(prefix) :].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse LLM JSON response: {e}") from e
