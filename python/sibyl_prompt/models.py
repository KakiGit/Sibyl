from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum


class PromptSection(BaseModel):
    name: str
    content: str
    priority: int = 0
    max_tokens: Optional[int] = None


class PromptContext(BaseModel):
    project_path: str
    conversation_history: List[Dict[str, str]]
    relevant_memories: List[str]
    current_file: Optional[str] = None
    active_skills: List[str] = []


class PromptTemplate(BaseModel):
    name: str
    sections: List[PromptSection]
    variables: Dict[str, Any] = {}
