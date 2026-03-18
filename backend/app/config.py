from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/goalai"
    db_pool_size: int = 20
    db_pool_max_overflow: int = 40
    db_pool_timeout_seconds: int = 30
    db_pool_recycle_seconds: int = 1800
    db_pool_pre_ping: bool = True

    chroma_host: str = "localhost"
    chroma_port: int = 8001
    chroma_collection: str = "vnd_documents"

    api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_embedding_model: str = "models/gemini-embedding-001"
    gemini_embedding_output_dimensionality: int = 384
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    llm_request_timeout_seconds: int = 30
    llm_cache_ttl_seconds: int = 300
    llm_cache_max_entries: int = 256
    llm_provider_cooldown_seconds: int = 45
    llm_provider_failure_threshold: int = 2

    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_local_files_only: bool = True

    ai_trace_log_path: str = "logs/ai_trace.jsonl"
    ai_trace_max_chars: int = 4000

    # Business rules
    smart_threshold: float = 0.7
    min_goals: int = 3
    max_goals: int = 5
    weight_tolerance: float = 0.01
    duplicate_similarity_threshold: float = 0.82
    duplicate_scope_limit: int = 300
    achievability_min_history: int = 8
    achievability_ratio_threshold: float = 1.8
    achievability_similarity_threshold: float = 0.58
    achievability_min_similar_goals: int = 4
    achievability_low_approval_threshold: float = 0.5
    achievability_warning_score_threshold: float = 0.65

    # Analytics
    analytics_cache_ttl_seconds: int = 300

    # AI guardrails
    ai_generate_max_concurrency: int = 4
    ai_evaluate_max_concurrency: int = 8
    ai_batch_max_concurrency: int = 2
    ai_queue_timeout_seconds: int = 12
    ai_generate_rate_limit_per_minute: int = 20
    ai_evaluate_rate_limit_per_minute: int = 60
    ai_batch_rate_limit_per_minute: int = 10

    # Auth
    auth_jwt_secret: str = "change-me-in-production"
    auth_jwt_algorithm: str = "HS256"
    auth_access_token_minutes: int = 12 * 60
    auth_allow_header_fallback: bool = False


settings = Settings()
