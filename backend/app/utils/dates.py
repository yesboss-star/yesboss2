"""Due-date normalisation shared by every writer of ``tasks.due_date`` / ``goals.due_date``.

Deadline jobs compare ``due_date`` as an ISO *string* against ``datetime.utcnow().isoformat()``,
so every writer must store the same shape. A calendar date with no time means "end of that
day": storing it as ``T00:00:00`` made tasks look overdue the moment their due day began.
"""
import re
from datetime import UTC, datetime

_DMY = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$")
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Midnight with no real time of day (date pickers, Excel exports, "…T00:00:00.000Z").
_MIDNIGHT = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?$")

END_OF_DAY = "T23:59:59"


def normalize_due_date(value):
    """Return ``YYYY-MM-DDTHH:MM:SS`` (naive) for a due date; falsy values pass through."""
    if not value:
        return value
    v = str(value).strip().replace("Z", "").replace("+00:00", "")
    m = _DMY.match(v)
    if m:  # bulk imports / Zoho: dd/mm/yyyy
        day, month, year = m.groups()
        v = f"{year}-{int(month):02d}-{int(day):02d}"
    m = _MIDNIGHT.match(v)
    if m:
        v = m.group(1)
    if _DATE_ONLY.match(v):
        v += END_OF_DAY
    return v


def parse_meeting_dt(raw, naive_tz=UTC) -> datetime | None:
    """Parse a stored meeting start/end into an aware UTC datetime.

    Meetings are stored as strings in several shapes: ISO (Google / assistant bookings,
    with or without an offset) and Zoho's compact ``20261031T100000+0530``. Values with
    no offset are interpreted in ``naive_tz``.
    """
    if isinstance(raw, datetime):
        dt = raw
    else:
        text = str(raw or "").strip()
        if not text:
            return None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            dt = None
            for fmt in ("%Y%m%dT%H%M%S%z", "%Y%m%dT%H%M%S"):
                try:
                    dt = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
            if dt is None:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=naive_tz)
    return dt.astimezone(UTC)
