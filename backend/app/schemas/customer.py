
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=10, max_length=10)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Customer name is required.")
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value):
        if not isinstance(value, str):
            raise ValueError("Customer mobile number is required.")

        value = re.sub(r"[\s-]", "", value)

        if not re.fullmatch(r"[6-9]\d{9}", value):
            raise ValueError(
                "Enter a valid 10-digit Indian mobile number."
            )

        return value

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower() if value else None

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return value.strip() or None if value is not None else None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, min_length=10, max_length=10)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Customer name cannot be empty.")
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Enter a valid mobile number.")

        value = re.sub(r"[\s-]", "", value)

        if not re.fullmatch(r"[6-9]\d{9}", value):
            raise ValueError(
                "Enter a valid 10-digit Indian mobile number."
            )

        return value

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower() if value else None

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return value.strip() or None if value is not None else None


class CustomerResponse(BaseModel):
    id: int
    branch_id: int
    name: str
    phone: str
    email: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
