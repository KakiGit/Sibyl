"""Token estimation and truncation using tiktoken."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_encoder = None


def _get_encoder():
    global _encoder
    if _encoder is None:
        try:
            import tiktoken

            _encoder = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            logger.warning("tiktoken not installed, using word-based estimation")
            _encoder = None
    return _encoder


def estimate_tokens(text: str) -> int:
    """Estimate token count for a string."""
    encoder = _get_encoder()
    if encoder is not None:
        return len(encoder.encode(text))
    return int(len(text.split()) * 1.3)


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Truncate text to fit within token limit."""
    encoder = _get_encoder()
    if encoder is not None:
        tokens = encoder.encode(text)
        if len(tokens) <= max_tokens:
            return text
        truncated = tokens[:max_tokens]
        return encoder.decode(truncated) + "..."

    max_words = int(max_tokens / 1.3)
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "..."


def count_messages_tokens(messages: list) -> int:
    """Count tokens in a list of messages."""
    total = 0
    for msg in messages:
        if isinstance(msg, dict):
            content = msg.get("content", "")
            role = msg.get("role", "")
            total += estimate_tokens(content)
            total += estimate_tokens(role)
            total += 4
        else:
            total += estimate_tokens(str(msg))
    return total


def split_by_tokens(text: str, chunk_size: int, overlap: int = 0) -> list:
    """Split text into chunks by token count."""
    encoder = _get_encoder()
    if encoder is None:
        words = text.split()
        chunk_words = int(chunk_size / 1.3)
        overlap_words = int(overlap / 1.3)
        chunks = []
        i = 0
        while i < len(words):
            chunk = words[i : i + chunk_words]
            chunks.append(" ".join(chunk))
            i += chunk_words - overlap_words
        return chunks

    tokens = encoder.encode(text)
    chunks = []
    i = 0
    while i < len(tokens):
        chunk_tokens = tokens[i : i + chunk_size]
        chunks.append(encoder.decode(chunk_tokens))
        i += chunk_size - overlap
    return chunks
