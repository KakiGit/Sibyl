from pydantic import BaseModel, Field
from typing import Optional


class LLMConfig(BaseModel):
    model: str = "qwen2.5:0.5b"
    base_url: str = "http://127.0.0.1:11434"
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=128, gt=0)
    timeout: int = Field(default=30, gt=0)
