"""LLM utility functions."""

import json


def parse_llm_json_response(content: str | None) -> dict:
    """Parse LLM JSON response with robust error handling.

    Handles various response formats from LLMs:
    - Plain JSON
    - Markdown code blocks with language identifier (```json, ```python)
    - Markdown code blocks without language identifier (```)

    Args:
        content: Raw LLM response content

    Returns:
        Parsed JSON as dict

    Raises:
        ValueError: If content is empty or parsing fails
    """
    if not content:
        raise ValueError("Empty LLM response")

    cleaned = content.strip()

    # Remove markdown code blocks
    if cleaned.startswith("```"):
        # Extract content between triple backticks
        parts = cleaned.split("```")
        if len(parts) >= 2:
            # parts[1] is the content between first pair of ```
            cleaned = parts[1].strip()
            # Remove language identifier (e.g., "json", "python") on first line
            if "\n" in cleaned:
                cleaned = cleaned.split("\n", 1)[1]

    # Clean up common prefix/suffix issues
    cleaned = cleaned.strip().strip("`").strip()

    # Remove json/python prefix if present (some LLMs add this)
    for prefix in ("json", "JSON", "python", "Python"):
        if cleaned.lower().startswith(prefix.lower()):
            cleaned = cleaned[len(prefix) :].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse LLM JSON response: {e}") from e
