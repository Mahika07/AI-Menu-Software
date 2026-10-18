from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(
        pattern="^(user|assistant)$"
    )

    text: str = Field(
        min_length=1,
        max_length=500
    )


class AIChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=500
    )

    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=10
    )


class AIChatResponse(BaseModel):
    answer: str


class MenuIntent(BaseModel):
    """
    Structured intent extracted from the customer's message.

    Prices are strings intentionally.
    They are converted to Decimal later inside menu_search.py.
    """

    # ---------------------------------------------------------
    # Dietary preference
    # ---------------------------------------------------------

    dietary_type: str | None = None

    # ---------------------------------------------------------
    # Spice preference
    # ---------------------------------------------------------

    spice_level: str | None = None

    # ---------------------------------------------------------
    # Price filters
    # ---------------------------------------------------------

    max_price: str | None = None
    min_price: str | None = None

    # ---------------------------------------------------------
    # Dish / ingredient search
    # ---------------------------------------------------------

    search_term: str | None = None

    # ---------------------------------------------------------
    # Category search
    # ---------------------------------------------------------
    #
    # Examples:
    #
    # "Show me desserts"
    # -> category = "dessert"
    #
    # "What starters do you have?"
    # -> category = "starter"
    #

    category: str | None = None

    # ---------------------------------------------------------
    # Sorting
    # ---------------------------------------------------------
    #
    # Currently supported:
    #
    # sort_by = price
    #
    # sort_order:
    # asc  = cheapest first
    # desc = most expensive first
    #

    sort_by: str | None = None
    sort_order: str | None = None

    # ---------------------------------------------------------
    # Allergen exclusions
    # ---------------------------------------------------------

    exclude_allergens: list[str] = Field(
        default_factory=list
    )