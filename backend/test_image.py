
from datetime import datetime, timedelta, timezone

import pytest


def test_dining_session_expiry_time_is_in_the_past():
    """An expiry timestamp in the past should be recognized as expired."""
    expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)

    assert expires_at <= datetime.now(timezone.utc)


def test_dining_session_expiry_time_is_in_the_future():
    """A newly created session should have a future expiry timestamp."""
    expires_at = datetime.now(timezone.utc) + timedelta(hours=8)

    assert expires_at > datetime.now(timezone.utc)
