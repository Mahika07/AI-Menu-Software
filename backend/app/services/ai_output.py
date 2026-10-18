def validate_ai_answer(answer: str) -> str:
    """
    Basic validation for AI-generated customer responses.
    """

    if not answer:
        return (
            "Sorry, I couldn't generate a recommendation."
        )

    answer = answer.strip()

    # Hard limit for customer-facing responses
    if len(answer) > 2000:
        answer = answer[:2000].rstrip() + "..."

    return answer