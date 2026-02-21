"""LLM utility functions."""

import json
import re
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


def _fix_trailing_commas(text: str) -> str:
    """Remove trailing commas before closing brackets.

    Args:
        text: JSON string potentially containing trailing commas

    Returns:
        JSON string with trailing commas removed
    """
    # Remove comma before } or ]
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return text


def _try_parse_json(text: str) -> dict[str, Any] | list[Any] | None:
    """Attempt to parse JSON with preprocessing.

    Args:
        text: String to parse as JSON

    Returns:
        Parsed JSON or None if parsing fails
    """
    try:
        cleaned = text.strip()
        cleaned = _fix_trailing_commas(cleaned)
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return None


def _extract_from_code_block(text: str) -> str | None:
    """Extract content from markdown code block.

    Args:
        text: Text potentially containing markdown code blocks

    Returns:
        Content of first code block or None if not found
    """
    # Match ```json, ```python, ```javascript, ```js, ```text, or plain ```
    # Case insensitive, with optional whitespace
    pattern = r"```(?:json|python|javascript|js|text)?\s*\n(.*?)\n\s*```"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _extract_json_substring(text: str) -> str | None:
    """Extract first complete JSON object or array using bracket counting.

    Handles JSON embedded in explanatory text by finding the first
    complete JSON structure (object or array).

    Args:
        text: Text potentially containing JSON

    Returns:
        First complete JSON substring or None if not found
    """
    text = text.strip()

    # Find start of JSON (either { or [)
    start_idx = -1
    for i, char in enumerate(text):
        if char in ("{", "["):
            start_idx = i
            break

    if start_idx == -1:
        return None

    # Count brackets to find matching closing bracket
    depth = 0
    in_string = False
    escape_next = False

    for i in range(start_idx, len(text)):
        char = text[i]

        # Handle string escaping
        if escape_next:
            escape_next = False
            continue

        if char == "\\":
            escape_next = True
            continue

        # Track string boundaries
        if char == '"' and not escape_next:
            in_string = not in_string
            continue

        # Only count brackets outside strings
        if not in_string:
            if char in ("{", "["):
                depth += 1
            elif char in ("}", "]"):
                depth -= 1

                # Found matching closing bracket
                if depth == 0:
                    return text[start_idx : i + 1]

    return None


def parse_llm_json_response(content: str | None) -> dict[str, Any] | list[Any]:
    """Parse LLM JSON response with robust error handling.

    Uses a three-strategy cascade:
    1. Direct json.loads (fast path for clean JSON)
    2. Extract from markdown code blocks
    3. Extract JSON substring from mixed text

    All strategies include trailing comma fixing.

    Args:
        content: Raw LLM response content

    Returns:
        Parsed JSON as dict or list (preserves original type)

    Raises:
        ValueError: If content is empty or all parsing strategies fail
    """
    if not content:
        raise ValueError("Empty LLM response")

    # Strategy 1: Direct parse (fast path)
    result = _try_parse_json(content)
    if result is not None:
        logger.debug("Parsed JSON using direct strategy")
        return result

    # Strategy 2: Extract from code block
    code_block = _extract_from_code_block(content)
    if code_block:
        result = _try_parse_json(code_block)
        if result is not None:
            logger.debug("Parsed JSON using code block strategy")
            return result

    # Strategy 3: Extract JSON substring from mixed text
    json_substring = _extract_json_substring(content)
    if json_substring:
        result = _try_parse_json(json_substring)
        if result is not None:
            logger.debug("Parsed JSON using substring extraction strategy")
            return result

    # All strategies failed
    logger.error("Failed to parse LLM JSON response", content_preview=content[:200])
    raise ValueError("Failed to parse LLM JSON response: no valid JSON found")
