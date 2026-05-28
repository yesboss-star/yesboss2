import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from ..core.database import get_database
from ..dependencies.auth import get_current_user
from bson import ObjectId
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io

router = APIRouter()
logger = logging.getLogger("yesboss.reports")

def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None

class ReportRequest(BaseModel):
    period: str = "weekly"
    sections: Optional[List[str]] = None

def build_report_content(db, org_id: str, request: ReportRequest) -> Dict[str, Any]:
    goals = list(db.goals.find({"organization_id": org_id}).sort("created_at", -1))
    tasks = list(db.tasks.find({"organization_id": org_id}).sort("created_at", -1))
    members = list(db.org_chart_members.find({"organization_id": org_id}))

    total_goals = len(goals)
    active_goals = len([g for g in goals if g.get("status") == "active"])
    completed_goals = len([g for g in goals if g.get("status") == "completed"])

    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.get("status") == "completed"])
    pending_tasks = len([t for t in tasks if t.get("status") == "pending"])
    in_progress_tasks = len([t for t in tasks if t.get("status") == "in_progress"])

    departments = {}
    for g in goals:
        dept = g.get("department", "general")
        if dept not in departments:
            departments[dept] = {"goals": 0, "tasks": 0}
        departments[dept]["goals"] += 1
    for t in tasks:
        dept = t.get("department", "general")
        if dept not in departments:
            departments[dept] = {"goals": 0, "tasks": 0}
        departments[dept]["tasks"] += 1

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "period": request.period,
        "summary": {
            "total_goals": total_goals,
            "active_goals": active_goals,
            "completed_goals": completed_goals,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "pending_tasks": pending_tasks,
            "in_progress_tasks": in_progress_tasks,
            "team_size": len(members),
            "completion_rate": round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1),
        },
        "departments": departments,
        "goals": [{"title": g.get("title"), "status": g.get("status"), "priority": g.get("priority"), "department": g.get("department")} for g in goals[:10]],
        "tasks": [{"title": t.get("title"), "status": t.get("status"), "priority": t.get("priority")} for t in tasks[:10]],
    }

def generate_pdf(content: Dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=24, spaceAfter=20, textColor=colors.HexColor('#0ea5e9'))
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], fontSize=14, spaceAfter=10, textColor=colors.HexColor('#1e293b'))
    body_style = ParagraphStyle('CustomBody', parent=styles['Normal'], fontSize=10, spaceAfter=6, leading=14)

    story = []
    story.append(Paragraph("YesBoss Weekly Report", title_style))
    story.append(Paragraph(f"Generated: {content['generated_at'][:10]}", body_style))
    story.append(Spacer(1, 12))

    summary = content["summary"]
    story.append(Paragraph("Executive Summary", heading_style))
    summary_data = [
        ["Metric", "Value"],
        ["Active Goals", str(summary["active_goals"])],
        ["Completed Goals", str(summary["completed_goals"])],
        ["Total Tasks", str(summary["total_tasks"])],
        ["Completed Tasks", str(summary["completed_tasks"])],
        ["Pending Tasks", str(summary["pending_tasks"])],
        ["In Progress", str(summary["in_progress_tasks"])],
        ["Team Size", str(summary["team_size"])],
        ["Completion Rate", f"{summary['completion_rate']}%"],
    ]
    t = Table(summary_data, colWidths=[3*inch, 2*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(t)
    story.append(Spacer(1, 20))

    if content["goals"]:
        story.append(Paragraph("Active Goals", heading_style))
        goal_data = [["Title", "Status", "Priority", "Department"]]
        for g in content["goals"]:
            goal_data.append([g["title"][:50], g["status"], g["priority"], g.get("department", "-")])
        t = Table(goal_data, colWidths=[2.5*inch, 1*inch, 1*inch, 1*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ]))
        story.append(t)
        story.append(Spacer(1, 20))

    story.append(Paragraph("Department Breakdown", heading_style))
    dept_data = [["Department", "Goals", "Tasks"]]
    for dept, info in content["departments"].items():
        dept_data.append([dept.capitalize(), str(info["goals"]), str(info["tasks"])])
    t = Table(dept_data, colWidths=[2*inch, 1.5*inch, 1.5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    story.append(Paragraph("This report was generated automatically by YesBoss AI.", body_style))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()

@router.post("/generate")
async def generate_report(
    request: ReportRequest,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    content = build_report_content(db, org_id, request)

    report_doc = {
        "organization_id": org_id,
        "period": request.period,
        "content": content,
        "created_at": datetime.utcnow(),
        "created_by": getattr(current_user, 'id', None),
    }

    result = db.reports.insert_one(report_doc)
    report_doc["_id"] = str(result.inserted_id)

    return {
        "report": {
            "id": report_doc["_id"],
            "period": request.period,
            "generated_at": content["generated_at"],
            "summary": content["summary"],
            "departments": content["departments"],
        }
    }

@router.get("/history")
async def list_reports(current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    reports = list(db.reports.find({"organization_id": org_id}).sort("created_at", -1).limit(20))
    for r in reports:
        r["_id"] = str(r["_id"])
        if "content" in r and isinstance(r["content"], dict):
            r["summary"] = r["content"].get("summary", {})
    return {"reports": reports}

@router.get("/download/{report_id}")
async def download_report(report_id: str, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    report = db.reports.find_one({"_id": ObjectId(report_id)})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    content = report.get("content", {})

    pdf_bytes = generate_pdf(content)

    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=yesboss_report_{report_id}.pdf",
            "Content-Type": "application/pdf",
        }
    )
