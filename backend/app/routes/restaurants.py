import io

import cloudinary
import cloudinary.uploader

from PIL import Image

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    status,
)

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.restaurant import Restaurant
from app.models.user import User

from app.schemas.restaurant import (
    RestaurantCreate,
    RestaurantUpdate,
    RestaurantResponse,
)

from app.core.dependencies import get_current_user
from app.core.config import settings

from app.services.order_history import restaurant_has_order_history


router = APIRouter(
    prefix="/restaurants",
    tags=["Restaurants"],
)


# ---------------------------------------------------------
# RESTAURANT LOGO UPLOAD
# ---------------------------------------------------------

@router.post("/upload-logo")
async def upload_restaurant_logo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail="Only PNG, JPG and WEBP images are allowed.",
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    MAX_FILE_SIZE = 5 * 1024 * 1024

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Logo image must be 5 MB or smaller.",
        )

    # Validate the actual image instead of trusting
    # the browser-provided MIME type.

    try:
        with Image.open(io.BytesIO(contents)) as image:
            image.verify()

            if image.format not in {
                "JPEG",
                "PNG",
                "WEBP",
            }:
                raise ValueError("Unsupported image format")

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image.",
        )

    # Configure Cloudinary

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )

    try:
        result = cloudinary.uploader.upload(
            contents,
            folder="smart-menu/restaurant-logos",
            resource_type="image",
            transformation=[
                {
                    "width": 800,
                    "height": 800,
                    "crop": "limit",
                    "quality": "auto",
                    "fetch_format": "auto",
                }
            ],
        )

        return {
            "url": result["secure_url"]
        }

    except Exception:
        raise HTTPException(
            status_code=502,
            detail=(
                "Unable to upload the restaurant logo. "
                "Please try again."
            ),
        )


# ---------------------------------------------------------
# CREATE RESTAURANT
# ---------------------------------------------------------

@router.post(
    "",
    response_model=RestaurantResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_restaurant(
    restaurant_data: RestaurantCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    restaurant = Restaurant(
        owner_id=current_user.id,
        name=restaurant_data.name,
        description=restaurant_data.description,
        location=restaurant_data.location,
        logo_url=restaurant_data.logo_url,
    )

    db.add(restaurant)
    db.commit()
    db.refresh(restaurant)

    return restaurant


# ---------------------------------------------------------
# GET MY RESTAURANTS
# ---------------------------------------------------------

@router.get(
    "",
    response_model=list[RestaurantResponse],
)
def get_my_restaurants(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    return (
        db.query(Restaurant)
        .filter(
            Restaurant.owner_id == current_user.id
        )
        .all()
    )


# ---------------------------------------------------------
# GET SINGLE RESTAURANT
# ---------------------------------------------------------

@router.get(
    "/{restaurant_id}",
    response_model=RestaurantResponse,
)
def get_restaurant(
    restaurant_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    restaurant = (
        db.query(Restaurant)
        .filter(
            Restaurant.id == restaurant_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    return restaurant


# ---------------------------------------------------------
# UPDATE RESTAURANT
# ---------------------------------------------------------

@router.put(
    "/{restaurant_id}",
    response_model=RestaurantResponse,
)
def update_restaurant(
    restaurant_id: int,
    restaurant_data: RestaurantUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    restaurant = (
        db.query(Restaurant)
        .filter(
            Restaurant.id == restaurant_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    update_data = restaurant_data.model_dump(
        exclude_unset=True
    )

    for field, value in update_data.items():
        setattr(restaurant, field, value)

    db.commit()
    db.refresh(restaurant)

    return restaurant


# ---------------------------------------------------------
# DELETE RESTAURANT
# ---------------------------------------------------------

@router.delete(
    "/{restaurant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_restaurant(
    restaurant_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    restaurant = (
        db.query(Restaurant)
        .filter(
            Restaurant.id == restaurant_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    if restaurant_has_order_history(
        db,
        restaurant.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This restaurant has order history and cannot "
                "be deleted. Deactivate its branches instead "
                "to preserve historical orders."
            ),
        )

    try:
        db.delete(restaurant)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This restaurant is referenced by existing "
                "records and cannot be deleted. Deactivate it "
                "or its branches instead."
            ),
        )

    return None