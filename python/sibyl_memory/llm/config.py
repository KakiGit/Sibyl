from pydantic import BaseModel
from typing import Optional


class LLMConfig(BaseModel):
    model: str = "qwen2.5:0.5b"
    base_url: str = "http://127.0.0.1:11434"
    temperature: float = 0.0
    max_tokens: Optional[int] = 128
    timeout: int = 30
