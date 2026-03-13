from uuid import UUID
from pydantic import BaseModel


class DepartmentMaturityResponse(BaseModel):
    department_id: UUID
    department_name: str
    quarter: str
    year: int
    maturity_index: float
    avg_smart: float
    strategic_percent: float
    total_goals: int
    weak_criteria: dict[str, float]       # {"S": 0.71, "M": 0.55}
    goal_type_dist: dict[str, int]        # {"activity": 5, "output": 8, "impact": 3}
    recommendations: list[str]


class CompanyDashboardResponse(BaseModel):
    quarter: str
    year: int
    total_employees: int
    total_goals: int
    avg_smart_company: float
    strategic_percent: float
    departments: list[DepartmentMaturityResponse]


class AlertResponse(BaseModel):
    id: UUID
    alert_type: str
    severity: str
    message: str
    is_read: bool
