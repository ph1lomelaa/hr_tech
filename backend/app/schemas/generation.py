from datetime import date
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

from app.schemas.evaluation import SmartScores
from app.utils.goal_fields import normalize_quarter


class GenerateGoalsRequest(BaseModel):
    employee_id: int
    quarter: str = Field(..., description="Q1/Q2/Q3/Q4/год")
    year: int = 2026
    focus_direction: str | None = None   # "цифровизация", "снижение затрат"
    include_manager_goals: bool = True

    @field_validator("quarter")
    @classmethod
    def validate_quarter(cls, value: str) -> str:
        normalized = normalize_quarter(value)
        if normalized is None:
            raise ValueError("quarter is required")
        return normalized


class SuggestedGoalItem(BaseModel):
    id: UUID
    goal_text: str
    metric: str | None
    deadline: date | None
    weight_suggestion: float | None
    smart_index: float
    scores: SmartScores | None = None
    goal_type: str
    alignment_level: str | None
    alignment_source: str | None
    source_doc_id: UUID | None
    source_doc_title: str | None
    source_doc_link: str | None
    source_quote: str | None
    source_reference: str | None = None
    generation_context: str
    duplicate_score: float | None = None
    duplicate_with: list[str] = []
    warnings: list[str] = []


class GenerateGoalsResponse(BaseModel):
    session_id: UUID
    employee_id: int
    quarter: str
    suggestions: list[SuggestedGoalItem]
    manager_goals_used: list[str]
    documents_used: list[str]
    warnings: list[str] = []


class AcceptGoalRequest(BaseModel):
    suggested_goal_id: UUID
    employee_id: int
    weight: float | None = None


class AcceptGoalResponse(BaseModel):
    goal_id: UUID
    message: str
    warnings: list[str] = []


class RejectGoalRequest(BaseModel):
    suggested_goal_id: UUID
    employee_id: int
    reason: str | None = None


class RejectGoalResponse(BaseModel):
    suggested_goal_id: UUID
    message: str


class RewriteGoalRequest(BaseModel):
    goal_text: str
    position: str | None = None
    department: str | None = None
    weak_criteria: list[str] | None = None


class RewriteGoalResponse(BaseModel):
    original: str
    rewritten: str
    smart_index_before: float
    smart_index_after: float
    improvements: list[str]
