import json
import logging
import re

logger = logging.getLogger("yesboss.financial_parser")

FINANCIAL_EXTRACT_SYSTEM = """You are a financial document analyzer. Extract structured financial metrics from the provided document text.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "revenue": {"value": number or null, "currency": "INR" or "USD" or null},
  "expenses": {"value": number or null, "currency": null},
  "net_profit": {"value": number or null, "currency": null},
  "gross_profit": {"value": number or null, "currency": null},
  "cash_flow": {"value": number or null, "currency": null},
  "burn_rate": {"value": number or null, "currency": null},
  "runway_months": number or null,
  "revenue_growth_pct": number or null,
  "expense_growth_pct": number or null,
  "profit_margin_pct": number or null,
  "document_type": "pnl" | "budget" | "balance_sheet" | "cash_flow" | "financial_report" | "other",
  "period": {"start": "YYYY-MM-DD" or null, "end": "YYYY-MM-DD" or null},
  "key_risks": ["brief risk description"] or [],
  "notes": "one-sentence summary of financial health"
}

Rules:
- Extract values exactly as stated in the document. If not found, use null.
- Infer currency from context (₹, Rs, INR = INR; $, USD = USD). Default to INR.
- For profit_margin_pct, calculate if not stated: (net_profit / revenue) * 100.
- If the document contains no financial data at all, return {"document_type": "other", "notes": "No financial data found in this document"}.
"""


async def extract_financial_metrics(text: str, filename: str = "") -> dict:
    """Extract structured financial metrics from document text using AI.

    Returns:
        dict with keys: revenue, expenses, net_profit, gross_profit, cash_flow,
                        burn_rate, runway_months, revenue_growth_pct,
                        expense_growth_pct, profit_margin_pct, document_type,
                        period, key_risks, notes
    """
    from .ai_client import get_ai_response

    if not text or len(text.strip()) < 20:
        return {"document_type": "other", "notes": "Document too short to analyze"}

    try:
        prompt = f"Document: {filename}\n\nText:\n{text[:15000]}"
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=FINANCIAL_EXTRACT_SYSTEM,
            temperature=0.1,
            max_tokens=1000,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        result = json.loads(cleaned)
        if not isinstance(result, dict):
            return {"document_type": "other", "notes": "Parse error"}
        return result
    except Exception as e:
        logger.warning(f"Financial extraction failed for {filename}: {e}")
        return {"document_type": "other", "notes": f"Extraction error: {e}"}


def compute_trend(current: dict, previous: dict | None) -> dict:
    """Compare current metrics against previous and compute changes."""
    if not previous:
        return {}

    trends = {}
    numeric_fields = [
        "revenue", "expenses", "net_profit", "gross_profit",
        "cash_flow", "burn_rate", "runway_months",
        "revenue_growth_pct", "expense_growth_pct", "profit_margin_pct",
    ]
    for field in numeric_fields:
        curr_val = None
        prev_val = None
        if isinstance(current.get(field), dict):
            curr_val = current[field].get("value")
        else:
            curr_val = current.get(field)

        if isinstance(previous.get(field), dict):
            prev_val = previous[field].get("value")
        else:
            prev_val = previous.get(field)

        if curr_val is not None and prev_val is not None and prev_val != 0:
            pct_change = round(((curr_val - prev_val) / abs(prev_val)) * 100, 1)
            trends[field] = {
                "current": curr_val,
                "previous": prev_val,
                "change_pct": pct_change,
                "direction": "up" if pct_change > 0 else "down" if pct_change < 0 else "flat",
            }

    return trends
