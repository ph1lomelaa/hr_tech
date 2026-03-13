from datetime import date
from uuid import UUID
from pydantic import BaseModel, Field


class GenerateGoalsRequest(BaseModel):
    employee_id: UUID
    quarter: str = Field(..., pattern="^Q[1-4]$")
    year: int = 2026
    focus_direction: str | None = None   # "цифровизация", "снижение затрат"
    include_manager_goals: bool = True


class SuggestedGoalItem(BaseModel):
    id: UUID
    goal_text: str
    metric: str | None
    deadline: date | None
    weight_suggestion: float | None
    smart_index: float
    goal_type: str
    source_doc_title: str | None
    source_quote: str | None
    generation_context: str


class GenerateGoalsResponse(BaseModel):
    session_id: UUID
    employee_id: UUID
    quarter: str
    suggestions: list[SuggestedGoalItem]
    manager_goals_used: list[str]
    documents_used: list[str]


class AcceptGoalRequest(BaseModel):
    suggested_goal_id: UUID
    employee_id: UUID
    weight: float | None = None


class AcceptGoalResponse(BaseModel):
    goal_id: UUID
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
