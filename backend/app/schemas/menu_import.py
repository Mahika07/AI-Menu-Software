from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class ExtractedDish(BaseModel):
    name: str = Field(min_length=1, max_length=150)

    description: str | None = Field(
        default=None,
        max_length=2000,
    )

    # Preview metadata
    description_ai_generated: bool = False

    price: Decimal | None = None

    image_url: str | None = Field(
        default=None,
        max_length=500,
    )

    image_ai_generated: bool = False

    ingredients: str | None = Field(
        default=None,
        max_length=2000,
    )

    spice_level: str | None = None

    dietary_type: str | None = None

    allergens: str | None = Field(
        default=None,
        max_length=1000,
    )

    serving_size: str | None = Field(
        default=None,
        max_length=100,
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_extracted_values(cls, data):
        if not isinstance(data, dict):
            return data

        data = data.copy()

        # Normalize price
        if data.get("price") is not None:
            try:
                data["price"] = Decimal(str(data["price"]))
            except Exception:
                data["price"] = None

        # Normalize list values returned by AI
        for field in ["ingredients", "allergens"]:
            value = data.get(field)

            if isinstance(value, list):
                if value:
                    data[field] = ", ".join(
                        str(item) for item in value
                    )
                else:
                    data[field] = None

            elif value is not None and not isinstance(value, str):
                data[field] = str(value)

        return data


class ExtractedCategory(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
    )

    description: str | None = Field(
        default=None,
        max_length=500,
    )

    dishes: list[ExtractedDish] = Field(
        default_factory=list
    )


class MenuExtractionResponse(BaseModel):
    categories: list[ExtractedCategory]


class MenuImportConfirmRequest(BaseModel):
    categories: list[ExtractedCategory] = Field(
        min_length=1,
        max_length=50,
    )

class MenuImageGenerationResponse(BaseModel):
    generated_images: int
    failed_images: int
    menu: MenuImportConfirmRequest