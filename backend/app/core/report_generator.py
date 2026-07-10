import logging
from datetime import datetime, timedelta
from typing import Optional, Any, Dict, List
from .ai_client import get_ai_response

logger = logging.getLogger("yesboss.report_generator")


async def generate_employee_report(
    db: Any,
    org_id: str,
    employee_email: str,
    period: str = "weekly"
) -> Dict:
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
    work_patterns_section = f"[Work Patterns]\n" + "\n".join(work_patterns) if work_patterns else ""
    comparison_section = f"[Org Comparison]\n" + "\n".join(comparison_lines) if comparison_lines else ""
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
    }


async def generate_org_health(db: Any, org_id: str) -> Dict:
    now = datetime.utcnow()
    goals = list(db.goals.find({"organization_id": org_id}))
    tasks = list(db.tasks.find({"organization_id": org_id}))
    members = list(db.org_chart_members.find({"organization_id": org_id}))
    outcomes = list(db.task_outcomes.find({"organization_id": org_id}).sort("created_at", -1).limit(100))
    bottlenecks = list(db.bottlenecks.find({"organization_id": org_id, "resolution_status": "open"}).sort("identified_at", -1).limit(10))
    market_impact = db.market_impacts.find_one({"organization_id": org_id})

    total_goals = len(goals)
    active_goals = len([g for g in goals if g.get("status") == "active"])
    completed_goals = len([g for g in goals if g.get("status") == "completed"])
    goal_completion_rate = round((completed_goals / total_goals * 100), 1) if total_goals > 0 else 0.0

    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.get("status") == "completed"])
    pending_tasks = len([t for t in tasks if t.get("status") == "pending"])
    overdue_tasks = len([t for t in tasks if t.get("due_date") and t.get("status") not in ("completed", "approved") and _is_overdue(t.get("due_date"))])
    escalated_tasks = len([t for t in tasks if t.get("escalation_level", 0) > 0])
    task_completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0

    avg_quality_score = 0.0
    quality_scores = [o.get("quality_score") for o in outcomes if o.get("quality_score") is not None]
    if quality_scores:
        avg_quality_score = round(sum(quality_scores) / len(quality_scores), 1)

    departments = {}
    for m in members:
        dept = m.get("department", "General")
        if dept not in departments:
            departments[dept] = {"members": 0, "goals": 0, "tasks": 0, "completed": 0}
        departments[dept]["members"] += 1
    for g in goals:
        dept = g.get("department", "General")
        if dept not in departments:
            departments[dept] = {"members": 0, "goals": 0, "tasks": 0, "completed": 0}
        departments[dept]["goals"] += 1
    for t in tasks:
        dept = t.get("department", "General")
        if dept not in departments:
            departments[dept] = {"members": 0, "goals": 0, "tasks": 0, "completed": 0}
        departments[dept]["tasks"] += 1
        if t.get("status") == "completed":
            departments[dept]["completed"] += 1

    team_size = len(members)
    has_manager = any(m.get("manager_email") for m in members)
    has_org_structure = team_size > 1 and has_manager

    unworked_ideas = list(db.journal_entries.find({
        "org_id": org_id,
        "$or": [
            {"linked_tasks": {"$exists": False}},
            {"linked_tasks": []},
            {"linked_goals": {"$exists": False}},
            {"linked_goals": []},
        ],
    }).sort("created_at", -1).limit(20))

    idea_suggestions = []
    for idea in unworked_ideas:
        content = idea.get("content", "")[:150]
        goal_hints = []
        if idea.get("ai_analysis") and idea["ai_analysis"].get("suggested_goal_titles"):
            goal_hints = idea["ai_analysis"]["suggested_goal_titles"]
        task_count = len(idea.get("ai_analysis", {}).get("actionable_items", [])) if idea.get("ai_analysis") else 0
        idea_suggestions.append({
            "id": str(idea["_id"]),
            "content": content,
            "type": idea.get("type", "idea"),
            "suggested_goals": goal_hints,
            "actionable_items_count": task_count,
            "created_at": idea.get("created_at").isoformat() if idea.get("created_at") else "",
        })

    market_alignment_score = 50.0
    if market_impact:
        impacts = market_impact.get("impacts", [])
        high_count = len([i for i in impacts if i.get("impact_level") == "high"])
        if high_count >= 3:
            market_alignment_score = 100.0
        elif high_count >= 1:
            market_alignment_score = 80.0
        elif len(impacts) > 0:
            market_alignment_score = 65.0

    goal_score = min(goal_completion_rate, 100) * 0.20
    task_score = min(task_completion_rate, 100) * 0.20
    quality_score = (avg_quality_score / 5.0) * 100 * 0.12 if avg_quality_score > 0 else 12.0
    structure_score = 100.0 if has_org_structure else 40.0
    structure_weight = 0.08
    market_weight = 0.10
    bottleneck_penalty = min(len(bottlenecks) * 5, 25)
    escalated_penalty = min(escalated_tasks * 3, 20)
    overdue_penalty = min(overdue_tasks * 2, 15)
    health_score_raw = goal_score + task_score + quality_score + (structure_score * structure_weight) + (market_alignment_score * market_weight)
    health_score = round(max(0, min(100, health_score_raw - bottleneck_penalty - overdue_penalty - escalated_penalty)), 1)

    if health_score >= 80:
        health_label = "Healthy"
    elif health_score >= 50:
        health_label = "Needs Attention"
    else:
        health_label = "At Risk"

    import hashlib
    org_ref = hashlib.sha256(org_id.encode()).hexdigest()[:16]
    org_freqs = list(db.employee_frequencies.find({"org_ref": org_ref}))
    team_patterns = []
    emp_cats = {}
    for f in org_freqs:
        emp = f.get("employee_role", "unknown")
        if emp not in emp_cats:
            emp_cats[emp] = []
        emp_cats[emp].append(f.get("work_category", "general"))
    overloaded = []
    best_per_cat = {}
    for f in org_freqs:
        emp = f.get("employee_role", "")
        cat = f.get("work_category", "")
        hours = f.get("avg_completion_hours", 4)
        if cat not in best_per_cat or hours < best_per_cat[cat]["hours"]:
            best_per_cat[cat] = {"email": emp, "hours": hours}
    for emp, cats in emp_cats.items():
        if len(cats) > 4:
            overloaded.append(emp)
            team_patterns.append(f"{emp}: multi-category ({', '.join(cats[:5])})")
    overloaded_section = f"[Overloaded Employees]\n" + "\n".join(f"  - {e}" for e in overloaded) if overloaded else ""
    best_performer_lines = [f"  - {cat}: {info['email']} (~{info['hours']:.1f}h)" for cat, info in sorted(best_per_cat.items())]
    best_performer_section = "[Best Performer per Category]\n" + "\n".join(best_performer_lines) if best_performer_lines else ""
    category_summary = {}
    for f in org_freqs:
        cat = f.get("work_category", "general")
        category_summary[cat] = category_summary.get(cat, 0) + 1
    cat_lines = [f"  - {cat}: {count} employee(s)" for cat, count in sorted(category_summary.items(), key=lambda x: -x[1])]
    cat_section = "[Work Categories Across Team]\n" + "\n".join(cat_lines) if cat_lines else ""

    ai_recommendations = ""
    idea_summary = ""
    if idea_suggestions:
        idea_lines = [
            f"  - \"{i['content'][:80]}...\" (type: {i['type']}, suggested goals: {', '.join(i['suggested_goals'][:3]) or 'none'}, {i['actionable_items_count']} actionable items)"
            for i in idea_suggestions
        ]
        idea_summary = "[Unworked Ideas & Journal Entries]\n" + "\n".join(idea_lines) + "\n\n"

    prompt = (
        f"Organization Health Assessment\n"
        f"Health Score: {health_score}/100 ({health_label})\n"
        f"Goals: {active_goals} active, {completed_goals} completed ({goal_completion_rate}%)\n"
        f"Tasks: {completed_tasks}/{total_tasks} completed ({task_completion_rate}%), {overdue_tasks} overdue, {escalated_tasks} escalated\n"
        f"Team Size: {team_size}\n"
        f"Departments: {list(departments.keys())}\n"
        f"Open Bottlenecks: {len(bottlenecks)}\n"
        f"Quality Score: {avg_quality_score}/5\n"
        f"{overloaded_section}\n"
        f"{best_performer_section}\n"
        f"{cat_section}\n\n"
        f"{idea_summary}"
        f"Provide 2-3 strategic recommendations to improve organizational health. "
        f"For each unworked idea, suggest which existing goal it relates to (if any) "
        f"and whether it should be converted into tasks. "
        f"Reference team work patterns, overloaded employees, and top performers where relevant."
    )
    try:
        ai_recommendations = await get_ai_response(prompt)
    except Exception as e:
        logger.warning(f"AI recommendations failed for org health: {e}")
        ai_recommendations = "AI recommendations unavailable at this time."

    return {
        "organization_id": org_id,
        "generated_at": now.isoformat(),
        "health_score": health_score,
        "health_label": health_label,
        "metrics": {
            "goal_completion_rate": goal_completion_rate,
            "task_completion_rate": task_completion_rate,
            "avg_quality_score": avg_quality_score,
            "overdue_tasks": overdue_tasks,
            "escalated_tasks": escalated_tasks,
            "open_bottlenecks": len(bottlenecks),
            "team_size": team_size,
            "has_org_structure": has_org_structure,
        },
        "departments": departments,
        "work_patterns": {
            "categories": cat_lines,
            "overloaded_employees": overloaded,
            "best_performers": {cat: info for cat, info in best_per_cat.items()},
        },
        "ai_recommendations": ai_recommendations,
        "unworked_ideas": idea_suggestions,
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
