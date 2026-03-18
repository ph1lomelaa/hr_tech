"""
ORM-модели, приведённые к фактической структуре дампа организаторов.

Часть кода проекта исторически обращается к legacy-именам (`Goal.id`,
`Goal.title`, `Goal.description`). Для плавной совместимости оставляем
алиасы через ORM.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from app.database import Base

DOC_TYPE_ENUM = ENUM(
    "vnd",
    "strategy",
    "policy",
    "kpi_framework",
    "regulation",
    "instruction",
    "standard",
    "other",
    name="doc_type_enum",
    create_type=False,
)
GOAL_EVENT_TYPE_ENUM = ENUM(
    "created",
    "edited",
    "submitted",
    "approved",
    "rejected",
    "status_changed",
    "commented",
    "archived",
    name="goal_event_type_enum",
    create_type=False,
)
GOAL_STATUS_ENUM = ENUM(
    "draft",
    "active",
    "submitted",
    "approved",
    "in_progress",
    "done",
    "cancelled",
    "overdue",
    "archived",
    name="goal_status_enum",
    create_type=False,
)
QUARTER_ENUM = ENUM(
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    name="quarter_enum",
    create_type=False,
)
REVIEW_VERDICT_ENUM = ENUM(
    "approve",
    "reject",
    "needs_changes",
    "comment_only",
    name="review_verdict_enum",
    create_type=False,
)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="department")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    grade: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="position")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    department_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=False)
    position_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("positions.id"), nullable=False)
    manager_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=True)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    department: Mapped["Department"] = relationship("Department", back_populates="employees")
    position: Mapped["Position"] = relationship("Position", back_populates="employees")
    goals: Mapped[list["Goal"]] = relationship("Goal", back_populates="employee", foreign_keys="Goal.employee_id")


class Document(Base):
    __tablename__ = "documents"

    doc_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_type: Mapped[str] = mapped_column(DOC_TYPE_ENUM, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_department_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=True)
    department_scope: Mapped[dict | list | str | None] = mapped_column(JSONB, nullable=True)
    keywords: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    version: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Goal(Base):
    __tablename__ = "goals"

    goal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=False)
    department_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=False)
    employee_name_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[str | None] = mapped_column("position_snapshot", Text, nullable=True)
    department_name_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    system_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("systems.id"), nullable=True)
    goal_text: Mapped[str] = mapped_column(Text, nullable=False)
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    quarter: Mapped[str] = mapped_column(QUARTER_ENUM, nullable=False)
    metric: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    weight: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False), default=1.0, nullable=False)
    status: Mapped[str] = mapped_column(GOAL_STATUS_ENUM, default="draft", nullable=False)
    external_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Совместимость с legacy-кодом.
    id = synonym("goal_id")
    title = synonym("goal_text")
    description = synonym("goal_text")

    employee: Mapped["Employee"] = relationship("Employee", back_populates="goals", foreign_keys=[employee_id])
    evaluation: Mapped["SmartEvaluation | None"] = relationship("SmartEvaluation", back_populates="goal", uselist=False)
    source_info: Mapped["GoalSource | None"] = relationship("GoalSource", back_populates="goal", uselist=False)
    reviews: Mapped[list["GoalReview"]] = relationship("GoalReview", back_populates="goal")


class GoalEvent(Base):
    __tablename__ = "goal_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("goals.goal_id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(GOAL_EVENT_TYPE_ENUM, nullable=False)
    actor_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    old_status: Mapped[str | None] = mapped_column(GOAL_STATUS_ENUM, nullable=True)
    new_status: Mapped[str | None] = mapped_column(GOAL_STATUS_ENUM, nullable=True)
    old_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    goal: Mapped["Goal"] = relationship("Goal")


class GoalReview(Base):
    __tablename__ = "goal_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("goals.goal_id", ondelete="CASCADE"), nullable=False)
    reviewer_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=True)
    verdict: Mapped[str] = mapped_column(REVIEW_VERDICT_ENUM, nullable=False)
    comment_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    goal: Mapped["Goal"] = relationship("Goal", back_populates="reviews")


class KpiCatalog(Base):
    __tablename__ = "kpi_catalog"

    id: Mapped[str] = mapped_column("metric_key", Text, primary_key=True)
    name: Mapped[str] = mapped_column("title", Text, nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    metric_key = synonym("id")
    title = synonym("name")


class KpiTimeseries(Base):
    __tablename__ = "kpi_timeseries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    scope_type: Mapped[str] = mapped_column(Text, nullable=False)
    department_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=True)
    employee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    system_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("systems.id"), nullable=True)
    kpi_id: Mapped[str] = mapped_column("metric_key", Text, ForeignKey("kpi_catalog.metric_key"), nullable=False)
    period: Mapped[date] = mapped_column("period_date", Date, nullable=False)
    value: Mapped[float] = mapped_column("value_num", Numeric(18, 6, asdecimal=False), nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    metric_key = synonym("kpi_id")
    period_date = synonym("period")
    value_num = synonym("value")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_department_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    budget_kzt: Mapped[float | None] = mapped_column(Numeric(18, 2, asdecimal=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    systems: Mapped[list["ProjectSystem"]] = relationship("ProjectSystem", back_populates="project")
    employees: Mapped[list["EmployeeProject"]] = relationship("EmployeeProject", back_populates="project")


class System(Base):
    __tablename__ = "systems"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    system_type: Mapped[str] = mapped_column(String(32), nullable=False)
    owner_department_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectSystem(Base):
    __tablename__ = "project_systems"

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    system_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("systems.id", ondelete="RESTRICT"), primary_key=True)

    project: Mapped["Project"] = relationship("Project", back_populates="systems")
    system: Mapped["System"] = relationship("System")


class EmployeeProject(Base):
    __tablename__ = "employee_projects"

    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    allocation_percent: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    employee: Mapped["Employee"] = relationship("Employee")
    project: Mapped["Project"] = relationship("Project", back_populates="employees")
