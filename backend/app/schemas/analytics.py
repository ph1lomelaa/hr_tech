from pydantic import BaseModel


class DepartmentMaturityResponse(BaseModel):
    department_id: int
    department_name: str
    quarter: str
    year: int
    maturity_index: float
    avg_smart: float
    strategic_percent: float
    total_goals: int
    weak_criteria: dict[str, float]    
    goal_type_dist: dict[str, int]     
    alignment_dist: dict[str, int]  
    recommendations: list[str]


class CompanyDashboardResponse(BaseModel):
    quarter: str
    year: int
    total_employees: int
    total_goals: int
    avg_smart_company: float
    strategic_percent: float
    alignment_dist: dict[str, int]
    departments: list[DepartmentMaturityResponse]


class AlertResponse(BaseModel):
    id: str
    alert_type: str
    severity: str
    message: str
    is_read: bool
