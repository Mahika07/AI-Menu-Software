from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.dependencies import get_current_user
from app.database.connection import get_db

from app.models.branch import Branch
from app.models.category import Category
from app.models.dish import Dish
from app.models.restaurant import Restaurant
from app.models.user import User

from app.schemas.menu_import import (
    MenuExtractionResponse,
    MenuImportConfirmRequest,
    MenuImageGenerationResponse,
)

from app.services.menu_extraction import extract_menu
from app.services.ai_service import generate_missing_menu_descriptions
from app.services.ai_image_service import generate_dish_image


router = APIRouter(
    prefix="/menu-import",
    tags=["Menu Import"],
)


# =========================================================
# FILE UPLOAD SETTINGS
# =========================================================

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}

MAX_FILE_SIZE = 10 * 1024 * 1024


# =========================================================
# BRANCH ACCESS
# =========================================================

def verify_branch_access(
    db: Session,
    branch_id: int,
    current_user: User,
) -> Branch:

    branch = (
        db.query(Branch)
        .join(
            Restaurant,
            Branch.restaurant_id == Restaurant.id,
        )
        .filter(
            Branch.id == branch_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )

    if not branch.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch is inactive",
        )

    return branch


# =========================================================
# EXTRACT MENU
# =========================================================

@router.post(
    "/branches/{branch_id}/extract",
    response_model=MenuExtractionResponse,
)
@limiter.limit("5/minute")
async def extract_menu_endpoint(
    request: Request,
    branch_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ---------------------------------------------------------
    # 1. Verify branch ownership
    # ---------------------------------------------------------

    verify_branch_access(
        db=db,
        branch_id=branch_id,
        current_user=current_user,
    )

    # ---------------------------------------------------------
    # 2. Validate file type
    # ---------------------------------------------------------

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type: {file.content_type}. "
                "Allowed types: PDF, JPG, PNG or WEBP."
            ),
        )

    # ---------------------------------------------------------
    # 3. Read file
    # ---------------------------------------------------------

    try:
        file_bytes = await file.read()

    except Exception as exc:
        print("\n========== FILE READ ERROR ==========")
        print(f"Error type: {type(exc).__name__}")
        print(f"Error message: {exc}")
        print("=====================================\n")

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read uploaded file.",
        )

    # ---------------------------------------------------------
    # 4. Check empty file
    # ---------------------------------------------------------

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # ---------------------------------------------------------
    # 5. Check file size
    # ---------------------------------------------------------

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size must be 10 MB or less.",
        )

    # ---------------------------------------------------------
    # 6. Extract + enhance menu
    # ---------------------------------------------------------

    try:
        print("\n========== MENU EXTRACTION ==========")
        print(f"Branch ID: {branch_id}")
        print(f"Filename: {file.filename}")
        print(f"Content Type: {file.content_type}")
        print(f"File Size: {len(file_bytes)} bytes")
        print("Starting menu extraction...")
        print("=====================================\n")

        # -----------------------------------------------------
        # Extract original menu
        # -----------------------------------------------------

        extracted_menu = extract_menu(
            file_bytes=file_bytes,
            content_type=file.content_type,
            filename=file.filename,
        )

        # -----------------------------------------------------
        # Generate missing descriptions
        # -----------------------------------------------------

        print("Generating missing dish descriptions...")

        extracted_menu = generate_missing_menu_descriptions(
            extracted_menu
        )

        # -----------------------------------------------------
        # Logging
        # -----------------------------------------------------

        total_categories = len(
            extracted_menu.categories
        )

        total_dishes = sum(
            len(category.dishes)
            for category in extracted_menu.categories
        )

        generated_description_count = sum(
            1
            for category in extracted_menu.categories
            for dish in category.dishes
            if dish.description_ai_generated
        )

        print("\n========== EXTRACTION SUCCESS ==========")
        print(f"Categories: {total_categories}")
        print(f"Dishes: {total_dishes}")
        print(
            f"AI descriptions generated: "
            f"{generated_description_count}"
        )
        print("========================================\n")

        return extracted_menu

    except ValueError as exc:
        print("\n========== EXTRACTION VALUE ERROR ==========")
        print(f"Error type: {type(exc).__name__}")
        print(f"Error message: {exc}")
        print("============================================\n")

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    except RuntimeError as exc:
        print("\n========== GEMINI SERVICE ERROR ==========")
        print(f"Error type: {type(exc).__name__}")
        print(f"Error message: {exc}")
        print("==========================================\n")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    except Exception as exc:
        print(
            "\n========== MENU EXTRACTION ERROR =========="
        )
        print(f"Error type: {type(exc).__name__}")
        print(f"Error message: {exc}")
        print("============================================\n")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Menu extraction service is temporarily unavailable.",
        )


# =========================================================
# GENERATE MENU IMAGES
# =========================================================

@router.post(
    "/branches/{branch_id}/generate-images",
    response_model=MenuImageGenerationResponse,
)
@limiter.limit("10/minute")
def generate_menu_images(
    request: Request,
    branch_id: int,
    menu_data: MenuImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ---------------------------------------------------------
    # 1. Verify branch ownership
    # ---------------------------------------------------------

    verify_branch_access(
        db=db,
        branch_id=branch_id,
        current_user=current_user,
    )

    generated_images = 0
    failed_images = 0

    # ---------------------------------------------------------
    # 2. Generate images
    # ---------------------------------------------------------

    for category in menu_data.categories:

        for dish in category.dishes:

            # Don't regenerate an existing image
            if dish.image_url:
                continue

            try:
                image_url = generate_dish_image(
                    dish_name=dish.name,
                    description=dish.description,
                    ingredients=dish.ingredients,
                    dietary_type=dish.dietary_type,
                    spice_level=dish.spice_level,
                )

                if image_url:
                    dish.image_url = image_url
                    dish.image_ai_generated = True
                    generated_images += 1

                else:
                    failed_images += 1

            except Exception as exc:
                print(
                    f"Image generation failed for "
                    f"'{dish.name}': "
                    f"{type(exc).__name__}: {exc}"
                )

                failed_images += 1

    # ---------------------------------------------------------
    # 3. Return updated preview
    # ---------------------------------------------------------

    return {
        "generated_images": generated_images,
        "failed_images": failed_images,
        "menu": menu_data,
    }


# =========================================================
# CONFIRM / IMPORT MENU
# =========================================================

@router.post(
    "/branches/{branch_id}/confirm",
)
def confirm_menu_import(
    branch_id: int,
    menu_data: MenuImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ---------------------------------------------------------
    # 1. Verify branch ownership
    # ---------------------------------------------------------

    branch = verify_branch_access(
        db=db,
        branch_id=branch_id,
        current_user=current_user,
    )

    total_categories_created = 0
    total_dishes_created = 0

    total_categories_skipped = 0
    total_dishes_skipped = 0

    try:
        # -----------------------------------------------------
        # Prevent duplicate categories INSIDE uploaded menu
        # -----------------------------------------------------

        submitted_categories = set()

        for category_index, extracted_category in enumerate(
            menu_data.categories
        ):

            category_name = extracted_category.name.strip()

            if not category_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Category name cannot be empty.",
                )

            category_key = category_name.lower()

            # -------------------------------------------------
            # Duplicate category inside same upload
            # -------------------------------------------------

            if category_key in submitted_categories:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Duplicate category in uploaded menu: "
                        f"{category_name}"
                    ),
                )

            submitted_categories.add(category_key)

            # -------------------------------------------------
            # Find existing category
            # -------------------------------------------------

            existing_category = (
                db.query(Category)
                .filter(
                    Category.branch_id == branch.id,
                    Category.name.ilike(category_name),
                )
                .first()
            )

            # -------------------------------------------------
            # Reuse existing category
            # -------------------------------------------------

            if existing_category:
                category = existing_category
                total_categories_skipped += 1

                print(
                    f"Existing category reused: "
                    f"{category_name}"
                )

            # -------------------------------------------------
            # Create new category
            # -------------------------------------------------

            else:
                category = Category(
                    branch_id=branch.id,
                    name=category_name,
                    description=(
                        extracted_category.description.strip()
                        if extracted_category.description
                        else None
                    ),
                    display_order=category_index,
                    is_active=True,
                )

                db.add(category)

                # Get category ID before creating dishes
                db.flush()

                total_categories_created += 1

                print(
                    f"New category created: "
                    f"{category_name}"
                )

            # -------------------------------------------------
            # Prevent duplicate dishes INSIDE upload
            # -------------------------------------------------

            submitted_dishes = set()

            for extracted_dish in extracted_category.dishes:

                dish_name = extracted_dish.name.strip()

                if not dish_name:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Dish name cannot be empty.",
                    )

                # -------------------------------------------------
                # Price validation
                # -------------------------------------------------

                if extracted_dish.price is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Dish '{dish_name}' "
                            "is missing a price."
                        ),
                    )

                if extracted_dish.price <= 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Dish '{dish_name}' "
                            "must have a valid price."
                        ),
                    )

                dish_key = dish_name.lower()

                # -------------------------------------------------
                # Duplicate dish inside same uploaded category
                # -------------------------------------------------

                if dish_key in submitted_dishes:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Duplicate dish in "
                            f"category '{category_name}': "
                            f"{dish_name}"
                        ),
                    )

                submitted_dishes.add(dish_key)

                # -------------------------------------------------
                # Check existing dish
                #
                # IMPORTANT:
                # Check by branch + category + dish name.
                # This allows the same dish name in different
                # categories.
                # -------------------------------------------------

                existing_dish = (
                    db.query(Dish)
                    .filter(
                        Dish.branch_id == branch.id,
                        Dish.category_id == category.id,
                        Dish.name.ilike(dish_name),
                    )
                    .first()
                )

                # -------------------------------------------------
                # Skip existing dish
                # -------------------------------------------------

                if existing_dish:
                    total_dishes_skipped += 1

                    print(
                        f"Existing dish skipped: "
                        f"{category_name} -> "
                        f"{dish_name}"
                    )

                    continue

                # -------------------------------------------------
                # Create new dish
                # -------------------------------------------------

                dish = Dish(
                    branch_id=branch.id,
                    category_id=category.id,
                    name=dish_name,

                    description=(
                        extracted_dish.description.strip()
                        if extracted_dish.description
                        else None
                    ),

                    price=extracted_dish.price,

                    # Save generated/extracted image URL
                    image_url=(
                        extracted_dish.image_url.strip()
                        if extracted_dish.image_url
                        else None
                    ),

                    ingredients=(
                        extracted_dish.ingredients.strip()
                        if extracted_dish.ingredients
                        else None
                    ),

                    spice_level=extracted_dish.spice_level,

                    dietary_type=extracted_dish.dietary_type,

                    allergens=(
                        extracted_dish.allergens.strip()
                        if extracted_dish.allergens
                        else None
                    ),

                    serving_size=(
                        extracted_dish.serving_size.strip()
                        if extracted_dish.serving_size
                        else None
                    ),

                    is_available=True,
                )

                db.add(dish)

                total_dishes_created += 1

                print(
                    f"New dish created: "
                    f"{category_name} -> "
                    f"{dish_name}"
                )

        # -----------------------------------------------------
        # Save everything together
        # -----------------------------------------------------

        db.commit()

        print("\n========== MENU IMPORT SUCCESS ==========")
        print(
            f"Categories created: "
            f"{total_categories_created}"
        )
        print(
            f"Categories skipped: "
            f"{total_categories_skipped}"
        )
        print(
            f"Dishes created: "
            f"{total_dishes_created}"
        )
        print(
            f"Dishes skipped: "
            f"{total_dishes_skipped}"
        )
        print("=========================================\n")

        return {
            "message": "Menu imported successfully.",

            "categories_created": total_categories_created,
            "categories_skipped": total_categories_skipped,

            "dishes_created": total_dishes_created,
            "dishes_skipped": total_dishes_skipped,
        }

    # ---------------------------------------------------------
    # HTTP errors
    # ---------------------------------------------------------

    except HTTPException:
        db.rollback()
        raise

    # ---------------------------------------------------------
    # Database errors
    # ---------------------------------------------------------

    except SQLAlchemyError as exc:
        db.rollback()

        print("\n========== DATABASE ERROR ==========")
        print(f"Error type: {type(exc).__name__}")
        print(f"Error message: {exc}")
        print("====================================\n")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save menu.",
        )

    # ---------------------------------------------------------
    # Unexpected errors
    # ---------------------------------------------------------

    except Exception as exc:
        db.rollback()

        print("\n========== MENU IMPORT ERROR ==========")
        print(f"Error type: {type(exc).__name__}")
        print(f"Error message: {exc}")
        print("========================================\n")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Menu import failed.",
        )