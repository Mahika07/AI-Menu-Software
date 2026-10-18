import re


MAX_MESSAGE_LENGTH = 500


def validate_customer_message(message: str) -> str:
    """
    Normalize and validate customer input before sending it
    to the AI service.
    """

    if not isinstance(message, str):
        raise ValueError("Invalid message")

    # Remove leading/trailing whitespace
    message = message.strip()

    if not message:
        raise ValueError("Message cannot be empty")

    if len(message) > MAX_MESSAGE_LENGTH:
        raise ValueError("Message is too long")

    # Remove control characters
    message = re.sub(r"[\x00-\x1f\x7f]", " ", message)

    # Collapse repeated whitespace
    message = re.sub(r"\s+", " ", message)

    return message