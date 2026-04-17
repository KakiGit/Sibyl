from pydantic import BaseModel, Field, field_validator
from typing import Optional


class EmbedderConfig(BaseModel):
    model: str = "sentence-transformers/all-MiniLM-L6-v2"
    local: bool = True
    dimensions: int = Field(default=384, gt=0)
    batch_size: int = Field(default=16, gt=0)
    device: Optional[str] = None

    @field_validator("dimensions")
    @classmethod
    def validate_dimensions(cls, v: int) -> int:
        if v not in (384, 768, 1024):
            raise ValueError(f"dimensions must be 384, 768, or 1024, got {v}")
        return v
