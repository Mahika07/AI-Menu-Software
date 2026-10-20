from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    SECRET_KEY: str = Field(min_length=32)

    GEMINI_API_KEY: str

    FRONTEND_URL: str
    API_HOST: str
    BREVO_API_KEY: str | None = None
    EMAIL_FROM: str | None = None
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    ENVIRONMENT: str = "development"
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
