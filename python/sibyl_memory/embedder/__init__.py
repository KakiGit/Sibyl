"""
Local embedding using sentence-transformers.
"""

from .local import LocalEmbedder
from .config import EmbedderConfig

__all__ = ["LocalEmbedder", "EmbedderConfig"]
