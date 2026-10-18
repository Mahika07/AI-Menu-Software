import base64
import re
import uuid

import cloudinary
import cloudinary.uploader

from google import genai

from app.core.config import settings


# ---------------------------------------------------------
# Gemini client
# ---------------------------------------------------------

client = genai.Client(
    api_key=settings.GEMINI_API_KEY
)

IMAGE_MODEL = "gemini-3.1-flash-image"


# ---------------------------------------------------------
# Cloudinary configuration
# ---------------------------------------------------------

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def _safe_public_id(value: str) -> str:
    value = value.strip().lower()

    value = re.sub(
        r"[^a-z0-9]+",
        "-",
        value,
    )

    value = value.strip("-")

    return value[:80] or "dish"


# ---------------------------------------------------------
# Generate dish image
# ---------------------------------------------------------

def generate_dish_image(
    dish_name: str,
    description: str | None = None,
    ingredients: str | None = None,
    dietary_type: str | None = None,
    spice_level: str | None = None,
) -> str | None:

    context_parts = [
        f"Dish name: {dish_name}",
    ]

    if description:
        context_parts.append(
            f"Description: {description}"
        )

    if ingredients:
        context_parts.append(
            f"Known ingredients: {ingredients}"
        )

    if dietary_type:
        context_parts.append(
            f"Dietary type: {dietary_type}"
        )

    if spice_level:
        context_parts.append(
            f"Spice level: {spice_level}"
        )

    context = "\n".join(context_parts)

    prompt = f"""
Create a realistic professional restaurant menu photograph
of the following dish.

{context}

IMAGE REQUIREMENTS:

- Realistic professional food photography.
- Appetizing and naturally plated.
- Square 1:1 composition.
- Restaurant-quality presentation.
- Natural studio lighting.
- Clean, elegant, minimal background.
- Focus primarily on the food.
- No people.
- No text.
- No logos.
- No watermarks.
- No branding.
- Do not place the dish name in the image.
- Do not invent specific ingredients that contradict
  the provided information.
- Do not add nutritional claims.
- Do not add health claims.

The image is a representative restaurant menu photograph.
Make the food visually match the provided dish information
as closely as possible.
"""

    try:
        print(
            f"Generating AI image for dish: {dish_name}"
        )

        # -------------------------------------------------
        # Generate image with Gemini
        # -------------------------------------------------

        interaction = client.interactions.create(
            model=IMAGE_MODEL,
            input=prompt,
            response_format={
                "type": "image",
                "mime_type": "image/jpeg",
                "aspect_ratio": "1:1",
                "image_size": "1K",
            },
        )

        image_output = interaction.output_image

        if not image_output or not image_output.data:
            print(
                f"No image returned for dish: {dish_name}"
            )
            return None

        # -------------------------------------------------
        # Decode base64 image
        # -------------------------------------------------

        try:
            image_bytes = base64.b64decode(
                image_output.data
            )
        except Exception as exc:
            print(
                "Image base64 decoding failed:",
                type(exc).__name__,
                str(exc),
            )
            return None

        if not image_bytes:
            print(
                f"Decoded image is empty: {dish_name}"
            )
            return None

        # -------------------------------------------------
        # Generate unique Cloudinary ID
        # -------------------------------------------------

        safe_name = _safe_public_id(dish_name)

        unique_id = uuid.uuid4().hex[:10]

        public_id = (
            f"smart-menu/dishes/"
            f"{safe_name}-{unique_id}"
        )

        # -------------------------------------------------
        # Upload to Cloudinary
        # -------------------------------------------------

        print(
            f"Uploading image to Cloudinary: {dish_name}"
        )

        upload_result = cloudinary.uploader.upload(
            image_bytes,
            resource_type="image",
            public_id=public_id,
            overwrite=False,
            format="jpg",
        )

        secure_url = upload_result.get(
            "secure_url"
        )

        if not secure_url:
            print(
                "Cloudinary upload succeeded but "
                "no secure_url was returned."
            )
            return None

        print(
            f"Image generated successfully: {dish_name}"
        )

        return secure_url

    except Exception as exc:
        print(
            "Dish image generation failed:",
            type(exc).__name__,
            str(exc),
        )

        return None