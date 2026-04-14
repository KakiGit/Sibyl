from pydantic import BaseModel
from typing import Optional


class LLMConfig(BaseModel):
    model: str = "llama3.2"
    base_url: str = "http://localhost:11434"
    temperature: float = 0.0
    max_tokens: Optional[int] = None
    timeout: int = 60
