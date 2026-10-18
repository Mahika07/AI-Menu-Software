from decimal import Decimal, InvalidOperation

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.dish import Dish
from app.schemas.ai import MenuIntent


# =========================================================
# SEARCH SYNONYMS
# =========================================================

SEARCH_SYNONYMS = {
    "paneer": [
        "paneer",
        "cottage cheese",
        "indian cottage cheese",
    ],

    "fries": [
        "fries",
        "french fries",
    ],

    "soft drink": [
        "soft drink",
        "soda",
        "cold drink",
        "soft beverage",
    ],

    "ice cream": [
        "ice cream",
        "icecream",
    ],

    "chicken": [
        "chicken",
    ],

    "mutton": [
        "mutton",
        "goat",
    ],

    "fish": [
        "fish",
    ],

    "seafood": [
        "seafood",
        "prawns",
        "prawn",
        "shrimp",
        "fish",
    ],
}


# =========================================================
# CATEGORY SYNONYMS
# =========================================================

CATEGORY_SYNONYMS = {
    "starter": [
        "starter",
        "starters",
        "appetizer",
        "appetizers",
        "snack",
        "snacks",
    ],

    "main course": [
        "main course",
        "main courses",
        "main",
        "mains",
        "entree",
        "entrees",
    ],

    "dessert": [
        "dessert",
        "desserts",
        "sweet",
        "sweets",
    ],

    "beverage": [
        "beverage",
        "beverages",
        "drink",
        "drinks",
        "drinks",
    ],

    "pizza": [
        "pizza",
        "pizzas",
    ],

    "burger": [
        "burger",
        "burgers",
    ],

    "salad": [
        "salad",
        "salads",
    ],

    "soup": [
        "soup",
        "soups",
    ],
}


# =========================================================
# ALLERGEN SYNONYMS
# =========================================================

ALLERGEN_SYNONYMS = {
    "peanut": [
        "peanut",
        "peanuts",
        "groundnut",
        "groundnuts",
    ],

    "tree_nut": [
        "nut",
        "nuts",
        "almond",
        "almonds",
        "cashew",
        "cashews",
        "walnut",
        "walnuts",
        "pistachio",
        "pistachios",
        "hazelnut",
        "hazelnuts",
    ],

    "milk": [
        "milk",
        "dairy",
        "butter",
        "cream",
        "cheese",
        "paneer",
    ],

    "egg": [
        "egg",
        "eggs",
    ],

    "soy": [
        "soy",
        "soya",
        "soybean",
    ],

    "gluten": [
        "gluten",
        "wheat",
    ],

    "shellfish": [
        "shellfish",
        "prawn",
        "prawns",
        "shrimp",
        "shrimps",
    ],
}


# =========================================================
# HELPERS
# =========================================================

def get_search_terms(
    search_term: str,
) -> list[str]:
    """
    Convert a customer's search term into searchable
    synonyms.
    """

    normalized = search_term.strip().lower()

    if not normalized:
        return []

    terms = [normalized]

    for key, synonyms in SEARCH_SYNONYMS.items():

        if (
            key in normalized
            or normalized in synonyms
        ):
            terms.extend(synonyms)

    return list(
        dict.fromkeys(terms)
    )


def get_category_terms(
    category: str,
) -> list[str]:
    """
    Convert a category into searchable category names.

    Example:

        dessert

    becomes:

        dessert
        desserts
        sweet
        sweets
    """

    normalized = (
        category.strip().lower()
    )

    if not normalized:
        return []

    terms = [normalized]

    for key, synonyms in CATEGORY_SYNONYMS.items():

        if (
            normalized == key
            or normalized in synonyms
        ):
            terms.extend(synonyms)

    return list(
        dict.fromkeys(terms)
    )


def detect_allergens(
    customer_message: str,
) -> list[str]:
    """
    Detect allergen-related words in the customer's message.
    """

    message = customer_message.lower()

    detected = []

    for allergen, terms in ALLERGEN_SYNONYMS.items():

        if any(
            term in message
            for term in terms
        ):
            detected.append(allergen)

    return detected


def normalize_allergen(
    allergen: str,
) -> str | None:
    """
    Normalize allergen names.

    Examples:

        nuts -> tree_nut
        dairy -> milk
    """

    if not allergen:
        return None

    normalized = (
        str(allergen)
        .strip()
        .lower()
    )

    if not normalized:
        return None

    if normalized in ALLERGEN_SYNONYMS:
        return normalized

    for key, terms in ALLERGEN_SYNONYMS.items():

        if normalized in terms:
            return key

    return normalized


def parse_price(
    value: str | None,
) -> Decimal | None:
    """
    Safely convert Gemini's string price into Decimal.
    """

    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    try:

        price = Decimal(value)

        if price < 0:
            return None

        return price

    except (
        InvalidOperation,
        ValueError,
        TypeError,
    ):
        return None


def dish_contains_allergen(
    dish: Dish,
    allergen: str,
) -> bool:
    """
    Check whether a dish's recorded allergen information
    contains the requested allergen.

    Missing allergen information is NOT considered safe.
    """

    allergens = (
        dish.allergens or ""
    ).strip().lower()

    if not allergens:
        return False

    normalized_allergen = normalize_allergen(
        allergen
    )

    if not normalized_allergen:
        return False

    terms = ALLERGEN_SYNONYMS.get(
        normalized_allergen,
        [normalized_allergen],
    )

    return any(
        term in allergens
        for term in terms
    )


def get_excluded_allergens(
    intent: MenuIntent,
) -> list[str]:
    """
    Return normalized allergen exclusions.
    """

    normalized = []

    for allergen in (
        intent.exclude_allergens or []
    ):

        value = normalize_allergen(
            allergen
        )

        if value and value not in normalized:
            normalized.append(value)

    return normalized


def normalize_category(
    category: str | None,
) -> str | None:
    """
    Normalize category names.

    Example:

        "desserts" -> "dessert"
        "starters" -> "starter"
    """

    if not category:
        return None

    normalized = (
        category.strip().lower()
    )

    if not normalized:
        return None

    for key, synonyms in CATEGORY_SYNONYMS.items():

        if (
            normalized == key
            or normalized in synonyms
        ):
            return key

    return normalized


def category_matches(
    dish: Dish,
    category: str,
) -> bool:
    """
    Check whether the dish belongs to the requested
    category.

    Category names come from the restaurant's database,
    so matching is done against the actual Category name.
    """

    if not dish.category:
        return False

    category_name = (
        dish.category.name or ""
    ).strip().lower()

    if not category_name:
        return False

    normalized_category = normalize_category(
        category
    )

    if not normalized_category:
        return False

    category_terms = get_category_terms(
        normalized_category
    )

    return any(
        term == category_name
        or term in category_name
        or category_name in term
        for term in category_terms
    )


# =========================================================
# RELEVANCE SCORING
# =========================================================

def calculate_relevance_score(
    dish: Dish,
    intent: MenuIntent,
) -> int:

    score = 0

    search_term = (
        intent.search_term.strip().lower()
        if intent.search_term
        else ""
    )

    max_price = parse_price(
        intent.max_price
    )

    min_price = parse_price(
        intent.min_price
    )

    # -----------------------------------------------------
    # Search relevance
    # -----------------------------------------------------

    if search_term:

        terms = get_search_terms(
            search_term
        )

        name = (
            dish.name or ""
        ).lower()

        description = (
            dish.description or ""
        ).lower()

        ingredients = (
            dish.ingredients or ""
        ).lower()

        for term in terms:

            if term == name:
                score += 100

            elif term in name:
                score += 60

            elif term in ingredients:
                score += 40

            elif term in description:
                score += 20

    # -----------------------------------------------------
    # Category match
    # -----------------------------------------------------

    if intent.category:

        if category_matches(
            dish,
            intent.category,
        ):
            score += 70

    # -----------------------------------------------------
    # Dietary match
    # -----------------------------------------------------

    if (
        intent.dietary_type
        and dish.dietary_type
        == intent.dietary_type
    ):
        score += 50

    # -----------------------------------------------------
    # Spice match
    # -----------------------------------------------------

    if (
        intent.spice_level
        and dish.spice_level
        == intent.spice_level
    ):
        score += 40

    # -----------------------------------------------------
    # Maximum price preference
    # -----------------------------------------------------

    if max_price is not None:

        if dish.price <= max_price:

            score += 20

            difference = float(
                max_price - dish.price
            )

            if difference <= 50:
                score += 10

    # -----------------------------------------------------
    # Minimum price preference
    # -----------------------------------------------------

    if min_price is not None:

        if dish.price >= min_price:
            score += 20

    return score


# =========================================================
# MENU SEARCH
# =========================================================

def search_menu(
    db: Session,
    branch_id: int,
    intent: MenuIntent,
    limit: int = 8,
):
    """
    Search and rank dishes for the customer's request.

    Flow:

        Gemini
          ↓
        MenuIntent
          ↓
        Category
          ↓
        Dietary filter
          ↓
        Spice filter
          ↓
        Price filter
          ↓
        Text search
          ↓
        Candidate pool
          ↓
        Allergen exclusions
          ↓
        Relevance ranking
          ↓
        Sorting
          ↓
        Top dishes
    """

    # -----------------------------------------------------
    # Base query
    # -----------------------------------------------------

    query = (
        db.query(Dish)
        .filter(
            Dish.branch_id == branch_id,
            Dish.is_available.is_(True),
        )
    )

    # -----------------------------------------------------
    # Convert prices
    # -----------------------------------------------------

    max_price = parse_price(
        intent.max_price
    )

    min_price = parse_price(
        intent.min_price
    )

    # -----------------------------------------------------
    # Structured filters
    # -----------------------------------------------------

    if intent.dietary_type:

        query = query.filter(
            Dish.dietary_type
            == intent.dietary_type
        )

    if intent.spice_level:

        query = query.filter(
            Dish.spice_level
            == intent.spice_level
        )

    if max_price is not None:

        query = query.filter(
            Dish.price <= max_price
        )

    if min_price is not None:

        query = query.filter(
            Dish.price >= min_price
        )

    # -----------------------------------------------------
    # Text search
    # -----------------------------------------------------

    if intent.search_term:

        search_terms = get_search_terms(
            intent.search_term
        )

        conditions = []

        for term in search_terms:

            search = f"%{term}%"

            conditions.extend(
                [
                    Dish.name.ilike(search),

                    Dish.description.ilike(
                        search
                    ),

                    Dish.ingredients.ilike(
                        search
                    ),
                ]
            )

        if conditions:

            query = query.filter(
                or_(*conditions)
            )

    # -----------------------------------------------------
    # Candidate pool
    # -----------------------------------------------------

    candidates = (
        query
        .order_by(Dish.id)
        .limit(50)
        .all()
    )

    # -----------------------------------------------------
    # Category filter
    # -----------------------------------------------------

    if intent.category:

        candidates = [
            dish
            for dish in candidates
            if category_matches(
                dish,
                intent.category,
            )
        ]

    # -----------------------------------------------------
    # Allergen exclusions
    # -----------------------------------------------------

    excluded_allergens = (
        get_excluded_allergens(intent)
    )

    if excluded_allergens:

        filtered_candidates = []

        for dish in candidates:

            contains_excluded_allergen = any(
                dish_contains_allergen(
                    dish,
                    allergen,
                )
                for allergen in excluded_allergens
            )

            if not contains_excluded_allergen:
                filtered_candidates.append(dish)

        candidates = filtered_candidates

    # -----------------------------------------------------
    # Rank candidates
    # -----------------------------------------------------

    ranked = sorted(
        candidates,
        key=lambda dish:
            calculate_relevance_score(
                dish,
                intent,
            ),
        reverse=True,
    )

    # -----------------------------------------------------
    # Price sorting
    # -----------------------------------------------------

    if intent.sort_by == "price":

        if intent.sort_order == "desc":

            ranked = sorted(
                ranked,
                key=lambda dish: dish.price,
                reverse=True,
            )

        else:

            ranked = sorted(
                ranked,
                key=lambda dish: dish.price,
            )

    # -----------------------------------------------------
    # Return top results
    # -----------------------------------------------------

    return ranked[:limit]