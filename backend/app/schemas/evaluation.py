from uuid import UUID
from pydantic import BaseModel, Field


class EvaluateGoalRequest(BaseModel):
    goal_text: str = Field(..., min_length=10, description="Текст цели")
    employee_id: UUID | None = None
    position: str | None = None
    department: str | None = None
    quarter: str | None = None


class SmartScores(BaseModel):
    S: float = Field(..., ge=0.0, le=1.0)
    M: float = Field(..., ge=0.0, le=1.0)
    A: float = Field(..., ge=0.0, le=1.0)
    R: float = Field(..., ge=0.0, le=1.0)
    T: float = Field(..., ge=0.0, le=1.0)


class EvaluateGoalResponse(BaseModel):
    smart_index: float
    scores: SmartScores
    goal_type: str                  # activity / output / impact
    alignment_level: str            # strategic / functional / operational
    alignment_source: str | None
    weak_criteria: list[str]
    recommendations: list[str]
    rewrite: str
    model_version: str


class BatchEvaluateRequest(BaseModel):
    employee_id: UUID
    quarter: str
    year: int = 2026


class GoalBatchItem(BaseModel):
    goal_id: UUID
    goal_text: str
    smart_index: float
    scores: SmartScores
    goal_type: str
    weak_criteria: list[str]


class BatchEvaluateResponse(BaseModel):
    employee_id: UUID
    quarter: str
    total_goals: int
    avg_smart: float
    weak_criteria_summary: dict[str, float]   
    goals: list[GoalBatchItem]
    alerts: list[str]
