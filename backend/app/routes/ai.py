from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from google.genai import errors as genai_errors

from app.core.rate_limit import limiter
from app.core.dependencies import get_db
from app.models.table import RestaurantTable
from app.schemas.ai import AIChatRequest, AIChatResponse
from app.services.ai_service import (
    extract_menu_intent,
    generate_menu_answer,
)
from app.services.menu_search import search_menu


router = APIRouter(
    prefix="/public/ai",
    tags=["Public AI"],
)


@router.post(
    "/chat/{qr_token}",
    response_model=AIChatResponse,
)
@limiter.limit("10/minute")
@limiter.limit("3/10seconds")
def chat_with_menu_ai(
    qr_token: str,
    request: Request,
    payload: AIChatRequest,
    db: Session = Depends(get_db),
):

    # ---------------------------------------------------------
    # Find table / branch
    # ---------------------------------------------------------

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.qr_token == qr_token,
            RestaurantTable.is_active.is_(True),
        )
        .first()
    )

    if not table or not table.branch:
        raise HTTPException(
            status_code=404,
            detail="Menu not found",
        )

    # ---------------------------------------------------------
    # Validate message
    # ---------------------------------------------------------

    customer_message = payload.message.strip()

    if not customer_message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty.",
        )

    # ---------------------------------------------------------
    # Conversation context
    # ---------------------------------------------------------

    conversation_context = ""

    for message in payload.history[-10:]:
        conversation_context += (
            f"{message.role}: {message.text}\n"
        )

    # ---------------------------------------------------------
    # STEP 1 — Extract intent
    # ---------------------------------------------------------

    try:

        print("\n========== GEMINI INTENT ==========")
        print("User message:", customer_message)

        intent = extract_menu_intent(
            customer_message=customer_message,
            conversation_context=conversation_context,
        )

        print("Extracted intent:", intent)
        print("===================================\n")

    except genai_errors.APIError as exc:

        print("\n========== GEMINI API ERROR ==========")
        print("Code:", getattr(exc, "code", None))
        print("Message:", getattr(exc, "message", str(exc)))
        print("======================================\n")

        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily unavailable.",
        )

    except Exception as exc:

        print("\n========== GEMINI INTENT ERROR ==========")
        print(type(exc).__name__)
        print(str(exc))
        print("=========================================\n")

        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily unavailable.",
        )

    # ---------------------------------------------------------
    # STEP 2 — Search menu
    # ---------------------------------------------------------

    try:

        dishes = search_menu(
            db=db,
            branch_id=table.branch_id,
            intent=intent,
            limit=8,
        )

        print("Matched dishes:", len(dishes))

    except Exception as exc:

        print("\n========== MENU SEARCH ERROR ==========")
        print(type(exc).__name__)
        print(str(exc))
        print("======================================\n")

        raise HTTPException(
            status_code=500,
            detail="Could not search the menu.",
        )

    # ---------------------------------------------------------
    # STEP 3 — Generate answer
    # ---------------------------------------------------------

    try:

        print("\n========== GEMINI ANSWER ==========")

        answer = generate_menu_answer(
            customer_message=customer_message,
            dishes=dishes,
            conversation_context=conversation_context,
        )

        print("Gemini answer:", answer)
        print("===================================\n")

    except genai_errors.APIError as exc:

        print("\n========== GEMINI API ERROR ==========")
        print("Code:", getattr(exc, "code", None))
        print("Message:", getattr(exc, "message", str(exc)))
        print("======================================\n")

        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily unavailable.",
        )

    except Exception as exc:

        print("\n========== GEMINI ANSWER ERROR ==========")
        print(type(exc).__name__)
        print(str(exc))
        print("=========================================\n")

        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily unavailable.",
        )

    if not answer:
        raise HTTPException(
            status_code=503,
            detail="AI returned an empty response.",
        )

    return AIChatResponse(
        answer=answer.strip()
    )