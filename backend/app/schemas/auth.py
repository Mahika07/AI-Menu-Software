
from pydantic import BaseModel, EmailStr, Field, field_validator


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value):
        if value is None:
            return None

        value = value.strip()
        return value or None


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr

    @field_validator("full_name")
    @classmethod
    def validate_profile_name(cls, value):
        value = value.strip()

        if not value:
            raise ValueError("Full name cannot be empty.")

        return value


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)
