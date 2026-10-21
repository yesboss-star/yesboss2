import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from .ai_client import get_ai_response

logger = logging.getLogger("yesboss.report_generator")


async def generate_employee_report(
    db: Any,
    org_id: str,
    employee_email: str,
    period: str = "weekly"
) -> dict:
    cutoff = _get_period_cutoff(period)

    tasks = list(db.tasks.find({
        "organization_id": org_id,
        "$or": [
            {"assignee_email": employee_email},
            {"assignee_id": employee_email},
        ],
    }).sort("created_at", -1))

    period_tasks = [t for t in tasks if _within_period(t.get("created_at"), t.get("due_date"), cutoff)]
    completed = [t for t in period_tasks if t.get("status") == "completed"]
    overdue = [t for t in period_tasks if t.get("due_date") and t.get("status") not in ("completed", "approved") and _is_overdue(t.get("due_date"))]
    in_progress = [t for t in period_tasks if t.get("status") == "in_progress"]
    pending = [t for t in period_tasks if t.get("status") == "pending"]
    total = len(period_tasks)
    done = len(completed)
    completion_rate = round((done / total * 100), 1) if total > 0 else 0.0

    avg_completion_hours = 0.0
    completion_times = []
    for t in completed:
        created = t.get("created_at")
        completed_at = t.get("completed_at") or t.get("updated_at")
        if created and completed_at:
            try:
                delta = (datetime.fromisoformat(str(completed_at).replace("Z", "")) if isinstance(completed_at, str) else completed_at) - (
                    datetime.fromisoformat(str(created).replace("Z", "")) if isinstance(created, str) else created
                )
                hours = delta.total_seconds() / 3600
                if hours > 0:
                    completion_times.append(hours)
            except Exception:
                pass
    if completion_times:
        avg_completion_hours = round(sum(completion_times) / len(completion_times), 1)

    goals_touched = list(set(
        t.get("goal_id") or t.get("goal_title", "") for t in period_tasks if t.get("goal_id") or t.get("goal_title")
    ))

    escalated = [t for t in period_tasks if t.get("escalation_level", 0) > 0]
    escalated_count = len(escalated)
    avg_overdue_days = 0.0
    overdue_days_list = []
    now = datetime.utcnow()
    for t in overdue:
        due = t.get("due_date")
        if due:
            try:
                d = datetime.fromisoformat(str(due).replace("Z", "")) if isinstance(due, str) else due
                overdue_days_list.append((now - d).days)
            except Exception:
                pass
    if overdue_days_list:
        avg_overdue_days = round(sum(overdue_days_list) / len(overdue_days_list), 1)

    member = db.org_chart_members.find_one({"email": employee_email.lower(), "organization_id": org_id})
    employee_name = member.get("full_name", employee_email) if member else employee_email
    department = member.get("department", "") if member else ""
    manager_email = member.get("manager_email", "") if member else ""

    escalation_lines = []
    for t in escalated:
        level = t.get("escalation_level", 0)
        label = "manager" if level == 1 else "owner"
        days_overdue = 0
        due = t.get("due_date")
        if due:
            try:
                d = datetime.fromisoformat(str(due).replace("Z", "")) if isinstance(due, str) else due
                days_overdue = (now - d).days
            except Exception:
                pass
        escalation_lines.append(f"  - \"{t.get('title', 'Unknown')}\" overdue {days_overdue}d, escalated to {label}")
    escalation_section = "[Escalated Tasks]\n" + "\n".join(escalation_lines) if escalation_lines else ""

    import hashlib
    org_ref = hashlib.sha256(org_id.encode()).hexdigest()[:16]
    emp_freqs = list(db.employee_frequencies.find({"org_ref": org_ref, "employee_role": employee_email}))
    work_patterns = []
    for f in emp_freqs:
        work_patterns.append(
            f"{f.get('work_category', 'general')} ({f.get('level', 'intermediate')}, "
            f"~{f.get('avg_completion_hours', 4):.1f}h avg, {f.get('frequency_per_week', 0):.1f}x/week)"
        )
    org_freqs = list(db.employee_frequencies.find({"org_ref": org_ref}))
    org_avg_by_cat = {}
    for f in org_freqs:
        cat = f.get("work_category", "general")
        if cat not in org_avg_by_cat:
            org_avg_by_cat[cat] = {"total_hours": 0, "count": 0}
        org_avg_by_cat[cat]["total_hours"] += f.get("avg_completion_hours", 4)
        org_avg_by_cat[cat]["count"] += 1
    comparison_lines = []
    for f in emp_freqs:
        cat = f.get("work_category", "general")
        emp_avg = f.get("avg_completion_hours", 4)
        org_avg = org_avg_by_cat.get(cat, {}).get("total_hours", 0) / max(org_avg_by_cat.get(cat, {}).get("count", 1), 1)
        diff = emp_avg - org_avg
        if diff < -1:
            comparison_lines.append(f"  - {cat}: {emp_avg:.1f}h (vs org avg {org_avg:.1f}h) — faster")
        elif diff > 1:
            comparison_lines.append(f"  - {cat}: {emp_avg:.1f}h (vs org avg {org_avg:.1f}h) — slower")
        else:
            comparison_lines.append(f"  - {cat}: {emp_avg:.1f}h (vs org avg {org_avg:.1f}h) — on par")

    ai_feedback = ""
    work_patterns_section = "[Work Patterns]\n" + "\n".join(work_patterns) if work_patterns else ""
    comparison_section = "[Org Comparison]\n" + "\n".join(comparison_lines) if comparison_lines else ""
    prompt = (
        f"Employee Performance Report for {period} period.\n"
        f"Name: {employee_name}\n"
        f"Department: {department}\n"
        f"Total tasks: {total}\n"
        f"Completed: {done}\n"
        f"Pending: {pending}\n"
        f"In Progress: {in_progress}\n"
        f"Overdue: {len(overdue)} (avg {avg_overdue_days}d overdue)\n"
        f"Escalated: {escalated_count}\n"
        f"Completion rate: {completion_rate}%\n"
        f"Average completion time: {avg_completion_hours}h\n"
        f"Goals contributed to: {len(goals_touched)}\n"
        f"Manager: {manager_email}\n"
        f"{escalation_section}\n"
        f"{work_patterns_section}\n"
        f"{comparison_section}\n"
        f"Provide 2-3 sentences of constructive feedback highlighting strengths and areas for improvement. "
        f"Reference their work patterns and org comparison where relevant. "
        f"Flag any concerning escalation patterns."
    )
    try:
        ai_feedback = await get_ai_response(prompt)
    except Exception as e:
        logger.warning(f"AI feedback failed for employee report: {e}")
        ai_feedback = "AI feedback unavailable at this time."

    cliq_engagement = _cliq_engagement(db, org_id, employee_email, cutoff)

    return {
        "employee_email": employee_email,
        "employee_name": employee_name,
        "department": department,
        "manager_email": manager_email,
        "period": period,
        "generated_at": datetime.utcnow().isoformat(),
        "metrics": {
            "total_tasks": total,
            "completed_tasks": done,
            "pending_tasks": len(pending),
            "in_progress_tasks": len(in_progress),
            "overdue_tasks": len(overdue),
            "avg_overdue_days": avg_overdue_days,
            "escalated_tasks": escalated_count,
            "completion_rate": completion_rate,
            "avg_completion_hours": avg_completion_hours,
            "goals_touched": len(goals_touched),
        },
        "escalation": {
            "total": escalated_count,
            "items": escalation_lines,
            "manager_notified": manager_email if escalated_count else "",
        },
        "work_patterns": {
            "categories": work_patterns,
            "org_comparison": comparison_lines,
        },
        "ai_feedback": ai_feedback,
        "cliq_engagement": cliq_engagement,
    }


def _get_period_cutoff(period: str) -> datetime:
    now = datetime.utcnow()
    if period == "weekly":
        return now - timedelta(days=7)
    elif period == "monthly":
        return now - timedelta(days=30)
    elif period == "quarterly":
        return now - timedelta(days=90)
    return now - timedelta(days=7)


def _within_period(created_at, due_date, cutoff: datetime) -> bool:
    for dt in [created_at, due_date]:
        if dt:
            try:
                d = datetime.fromisoformat(str(dt).replace("Z", "")) if isinstance(dt, str) else dt
                if d >= cutoff:
                    return True
            except Exception:
                continue
    return False


def _is_overdue(due_date) -> bool:
    if not due_date:
        return False
    try:
        d = datetime.fromisoformat(str(due_date).replace("Z", "")) if isinstance(due_date, str) else due_date
        return d < datetime.utcnow()
    except Exception:
        return False


def _as_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "").replace("+00:00", ""))
    except Exception:
        return None


def _response_hours(messages: list[dict[str, Any]]) -> list[float]:
    """Hours between each outbound nudge and the next inbound reply."""
    hours: list[float] = []
    pending_out: datetime | None = None
    for msg in sorted(messages, key=lambda m: _as_dt(m.get("ts")) or datetime.min):
        ts = _as_dt(msg.get("ts"))
        if msg.get("dir") == "out":
            pending_out = ts
        elif msg.get("dir") == "in" and pending_out and ts:
            delta = (ts - pending_out).total_seconds() / 3600
            if delta >= 0:
                hours.append(delta)
            pending_out = None
    return hours


def _cliq_engagement(db: Any, org_id: str, employee_email: str, cutoff: datetime) -> dict[str, Any]:
    """Additive Cliq stats for one employee (never breaks report generation)."""
    empty = {
        "threads": 0,
        "replies": 0,
        "avg_response_hours": 0.0,
        "nudges": 0,
        "criticality_trend": {},
    }
    try:
        docs = list(db.task_followups.find({
            "org_id": org_id,
            "assignee_email": (employee_email or "").lower(),
        }))
    except Exception as e:
        logger.debug("cliq engagement lookup failed: %s", e)
        return empty

    threads = [
        t for t in docs
        if (_as_dt(t.get("created_at")) or datetime.min) >= cutoff
    ]
    replies = 0
    nudges = 0
    hours: list[float] = []
    trend: dict[str, int] = {}
    for thread in threads:
        messages = [m for m in (thread.get("messages") or []) if isinstance(m, dict)]
        replies += sum(1 for m in messages if m.get("dir") == "in")
        nudges += int(thread.get("nudge_count") or 0)
        hours.extend(_response_hours(messages))
        crit = str(thread.get("criticality") or "low")
        trend[crit] = trend.get(crit, 0) + 1

    return {
        "threads": len(threads),
        "replies": replies,
        "avg_response_hours": round(sum(hours) / len(hours), 1) if hours else 0.0,
        "nudges": nudges,
        "criticality_trend": trend,
    }


async def generate_task_thread_summary(
    db: Any,
    thread_id: str,
    use_llm: bool = True,
) -> dict[str, Any]:
    """Summarize one follow-up thread (outcome, blockers, response stats)."""
    thread = None
    try:
        from bson import ObjectId

        if ObjectId.is_valid(str(thread_id)):
            thread = db.task_followups.find_one({"_id": ObjectId(str(thread_id))})
    except Exception:
        thread = None
    if thread is None:
        try:
            thread = db.task_followups.find_one({"_id": str(thread_id)})
        except Exception:
            thread = None
    if thread is None:
        return {"thread_id": str(thread_id), "found": False}

    messages = [m for m in (thread.get("messages") or []) if isinstance(m, dict)]
    inbound = [m for m in messages if m.get("dir") == "in"]
    blockers = [m for m in inbound if m.get("intent") == "blocked"]
    hours = _response_hours(messages)
    status = str(thread.get("status") or "unknown")
    criticality = str(thread.get("criticality") or "low")
    outcome = "completed" if status == "completed" else ("blocked" if status == "blocked" else status)
    response_stats = {
        "replies": len(inbound),
        "avg_response_hours": round(sum(hours) / len(hours), 1) if hours else 0.0,
        "nudges": int(thread.get("nudge_count") or 0),
    }
    blocker_texts = [str(b.get("text") or "")[:160] for b in blockers]
    summary = (
        f"Task thread outcome: {outcome}; criticality {criticality}; "
        f"{response_stats['replies']} reply(ies), avg response {response_stats['avg_response_hours']}h"
    )
    if blocker_texts:
        summary += f"; blockers: {'; '.join(blocker_texts[:3])}"

    if use_llm and messages:
        transcript = "\n".join(
            f"{m.get('dir')}: {str(m.get('text') or '')[:400]}" for m in messages[-12:]
        )
        prompt = (
            "Summarize this task follow-up thread for a manager in 2-3 sentences.\n"
            "State the outcome, blockers, and response behaviour. Do not invent facts.\n"
            f"Status: {status}\nCriticality: {criticality}\nThread:\n{transcript}"
        )
        try:
            generated = (await get_ai_response(prompt) or "").strip()
            if generated:
                summary = generated
        except Exception as e:
            logger.debug("thread summary LLM failed: %s", e)

    return {
        "thread_id": str(thread.get("_id") or thread_id),
        "task_id": str(thread.get("task_id") or ""),
        "found": True,
        "status": status,
        "criticality": criticality,
        "outcome": outcome,
        "blockers": blocker_texts,
        "response_stats": response_stats,
        "summary": summary,
    }


def generate_cliq_rollup(db: Any, org_id: str, reports: list[dict]) -> dict[str, Any]:
    """Manager rollup for the weekly digest (additive, never raises)."""
    at_risk = 0
    escalations: list[dict[str, str]] = []
    for report in reports or []:
        engagement = report.get("cliq_engagement") or {}
        trend = engagement.get("criticality_trend") or {}
        at_risk += int(trend.get("high") or 0) + int(trend.get("critical") or 0)
        for item in ((report.get("escalation") or {}).get("items") or []):
            task = item.split('"')[1] if '"' in item else str(item)
            escalations.append({
                "employee": report.get("employee_name") or report.get("employee_email") or "",
                "task": task,
            })

    blockers: Counter = Counter()
    try:
        for thread in db.task_followups.find({"org_id": org_id, "status": "blocked"}).limit(50):
            note = str(thread.get("risk_notes") or "Blocked without details").strip()
            blockers[note] += 1
    except Exception as e:
        logger.debug("cliq rollup blockers failed: %s", e)

    top_blockers = [{"reason": reason, "count": count} for reason, count in blockers.most_common(5)]
    if at_risk:
        coaching = f"{at_risk} high/critical thread(s) need attention; review blockers before they slip."
    elif top_blockers:
        coaching = "Clear blockers early; acknowledge replies within the same day."
    else:
        coaching = "No Cliq risks flagged this week."

    return {
        "at_risk_count": at_risk,
        "escalations": escalations[:10],
        "top_blockers": top_blockers,
        "coaching": coaching,
    }


def generate_weekly_dept_pdf(reports: list[dict], org_name: str = "YesBoss") -> bytes:
    """Build a single department-wise PDF from a list of employee report dicts."""
    import io

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=54, leftMargin=54,
        topMargin=54, bottomMargin=54,
    )
    styles = getSampleStyleSheet()

    primary = colors.HexColor('#0ea5e9')
    dark = colors.HexColor('#1e293b')
    muted = colors.HexColor('#64748b')
    border = colors.HexColor('#e2e8f0')
    light_bg = colors.HexColor('#f8fafc')

    title_style = ParagraphStyle('Title2', parent=styles['Title'], fontSize=24, spaceAfter=4, textColor=dark, leading=30)
    subtitle_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, spaceAfter=16, textColor=muted, leading=14)
    dept_style = ParagraphStyle('Dept', parent=styles['Heading1'], fontSize=16, spaceAfter=6, spaceBefore=14, textColor=primary, leading=20)
    name_style = ParagraphStyle('Name', parent=styles['Heading2'], fontSize=11.5, spaceAfter=4, spaceBefore=8, textColor=dark, leading=15)
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=9, spaceAfter=5, leading=13, textColor=dark)

    story = []
    story.append(Paragraph(org_name, title_style))
    story.append(Paragraph("Weekly Performance Report — Department-wise", subtitle_style))

    # Group by department (sorted), preserving insertion order within each.
    depts: dict[str, list[dict]] = {}
    for r in reports:
        dept = (r.get("department") or "General").strip() or "General"
        depts.setdefault(dept, []).append(r)

    for dept in sorted(depts.keys()):
        members = depts[dept]
        story.append(Paragraph(f"Department: {dept} ({len(members)} employee(s))", dept_style))

        for r in members:
            m = r.get("metrics") or {}
            name = r.get("employee_name") or r.get("employee_email") or "Unknown"
            email = r.get("employee_email") or ""
            story.append(Paragraph(f"{name} — {email}", name_style))

            rows = [
                ["Metric", "Value"],
                ["Completion Rate", f"{m.get('completion_rate', 0)}%"],
                ["Total Tasks", str(m.get("total_tasks", 0))],
                ["Completed", str(m.get("completed_tasks", 0))],
                ["In Progress", str(m.get("in_progress_tasks", 0))],
                ["Pending", str(m.get("pending_tasks", 0))],
                ["Overdue", str(m.get("overdue_tasks", 0))],
                ["Avg Completion", f"{m.get('avg_completion_hours', 0)}h"],
                ["Goals Touched", str(m.get("goals_touched", 0))],
            ]
            tbl = Table(rows, colWidths=[2.2 * inch, 1.6 * inch])
            tbl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), primary),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('GRID', (0, 0), (-1, -1), 0.5, border),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 4))

            feedback = (r.get("ai_feedback") or "").strip()
            if feedback:
                story.append(Paragraph("<b>AI Feedback:</b> " + feedback.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), body_style))
            story.append(Spacer(1, 4))

    doc.build(story)
    return buf.getvalue()
