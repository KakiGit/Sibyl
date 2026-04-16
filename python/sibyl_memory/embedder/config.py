from pydantic import BaseModel
from typing import Optional


class EmbedderConfig(BaseModel):
    model: str = "sentence-transformers/all-MiniLM-L6-v2"
    local: bool = True
    dimensions: int = 384
    batch_size: int = 16
    device: Optional[str] = None
