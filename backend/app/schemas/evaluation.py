from pydantic import BaseModel, Field, field_validator

from app.utils.goal_fields import normalize_quarter


class EvaluateGoalRequest(BaseModel):
    goal_text: str = Field(..., min_length=10, description="Текст цели")
    employee_id: int | None = None
    position: str | None = None
    department: str | None = None
    quarter: str | None = None
    year: int | None = None

    @field_validator("quarter")
    @classmethod
    def validate_optional_quarter(cls, value: str | None) -> str | None:
        return normalize_quarter(value)


class SmartScores(BaseModel):
    S: float = Field(..., ge=0.0, le=1.0)
    M: float = Field(..., ge=0.0, le=1.0)
    A: float = Field(..., ge=0.0, le=1.0)
    R: float = Field(..., ge=0.0, le=1.0)
    T: float = Field(..., ge=0.0, le=1.0)


class EvaluateGoalResponse(BaseModel):
    smart_index: float
    scores: SmartScores
    criteria_explanations: dict[str, str]
    goal_type: str                  # activity / output / impact
    alignment_level: str            # strategic / functional / operational
    alignment_source: str | None
    weak_criteria: list[str]
    recommendations: list[str]
    rewrite: str
    model_version: str
    achievability_warning: str | None = None


class BatchEvaluateRequest(BaseModel):
    employee_id: int
    quarter: str
    year: int = 2026

    @field_validator("quarter")
    @classmethod
    def validate_quarter(cls, value: str) -> str:
        normalized = normalize_quarter(value)
        if normalized is None:
            raise ValueError("quarter is required")
        return normalized


class GoalBatchItem(BaseModel):
    goal_id: str
    goal_text: str
    smart_index: float
    scores: SmartScores
    goal_type: str
    weak_criteria: list[str]


class BatchEvaluateResponse(BaseModel):
    employee_id: int
    quarter: str
    total_goals: int
    avg_smart: float
    weight_total: float
    weak_criteria_summary: dict[str, float]   
    goals: list[GoalBatchItem]
    alerts: list[str]
