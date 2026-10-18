def check_allergen_information(
    dish,
    requested_allergens: list[str],
) -> str:

    if not requested_allergens:
        return "not_applicable"

    if not dish.allergens:
        return "unknown"

    allergens_text = dish.allergens.lower()

    for allergen in requested_allergens:

        if allergen == "peanut":
            terms = [
                "peanut",
                "groundnut",
            ]

        elif allergen == "tree_nut":
            terms = [
                "almond",
                "cashew",
                "walnut",
                "pistachio",
                "hazelnut",
            ]

        elif allergen == "milk":
            terms = [
                "milk",
                "dairy",
                "butter",
                "cream",
                "cheese",
                "paneer",
            ]

        elif allergen == "egg":
            terms = [
                "egg",
            ]

        elif allergen == "soy":
            terms = [
                "soy",
                "soya",
            ]

        elif allergen == "gluten":
            terms = [
                "gluten",
                "wheat",
            ]

        elif allergen == "shellfish":
            terms = [
                "shellfish",
                "prawn",
                "shrimp",
            ]

        else:
            terms = [allergen]

        if any(term in allergens_text for term in terms):
            return "contains"

    return "not_listed"