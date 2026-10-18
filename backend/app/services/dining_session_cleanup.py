"""Deprecated: dining sessions are closed by restaurant staff only.

This module intentionally does not expire sessions automatically.
"""

def expire_old_dining_sessions(db) -> int:
    """Compatibility stub; never closes sessions based on elapsed time."""
    return 0
