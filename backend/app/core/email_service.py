import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from typing import Optional
from .config import settings

logger = logging.getLogger("yesboss.email")

SMTP_HOST = getattr(settings, "SMTP_HOST", "")
SMTP_PORT = getattr(settings, "SMTP_PORT", 587)
SMTP_USER = getattr(settings, "SMTP_USER", "")
SMTP_PASS = getattr(settings, "SMTP_PASS", "")
SMTP_FROM = getattr(settings, "SMTP_FROM", "noreply@yesboss.app")


def is_email_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


def send_email(to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
    if not is_email_configured():
        logger.warning("SMTP not configured - skipping email")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = Header(subject, "utf-8")
        msg.attach(MIMEText(text_body or "", "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


APP_NAME = "YESBOSS"

_TEMPLATE_HEADER = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;padding:32px">
  <table style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden">
    <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6)">
      <h1 style="color:white;margin:0;font-size:20px">{app_name}</h1>
    </td></tr>
    <tr><td style="padding:32px">"""

_TEMPLATE_FOOTER = """      <p style="margin-top:24px;font-size:12px;color:#999">This notification was sent by {app_name}.</p>
    </td></tr>
  </table>
</body>
</html>"""


def _render_basic(title: str, message: str, link: str = None, action_label: str = None) -> str:
    body = f"""<h2 style="margin:0 0 8px;font-size:18px">{title}</h2>
      <p style="margin:0 0 16px;color:#555;line-height:1.5">{message}</p>"""
    if link:
        body += f"""<a href="{link}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-size:14px">{action_label or "View Details"}</a>"""
    return _TEMPLATE_HEADER.format(app_name=APP_NAME) + body + _TEMPLATE_FOOTER.format(app_name=APP_NAME)


def _render_task_deadline_reminder(task_name: str, due_date: str, link: str = None) -> str:
    body = f"""<h2 style="margin:0 0 8px;font-size:18px;color:#1e293b">Task Due Soon</h2>
      <p style="margin:0 0 4px;color:#555;line-height:1.5">Your task <strong style="color:#6366f1">{task_name}</strong> is due on <strong>{due_date}</strong>.</p>
      <p style="margin:0 0 16px;color:#888;font-size:13px">Please ensure it's completed on time to keep the team on track.</p>"""
    if link:
        body += f"""<a href="{link}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-size:14px">View Task</a>"""
    return _TEMPLATE_HEADER.format(app_name=APP_NAME) + body + _TEMPLATE_FOOTER.format(app_name=APP_NAME)


def _render_task_overdue(task_name: str, link: str = None) -> str:
    body = f"""<h2 style="margin:0 0 8px;font-size:18px;color:#dc2626">Task Overdue</h2>
      <p style="margin:0 0 4px;color:#555;line-height:1.5">Task <strong style="color:#dc2626">{task_name}</strong> is now overdue.</p>
      <p style="margin:0 0 16px;color:#888;font-size:13px">This task has passed its deadline. If unresolved, this will be escalated to the organization owner.</p>"""
    if link:
        body += f"""<a href="{link}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:white;text-decoration:none;border-radius:8px;font-size:14px">View Task</a>"""
    return _TEMPLATE_HEADER.format(app_name=APP_NAME) + body + _TEMPLATE_FOOTER.format(app_name=APP_NAME)


def _render_escalation_owner(task_name: str, assignee: str, days_overdue: int, link: str = None) -> str:
    body = f"""<h2 style="margin:0 0 8px;font-size:18px;color:#dc2626">Escalation - Task Overdue</h2>
      <p style="margin:0 0 4px;color:#555;line-height:1.5">Task <strong style="color:#dc2626">{task_name}</strong> assigned to <strong>{assignee}</strong> is <strong>{days_overdue} day(s)</strong> overdue.</p>
      <p style="margin:0 0 16px;color:#888;font-size:13px">This task has been escalated to you as the organization owner. Please review and take necessary action.</p>"""
    if link:
        body += f"""<a href="{link}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:white;text-decoration:none;border-radius:8px;font-size:14px">View Task</a>"""
    return _TEMPLATE_HEADER.format(app_name=APP_NAME) + body + _TEMPLATE_FOOTER.format(app_name=APP_NAME)


def _render_weekly_digest(items: list) -> str:
    items_html = ""
    for item in items[:20]:
        items_html += f"""<tr><td style="padding:8px 0;border-bottom:1px solid #eee">
          <strong style="font-size:14px">{item.get('title','')}</strong>
          <p style="margin:4px 0 0;font-size:13px;color:#666">{item.get('message','')}</p>
        </td></tr>"""
    body = f"""<h2 style="margin:0 0 16px;font-size:18px;color:#1e293b">Your Weekly Digest</h2>
      <p style="margin:0 0 12px;color:#555;font-size:13px">Here's a summary of your notifications this week.</p>
      <table style="width:100%;border-collapse:collapse">{items_html or '<p style="color:#999;font-size:13px">No new notifications.</p>'}</table>"""
    return _TEMPLATE_HEADER.format(app_name=APP_NAME) + body + _TEMPLATE_FOOTER.format(app_name=APP_NAME)


def _render_monthly_report(report_data: dict) -> str:
    completed = report_data.get("completed", 0)
    overdue = report_data.get("overdue", 0)
    rate = report_data.get("completion_rate", 0)
    feedback = report_data.get("feedback", "")
    body = f"""<h2 style="margin:0 0 8px;font-size:18px;color:#1e293b">Monthly Performance Report</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:14px;color:#555">Tasks Completed</td><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:14px;font-weight:bold">{completed}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-size:14px;color:#555">Tasks Overdue</td><td style="padding:8px;border:1px solid #e2e8f0;font-size:14px;font-weight:bold">{overdue}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:14px;color:#555">Completion Rate</td><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:14px;font-weight:bold">{rate}%</td></tr>
      </table>
      <p style="margin:0 0 8px;color:#555;font-size:13px"><strong>AI Feedback:</strong> {feedback}</p>"""
    return _TEMPLATE_HEADER.format(app_name=APP_NAME) + body + _TEMPLATE_FOOTER.format(app_name=APP_NAME)


TEMPLATE_RENDERERS = {
    "default": _render_basic,
    "task_deadline_reminder": _render_task_deadline_reminder,
    "task_overdue": _render_task_overdue,
    "escalation_owner": _render_escalation_owner,
    "weekly_digest": _render_weekly_digest,
    "monthly_report": _render_monthly_report,
}


def send_notification_email(to_email: str, title: str, message: str, link: Optional[str] = None, action_label: Optional[str] = None, template_name: str = "default", template_data: Optional[dict] = None):
    if template_name and template_name in TEMPLATE_RENDERERS:
        renderer = TEMPLATE_RENDERERS[template_name]
        if template_name == "task_deadline_reminder":
            html = renderer(task_name=template_data.get("task_name", message), due_date=template_data.get("due_date", ""), link=link)
        elif template_name == "task_overdue":
            html = renderer(task_name=template_data.get("task_name", message), link=link)
        elif template_name == "escalation_owner":
            html = renderer(task_name=template_data.get("task_name", message), assignee=template_data.get("assignee", "Unknown"), days_overdue=template_data.get("days_overdue", 0), link=link)
        elif template_name == "weekly_digest":
            html = renderer(items=template_data.get("items", []))
        elif template_name == "monthly_report":
            html = renderer(report_data=template_data or {})
        else:
            html = TEMPLATE_RENDERERS["default"](title, message, link, action_label)
    else:
        html = TEMPLATE_RENDERERS["default"](title, message, link, action_label)
    send_email(to_email, f"{APP_NAME} - {title}", html, text_body=f"{title}\n\n{message}\n\n{link or ''}")


def send_digest_email(to_email: str, digest_items: list, frequency: str = "daily"):
    html = _render_weekly_digest(digest_items)
    send_email(to_email, f"{APP_NAME} - {frequency.capitalize()} Digest", html,
               text_body=f"{frequency.capitalize()} Digest\n\n" + "\n".join(
                   f"{i.get('title','')}: {i.get('message','')}" for i in digest_items[:20]))
