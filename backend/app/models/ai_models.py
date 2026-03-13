"""
Наши AI таблицы — добавляем поверх существующей БД.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    UUID,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SmartEvaluation(Base):
    __tablename__ = "smart_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), unique=True)

    # SMART баллы
    score_s: Mapped[float] = mapped_column(Float, nullable=False)
    score_m: Mapped[float] = mapped_column(Float, nullable=False)
    score_a: Mapped[float] = mapped_column(Float, nullable=False)
    score_r: Mapped[float] = mapped_column(Float, nullable=False)
    score_t: Mapped[float] = mapped_column(Float, nullable=False)
    smart_index: Mapped[float] = mapped_column(Float, nullable=False)

    # Классификация
    goal_type: Mapped[str | None] = mapped_column(String(20), nullable=True)        # activity / output / impact
    alignment_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # strategic / functional / operational
    alignment_source: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Текстовые выходы
    weak_criteria: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    recommendations: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    rewrite: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Метаданные
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    goal: Mapped["Goal"] = relationship("Goal", back_populates="evaluation")  # type: ignore[name-defined]


class GenerationSession(Base):
    __tablename__ = "generation_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))
    quarter: Mapped[str | None] = mapped_column(String(5), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    focus_direction: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_goals: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    suggestions: Mapped[list["SuggestedGoal"]] = relationship("SuggestedGoal", back_populates="session")


class SuggestedGoal(Base):
    __tablename__ = "suggested_goals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("generation_sessions.id"))
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))

    # Содержание
    goal_text: Mapped[str] = mapped_column(Text, nullable=False)
    metric: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    weight_suggestion: Mapped[float | None] = mapped_column(Float, nullable=True)

    # SMART
    smart_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Источник из ВНД
    source_doc_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_doc_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    generation_context: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Статус
    status: Mapped[str] = mapped_column(String(20), default="suggested")  # suggested / accepted / rejected
    accepted_goal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("goals.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["GenerationSession"] = relationship("GenerationSession", back_populates="suggestions")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chroma_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DepartmentMaturityCache(Base):
    __tablename__ = "department_maturity_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    quarter: Mapped[str] = mapped_column(String(5))
    year: Mapped[int] = mapped_column(Integer)

    maturity_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_smart: Mapped[float | None] = mapped_column(Float, nullable=True)
    strategic_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_goals: Mapped[int | None] = mapped_column(Integer, nullable=True)

    weak_criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    goal_type_dist: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    recommendations: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GoalAlert(Base):
    __tablename__ = "goal_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("goals.id"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(50))  # low_smart / duplicate / weight_mismatch / too_few_goals
    severity: Mapped[str] = mapped_column(String(20), default="warning")  # warning / critical
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
