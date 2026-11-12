"""Hindi and Hinglish support for the built-in (no AI key) rules.

The capture rules look for English words ("revenue", "minutes of meeting", "Action:"). Teams write
and speak Hindi, and Hinglish (Hindi in Roman letters), so for *matching only* this module maps a
small vocabulary of business words, units, digits and question words to their English equivalents.
The text that is stored and shown is never changed. With an AI key configured the model reads any
language directly; this is the fallback, so it is deliberately small and best-effort.
"""
import re

_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

# Longest phrases first, so "कम करना" is read before "कम".
_TERMS: list[tuple[str, str]] = [
    # units
    ("करोड़", "crore"), ("करोड", "crore"), ("लाख", "lakh"), ("हज़ार", "k"), ("हजार", "k"), ("प्रतिशत", "%"),
    ("crore", "crore"), ("lakh", "lakh"),
    # business words
    ("बिक्री", "sales"), ("राजस्व", "revenue"), ("आमदनी", "revenue"), ("मुनाफ़ा", "profit"), ("मुनाफा", "profit"),
    ("लाभ", "profit"), ("खर्चा", "expenses"), ("खर्च", "expenses"), ("लागत", "cost"), ("ऑर्डर", "orders"),
    ("ग्राहक", "customers"), ("पाइपलाइन", "pipeline"), ("वसूली", "collections"),
    ("बैठक", "meeting"), ("मीटिंग", "meeting"), ("मिनट्स", "minutes of meeting"), ("उपस्थित", "attendees"),
    ("एजेंडा", "agenda"), ("निर्णय", "decisions"), ("कार्य सूची", "action items"),
    ("विचार", "idea"), ("सुझाव", "suggestion"), ("रिपोर्ट", "report"),
    # directions
    ("बढ़ाना", "increase"), ("बढ़ाएं", "increase"), ("बढ़ाएँ", "increase"), ("बढ़ाओ", "increase"), ("बढ़ोतरी", "increase"),
    ("घटाना", "reduce"), ("घटाएं", "reduce"), ("घटाएँ", "reduce"), ("कम करना", "reduce"), ("कम करें", "reduce"),
    # questions
    ("क्या", "what"), ("कैसे", "how"), ("क्यों", "why"), ("कब", "when"), ("कौन", "who"), ("कहाँ", "where"),
    # Hinglish (Roman letters)
    ("baithak", "meeting"), ("bikri", "sales"), ("munafa", "profit"), ("munaafa", "profit"), ("kharcha", "expenses"),
    ("kharch", "expenses"), ("lagat", "cost"), ("vichar", "idea"), ("sujhav", "suggestion"),
    ("badhana", "increase"), ("badhao", "increase"), ("ghatana", "reduce"), ("kam karna", "reduce"),
    ("kya", "what"), ("kaise", "how"), ("kyun", "why"), ("kyu", "why"), ("kab", "when"), ("kaun", "who"), ("kahan", "where"),
]
_TERMS.sort(key=lambda pair: -len(pair[0]))
_ROMAN = [(re.compile(rf"\b{re.escape(hi)}\b", re.I), en) for hi, en in _TERMS if hi.isascii()]
_NATIVE = [(hi, en) for hi, en in _TERMS if not hi.isascii()]

# Line markers for actions, in Hindi and Hinglish: "कार्य: ...", "kaam - ..."
ACTION_MARKERS = "कार्रवाई|कार्य|काम|अगला कदम|karya|kaam|agla kadam"
# "5/12/2026 तक" / "5/12/2026 tak"
DUE_SUFFIX = r"(?:तक|tak)"


def ascii_digits(text: str) -> str:
    """Devanagari digits to ASCII, so dates and amounts parse."""
    return (text or "").translate(_DIGITS)


def english_terms(text: str) -> str:
    """Lower-cased text with the known Hindi / Hinglish business words replaced by English ones.
    For matching only: never store or show the result."""
    out = ascii_digits(text or "").lower()
    for hi, en in _NATIVE:
        if hi in out:
            out = out.replace(hi, f" {en} ")
    for pattern, en in _ROMAN:
        out = pattern.sub(en, out)
    return re.sub(r"[ \t]+", " ", out).strip()
