import io
import json
import re
import time
from typing import Any

import pymupdf
from PIL import Image
from google import genai
from google.genai import types
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.menu_import import (
    ExtractedCategory,
    ExtractedDish,
    MenuExtractionResponse,
)


# ============================================================
# Gemini client
# ============================================================

client = genai.Client(
    api_key=settings.GEMINI_API_KEY
)

GEMINI_MODEL = "gemini-3.6-flash"

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_PDF_PAGES = 10

# Retry configuration
MAX_GEMINI_RETRIES = 3
INITIAL_RETRY_DELAY = 2


# ============================================================
# Normalization helpers
# ============================================================

def clean_text(value: Any) -> str | None:
    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return value


def normalize_dietary_type(
    value: Any,
) -> str | None:

    value = clean_text(value)

    if not value:
        return None

    normalized = value.lower()

    mapping = {
        "veg": "Vegetarian",
        "vegetarian": "Vegetarian",
        "vegetarian food": "Vegetarian",

        "vegan": "Vegan",

        "non veg": "Non-Vegetarian",
        "non-veg": "Non-Vegetarian",
        "non vegetarian": "Non-Vegetarian",
        "non-vegetarian": "Non-Vegetarian",
        "chicken": "Non-Vegetarian",
        "mutton": "Non-Vegetarian",
        "fish": "Non-Vegetarian",
        "seafood": "Non-Vegetarian",

        "egg": "Egg",
        "eggetarian": "Egg",
    }

    return mapping.get(normalized, value)


def normalize_spice_level(
    value: Any,
) -> str | None:

    value = clean_text(value)

    if not value:
        return None

    normalized = value.lower()

    mapping = {
        "mild": "Mild",
        "low": "Mild",
        "not spicy": "Mild",

        "medium": "Medium",
        "moderate": "Medium",

        "spicy": "Spicy",
        "hot": "Spicy",

        "very spicy": "Very Spicy",
        "extra spicy": "Very Spicy",
        "extremely spicy": "Very Spicy",
    }

    return mapping.get(normalized, value)


def normalize_price(value: Any):
    """
    Keep price compatible with ExtractedDish.price Decimal field.

    Gemini may return:
    299
    "299"
    "₹299"
    "299.00"
    """

    if value is None:
        return None

    if isinstance(value, (int, float)):
        return value

    value = str(value).strip()

    if not value:
        return None

    # Remove currency symbols and commas
    value = value.replace("₹", "")
    value = value.replace("$", "")
    value = value.replace("€", "")
    value = value.replace("£", "")
    value = value.replace(",", "")

    # Extract first numeric value
    match = re.search(
        r"\d+(?:\.\d+)?",
        value,
    )

    if not match:
        return None

    try:
        return float(match.group(0))
    except (ValueError, TypeError):
        return None


# ============================================================
# Text extraction
# ============================================================

def extract_pdf_text(
    file_bytes: bytes,
) -> tuple[str, list[bytes]]:
    """
    Extract text from a PDF.

    Returns:
        text
        rendered page images

    Images are also generated because some restaurant menus
    are scanned/image-only PDFs.
    """

    document = pymupdf.open(
        stream=file_bytes,
        filetype="pdf",
    )

    try:
        if len(document) > MAX_PDF_PAGES:
            raise ValueError(
                f"PDF contains {len(document)} pages. "
                f"Maximum allowed is {MAX_PDF_PAGES} pages."
            )

        extracted_text = []
        page_images = []

        for page in document:

            text = page.get_text("text")

            if text:
                extracted_text.append(text)

            # Render page for scanned/image-based menus
            pix = page.get_pixmap(
                matrix=pymupdf.Matrix(1.5, 1.5),
                alpha=False,
            )

            image_bytes = pix.tobytes("png")

            page_images.append(image_bytes)

        return (
            "\n".join(extracted_text),
            page_images,
        )

    finally:
        document.close()


def extract_image_bytes(
    file_bytes: bytes,
) -> bytes:
    """
    Validate and normalize an uploaded image.
    """

    image = Image.open(
        io.BytesIO(file_bytes)
    )

    # Force image loading to validate corrupted files
    image.load()

    output = io.BytesIO()

    # Convert formats that Gemini handles consistently
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    image.save(
        output,
        format="PNG",
    )

    return output.getvalue()


# ============================================================
# Gemini prompt
# ============================================================

EXTRACTION_PROMPT = """
You are a restaurant menu extraction system.

Extract ONLY information that is actually visible in the
provided restaurant menu.

Do NOT invent dishes, prices, ingredients, categories,
allergens, dietary information, spice levels, or serving sizes.

Return structured menu data.

IMPORTANT RULES:

1. Extract every clearly readable category.
2. Extract every clearly readable dish under its category.
3. Preserve the original dish name as closely as possible.
4. Extract the exact listed price.
5. If a dish has multiple prices/sizes, use the most clearly
   associated primary price.
6. Do not calculate or guess prices.
7. If the price cannot be confidently determined, return null.
8. Do not invent missing descriptions.
9. Only extract ingredients when they are explicitly shown.
10. Only extract allergens when explicitly shown.
11. Only identify dietary type when it is clearly indicated.
12. Only identify spice level when it is clearly indicated.
13. Preserve category names.
14. Do not create duplicate dishes.
15. Ignore restaurant advertisements, phone numbers, addresses,
    social media handles, QR instructions, opening hours,
    and unrelated promotional text.
16. Do not include taxes, service charges, discounts, combo totals,
    or delivery charges as dish prices.
17. If the menu contains vegetarian/non-vegetarian symbols,
    use them to determine dietary_type when they are clear.

Allowed dietary_type values:

- Vegetarian
- Vegan
- Non-Vegetarian
- Egg
- null

Allowed spice_level values:

- Mild
- Medium
- Spicy
- Very Spicy
- null

For ambiguous or unreadable information, use null.

The final response must contain ONLY the structured JSON
requested by the response schema.
"""


# ============================================================
# Gemini error helpers
# ============================================================

def _get_error_code(exc: Exception) -> int | None:
    """
    Try to extract an HTTP status code from Gemini exceptions.
    """

    code = getattr(exc, "code", None)

    if isinstance(code, int):
        return code

    response = getattr(exc, "response", None)

    if response is not None:
        response_code = getattr(
            response,
            "status_code",
            None,
        )

        if isinstance(response_code, int):
            return response_code

    message = str(exc)

    match = re.search(
        r"\b(429|500|502|503|504)\b",
        message,
    )

    if match:
        return int(match.group(1))

    return None


def _is_retryable_gemini_error(
    exc: Exception,
) -> bool:

    code = _get_error_code(exc)

    return code in {
        429,
        500,
        502,
        503,
        504,
    }


# ============================================================
# Gemini extraction
# ============================================================

def extract_with_gemini(
    text,
    images,
):

    prompt = EXTRACTION_PROMPT

    if text:
        prompt += (
            f"\n\nMENU TEXT:\n{text}"
        )

    contents = [prompt]

    for image_bytes in images:
        contents.append(
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png",
            )
        )

    last_exception = None

    # --------------------------------------------------------
    # Retry Gemini request
    # --------------------------------------------------------

    for attempt in range(
        MAX_GEMINI_RETRIES + 1
    ):

        try:

            print(
                f"Gemini extraction attempt "
                f"{attempt + 1}/"
                f"{MAX_GEMINI_RETRIES + 1}"
            )

            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0,
                    response_mime_type="application/json",
                ),
            )

            if not response.text:
                raise ValueError(
                    "Gemini returned an empty response."
                )

            # ------------------------------------------------
            # Parse JSON
            # ------------------------------------------------

            try:
                data = json.loads(
                    response.text
                )

            except json.JSONDecodeError as exc:
                print(
                    "Gemini returned invalid JSON."
                )

                print(
                    response.text
                )

                raise ValueError(
                    "Gemini returned invalid menu data."
                ) from exc

            # ------------------------------------------------
            # Validate schema
            # ------------------------------------------------

            try:
                return MenuExtractionResponse.model_validate(
                    data
                )

            except ValidationError as exc:

                print(
                    "========== GEMINI RESPONSE VALIDATION ERROR =========="
                )

                print(
                    response.text
                )

                print(
                    f"Error: {exc}"
                )

                print(
                    "========================================================"
                )

                raise ValueError(
                    "Gemini returned menu data in an invalid format."
                ) from exc

        except Exception as exc:
            
            last_exception = exc

            error_code = _get_error_code(
                exc
            )

            print(
                "\n========== GEMINI API ERROR =========="
            )

            print(
                f"Attempt: "
                f"{attempt + 1}/"
                f"{MAX_GEMINI_RETRIES + 1}"
            )

            print(
                f"Code: {error_code}"
            )

            print(
                f"Error type: "
                f"{type(exc).__name__}"
            )

            print(
                f"Message: {exc}"
            )

            print(
                "======================================\n"
            )

            # ------------------------------------------------
            # Don't retry permanent errors
            # ------------------------------------------------

            if not _is_retryable_gemini_error(
                exc
            ):
                raise

            # ------------------------------------------------
            # Stop after final attempt
            # ------------------------------------------------

            if attempt >= MAX_GEMINI_RETRIES:
                break

            # ------------------------------------------------
            # Exponential backoff
            # 2s → 4s → 8s
            # ------------------------------------------------

            delay = (
                INITIAL_RETRY_DELAY
                * (2 ** attempt)
            )

            print(
                f"Retrying Gemini in "
                f"{delay} seconds..."
            )

            time.sleep(delay)

    # --------------------------------------------------------
    # All retries failed
    # --------------------------------------------------------

    if last_exception:

        error_code = _get_error_code(
            last_exception
        )

        if error_code == 429:
            raise RuntimeError(
                "Gemini API rate limit reached. "
                "Please try again later."
            ) from last_exception

        if error_code in {
            500,
            502,
            503,
            504,
        }:
            raise RuntimeError(
                "Gemini is temporarily unavailable. "
                "Please try again in a few moments."
            ) from last_exception

        raise RuntimeError(
            "Gemini menu extraction failed."
        ) from last_exception

    raise RuntimeError(
        "Gemini menu extraction failed."
    )


# ============================================================
# Cleaning extracted menu
# ============================================================

def clean_extracted_menu(
    menu: MenuExtractionResponse,
) -> MenuExtractionResponse:

    cleaned_categories: list[
        ExtractedCategory
    ] = []

    category_names: set[str] = set()

    for category in menu.categories:

        category_name = clean_text(
            category.name
        )

        if not category_name:
            continue

        category_key = category_name.lower()

        # Merge duplicate categories
        existing_category = None

        for existing in cleaned_categories:

            if (
                existing.name.lower()
                == category_key
            ):
                existing_category = existing
                break

        if existing_category is None:

            existing_category = ExtractedCategory(
                name=category_name,
                description=clean_text(
                    category.description
                ),
                dishes=[],
            )

            cleaned_categories.append(
                existing_category
            )

            category_names.add(
                category_key
            )

        # Process dishes
        existing_dish_names = {
            dish.name.strip().lower()
            for dish in existing_category.dishes
        }

        for dish in category.dishes:

            dish_name = clean_text(
                dish.name
            )

            if not dish_name:
                continue

            dish_key = dish_name.lower()

            if dish_key in existing_dish_names:
                continue

            cleaned_dish = ExtractedDish(
                name=dish_name,

                description=clean_text(
                    dish.description
                ),

                price=normalize_price(
                    dish.price
                ),

                ingredients=clean_text(
                    dish.ingredients
                ),

                spice_level=normalize_spice_level(
                    dish.spice_level
                ),

                dietary_type=normalize_dietary_type(
                    dish.dietary_type
                ),

                allergens=clean_text(
                    dish.allergens
                ),

                serving_size=clean_text(
                    dish.serving_size
                ),
            )

            existing_category.dishes.append(
                cleaned_dish
            )

            existing_dish_names.add(
                dish_key
            )

    return MenuExtractionResponse(
        categories=cleaned_categories
    )


# ============================================================
# Public extraction function
# ============================================================

def extract_menu(
    file_bytes: bytes,
    content_type: str,
    filename: str | None = None,
) -> MenuExtractionResponse:
    """
    Main menu extraction function used by
    routes/menu_import.py.

    Supported:
        PDF
        JPEG
        PNG
        WEBP
    """

    if not file_bytes:
        raise ValueError(
            "Uploaded file is empty."
        )

    if len(file_bytes) > MAX_FILE_SIZE:
        raise ValueError(
            "File is too large. Maximum allowed size is 10 MB."
        )

    content_type = (
        content_type or ""
    ).lower().strip()

    filename_lower = (
        filename.lower()
        if filename
        else ""
    )

    # --------------------------------------------------------
    # Detect file type
    # --------------------------------------------------------

    is_pdf = (
        content_type == "application/pdf"
        or filename_lower.endswith(".pdf")
    )

    is_image = (
        content_type
        in {
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        }
        or filename_lower.endswith(
            (
                ".jpg",
                ".jpeg",
                ".png",
                ".webp",
            )
        )
    )

    if not is_pdf and not is_image:
        raise ValueError(
            "Unsupported file type. "
            "Please upload PDF, JPG, JPEG, PNG, or WEBP."
        )

    # --------------------------------------------------------
    # PDF
    # --------------------------------------------------------

    if is_pdf:

        text, page_images = extract_pdf_text(
            file_bytes
        )

        # If text exists, send both text + images.
        # Images help Gemini understand visual menu structure.
        if (
            not text.strip()
            and not page_images
        ):
            raise ValueError(
                "Could not extract readable content from the PDF."
            )

        result = extract_with_gemini(
            text=text,
            images=page_images,
        )

    # --------------------------------------------------------
    # Image
    # --------------------------------------------------------

    else:

        normalized_image = extract_image_bytes(
            file_bytes
        )

        result = extract_with_gemini(
            text="",
            images=[
                normalized_image
            ],
        )

    # --------------------------------------------------------
    # Clean / normalize
    # --------------------------------------------------------

    result = clean_extracted_menu(
        result
    )

    if not result.categories:
        raise ValueError(
            "No menu categories or dishes could be extracted."
        )

    return result