from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from enum import Enum


class EpisodeType(str, Enum):
    CONVERSATION = "conversation"
    CODE_CHANGE = "code_change"
    DECISION = "decision"
    LEARNING = "learning"


class EntityType(str, Enum):
    PERSON = "person"
    PROJECT = "project"
    FILE = "file"
    CONCEPT = "concept"
    DECISION = "decision"
    PREFERENCE = "preference"
    TOOL = "tool"


class Episode(BaseModel):
    uuid: str
    content: str
    source_description: str
    episode_type: EpisodeType
    created_at: datetime
    valid_at: Optional[datetime] = None
    invalid_at: Optional[datetime] = None
    group_id: Optional[str] = None


class Entity(BaseModel):
    uuid: str
    name: str
    summary: str
    entity_type: EntityType
    created_at: datetime
    valid_at: Optional[datetime] = None
    invalid_at: Optional[datetime] = None


class Fact(BaseModel):
    uuid: str
    source_node_uuid: str
    target_node_uuid: str
    name: str
    fact: str
    episodes: List[str]
    created_at: datetime
    valid_at: Optional[datetime] = None
    invalid_at: Optional[datetime] = None
    superseded_by: Optional[str] = None
    score: float = 1.0


class MemoryQueryResult(BaseModel):
    episodes: List[Episode]
    entities: List[Entity]
    facts: List[Fact]
    relevance_scores: List[float]


class Project(BaseModel):
    name: str
    language: Optional[str] = None
    framework: Optional[str] = None
    path: Optional[str] = None


class File(BaseModel):
    path: str
    purpose: Optional[str] = None
    language: Optional[str] = None


class Preference(BaseModel):
    category: str
    value: str
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None


class Decision(BaseModel):
    description: str
    reason: Optional[str] = None
    outcome: Optional[str] = None
    made_at: datetime
