import json
import logging
from collections import Counter
from datetime import date, timedelta
from typing import Any, Optional

import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def _call_claude(prompt: str, max_tokens: int = 512) -> str:
    """Call Claude and return the text content of the first message block."""
    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


# ── parse_leave_request ───────────────────────────────────────────────────────

def parse_leave_request(text: str) -> dict[str, Any]:
    """
    Parse a natural-language leave request into structured data.
    Returns: {leave_type, start_date, end_date, reason, confidence}
    """
    today = date.today().isoformat()
    prompt = f"""Today's date is {today}.

A user wrote the following leave request in plain English:
"{text}"

Extract the following fields and return ONLY a valid JSON object — no markdown, no explanation:
{{
  "leave_type": "<sick|casual|earned|comp-off>",
  "start_date": "<YYYY-MM-DD>",
  "end_date": "<YYYY-MM-DD>",
  "reason": "<concise reason, max 100 chars>",
  "confidence": <0.0-1.0>
}}

Rules:
- Infer dates relative to today ({today}). "Next Monday" means the coming Monday.
- If only one day is mentioned, start_date == end_date.
- Choose leave_type: sick for medical/health, casual for personal/errands, earned for planned vacation/travel, comp-off for compensatory.
- If a field cannot be determined, use null.
- Return ONLY the JSON object."""

    try:
        raw = _call_claude(prompt)
        # Strip any accidental markdown fences
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(raw)
    except Exception as exc:
        logger.error("parse_leave_request failed: %s", exc)
        return {"leave_type": None, "start_date": None, "end_date": None, "reason": text[:100], "confidence": 0.0}


# ── categorize_leave_reason ───────────────────────────────────────────────────

def categorize_leave_reason(reason: str) -> str:
    """
    Categorize a leave reason into one of:
    medical, personal, travel, family, emergency, other
    """
    prompt = f"""Classify the following leave reason into exactly one category.
Categories: medical, personal, travel, family, emergency, other

Reason: "{reason}"

Return ONLY the single category word, lowercase, no punctuation."""

    try:
        result = _call_claude(prompt, max_tokens=16).lower().strip()
        valid = {"medical", "personal", "travel", "family", "emergency", "other"}
        return result if result in valid else "other"
    except Exception as exc:
        logger.error("categorize_leave_reason failed: %s", exc)
        return "other"


# ── detect_anomalies ──────────────────────────────────────────────────────────

def detect_anomalies(leave_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Analyse leave history for suspicious patterns.
    Returns list of AnomalyAlert dicts.
    """
    if not leave_history:
        return []

    alerts: list[dict[str, Any]] = []

    # Group by employee
    by_employee: dict[str, list[dict]] = {}
    for leave in leave_history:
        emp_id = str(leave.get("user_id", ""))
        by_employee.setdefault(emp_id, []).append(leave)

    for emp_id, leaves in by_employee.items():
        emp_name = leaves[0].get("employee_name", f"Employee {emp_id}")
        approved = [l for l in leaves if l.get("status") == "approved"]

        if not approved:
            continue

        # Pattern 1: always_monday_friday
        weekday_counts: Counter = Counter()
        for l in approved:
            try:
                d = date.fromisoformat(str(l["start_date"]))
                weekday_counts[d.weekday()] += 1
            except Exception:
                pass

        total_approved = len(approved)
        mon_fri = weekday_counts.get(0, 0) + weekday_counts.get(4, 0)
        if total_approved >= 4 and mon_fri / total_approved >= 0.7:
            alerts.append({
                "employee_id": emp_id,
                "employee_name": emp_name,
                "pattern": "always_monday_friday",
                "severity": "medium",
                "description": f"{emp_name} takes {mon_fri}/{total_approved} leaves on Mondays or Fridays, suggesting extended weekends.",
            })

        # Pattern 2: excessive_frequency — more than 8 leaves in a year
        if total_approved >= 8:
            alerts.append({
                "employee_id": emp_id,
                "employee_name": emp_name,
                "pattern": "excessive_frequency",
                "severity": "low" if total_approved < 12 else "high",
                "description": f"{emp_name} has {total_approved} approved leaves this year, which is above the typical threshold.",
            })

        # Pattern 3: sudden_spike — 3+ leaves in the last 30 days
        cutoff = date.today() - timedelta(days=30)
        recent = [
            l for l in approved
            if l.get("start_date") and date.fromisoformat(str(l["start_date"])) >= cutoff
        ]
        if len(recent) >= 3:
            alerts.append({
                "employee_id": emp_id,
                "employee_name": emp_name,
                "pattern": "sudden_spike",
                "severity": "medium",
                "description": f"{emp_name} has taken {len(recent)} leaves in the last 30 days — a sudden spike.",
            })

    # Use Claude to enrich descriptions if API key is available
    if settings.ANTHROPIC_API_KEY and alerts:
        try:
            summary = json.dumps([{"pattern": a["pattern"], "description": a["description"]} for a in alerts], indent=2)
            prompt = f"""You are an HR analytics assistant. Review these leave anomaly alerts and add a brief, professional recommendation for each.
Return ONLY a JSON array with the same length, each item having a "recommendation" field (max 80 chars).

Alerts:
{summary}"""
            raw = _call_claude(prompt, max_tokens=512)
            raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            enriched = json.loads(raw)
            for i, alert in enumerate(alerts):
                if i < len(enriched):
                    alert["recommendation"] = enriched[i].get("recommendation", "")
        except Exception as exc:
            logger.warning("Claude enrichment for anomalies failed: %s", exc)

    return alerts


# ── suggest_leave_plan ────────────────────────────────────────────────────────

def suggest_leave_plan(
    employee_id: int,
    balance: list[dict[str, Any]],
    upcoming_leaves: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Suggest optimal windows for using remaining leave before year end.
    Returns list of Suggestion dicts.
    """
    if not settings.ANTHROPIC_API_KEY:
        return []

    today = date.today().isoformat()
    year_end = date(date.today().year, 12, 31).isoformat()

    balance_summary = [
        {"leave_type": b.get("leave_type", {}).get("name", "Unknown"), "remaining": b.get("remaining", 0)}
        for b in balance
    ]
    upcoming_summary = [
        {"start": l.get("start_date"), "end": l.get("end_date"), "days": l.get("days")}
        for l in upcoming_leaves
    ]

    prompt = f"""Today is {today}. Year ends {year_end}.

Employee leave balance:
{json.dumps(balance_summary, indent=2)}

Already planned leaves:
{json.dumps(upcoming_summary, indent=2)}

Suggest 2-3 optimal windows to use remaining leave before year end.
Consider: public holidays, avoid peak work periods (month-end), suggest long weekends.

Return ONLY a JSON array:
[
  {{
    "leave_type": "<type name>",
    "suggested_start": "<YYYY-MM-DD>",
    "suggested_end": "<YYYY-MM-DD>",
    "days": <int>,
    "reason": "<why this window is good, max 100 chars>"
  }}
]"""

    try:
        raw = _call_claude(prompt, max_tokens=512)
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(raw)
    except Exception as exc:
        logger.error("suggest_leave_plan failed: %s", exc)
        return []
