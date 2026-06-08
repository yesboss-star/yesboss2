import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
        logger.warning("SMTP not configured — skipping email")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
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


def send_notification_email(to_email: str, title: str, message: str, link: Optional[str] = None, action_label: Optional[str] = None):
    app_name = "YESBOSS"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;padding:32px">
  <table style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden">
    <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6)">
      <h1 style="color:white;margin:0;font-size:20px">{app_name}</h1>
    </td></tr>
    <tr><td style="padding:32px">
      <h2 style="margin:0 0 8px;font-size:18px">{title}</h2>
      <p style="margin:0 0 16px;color:#555;line-height:1.5">{message}</p>
      {f'<a href="{link}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-size:14px">{action_label or "View Details"}</a>' if link else ""}
      <p style="margin-top:24px;font-size:12px;color:#999">This notification was sent by {app_name}.</p>
    </td></tr>
  </table>
</body>
</html>"""
    send_email(to_email, f"{app_name} — {title}", html, text_body=f"{title}\n\n{message}\n\n{link or ''}")


def send_digest_email(to_email: str, digest_items: list, frequency: str = "daily"):
    app_name = "YESBOSS"
    items_html = ""
    for item in digest_items[:20]:
        items_html += f"""
        <tr><td style="padding:12px 16px;border-bottom:1px solid #eee">
          <strong style="font-size:14px">{item.get('title','')}</strong>
          <p style="margin:4px 0 0;font-size:13px;color:#666">{item.get('message','')}</p>
          <span style="font-size:11px;color:#999">{item.get('created_at','')}</span>
        </td></tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;padding:32px">
  <table style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden">
    <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6)">
      <h1 style="color:white;margin:0;font-size:20px">{app_name}</h1>
    </td></tr>
    <tr><td style="padding:32px">
      <h2 style="margin:0 0 16px;font-size:18px">Your {frequency} digest</h2>
      <table style="width:100%;border-collapse:collapse">{items_html}</table>
      {"" if items_html else '<p style="color:#999">No notifications in this period.</p>'}
    </td></tr></table>
</body>
</html>"""

    send_email(to_email, f"{app_name} — {frequency.capitalize()} Digest", html,
               text_body=f"{frequency.capitalize()} Digest\n\n" + "\n".join(
                   f"{i.get('title','')}: {i.get('message','')}" for i in digest_items[:20]))
