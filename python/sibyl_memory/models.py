from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from enum import Enum


class EpisodeType(str, Enum):
    CONVERSATION = "conversation"
    CODE_CHANGE = "code_change"
    DECISION = "decision"
    LEARNING = "learning"


class Episode(BaseModel):
    uuid: str
    content: str
    source_description: str
    episode_type: EpisodeType
    created_at: datetime
    valid_at: Optional[datetime] = None
    invalid_at: Optional[datetime] = None


class EntityType(str, Enum):
    PERSON = "person"
    PROJECT = "project"
    FILE = "file"
    CONCEPT = "concept"
    DECISION = "decision"


class Entity(BaseModel):
    uuid: str
    name: str
    summary: str
    entity_type: EntityType
    created_at: datetime


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


class MemoryQueryResult(BaseModel):
    episodes: List[Episode]
    entities: List[Entity]
    facts: List[Fact]
    relevance_scores: List[float]
