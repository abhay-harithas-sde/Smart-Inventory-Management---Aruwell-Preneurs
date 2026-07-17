"""Async email sending via SMTP (Gmail App Password supported)."""
import os
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import aiosmtplib

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)


async def send_email(to: str, subject: str, html: str, text: str = "") -> bool:
    """Send an email. Returns True on success, False on failure (non-blocking)."""
    if not all([SMTP_HOST, SMTP_USER, SMTP_PASS]):
        logger.warning("SMTP not configured — skipping email to %s", to)
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASS,
            start_tls=True,
        )
        logger.info("Email sent to %s — %s", to, subject)
        return True
    except Exception as e:
        logger.error("Email failed to %s: %s", to, e)
        return False


def invite_email_html(name: str, email: str, password: str, role: str,
                      tenant_name: str, login_url: str) -> tuple[str, str]:
    """Returns (html, plain_text) for an invite email."""
    role_cap = role.capitalize()
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#09090B;color:#FAFAFA;margin:0;padding:0;">
  <div style="max-width:480px;margin:40px auto;background:#18181B;border:1px solid #27272A;border-radius:12px;overflow:hidden;">
    <div style="background:#2563EB;padding:24px 32px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px;">Smart Ledger</div>
      <div style="font-size:13px;opacity:0.8;margin-top:4px;">You've been invited to a workspace</div>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi <strong>{name}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#A1A1AA;">
        You've been added to <strong style="color:#FAFAFA;">{tenant_name}</strong> as a <strong style="color:#FAFAFA;">{role_cap}</strong>.
        Use the credentials below to sign in.
      </p>
      <div style="background:#09090B;border:1px solid #27272A;border-radius:8px;padding:20px;margin-bottom:24px;">
        <div style="margin-bottom:12px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#71717A;margin-bottom:4px;">Login URL</div>
          <a href="{login_url}" style="color:#60A5FA;font-size:13px;">{login_url}</a>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#71717A;margin-bottom:4px;">Email</div>
          <div style="font-family:monospace;font-size:14px;color:#FAFAFA;">{email}</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#71717A;margin-bottom:4px;">Temporary Password</div>
          <div style="font-family:monospace;font-size:14px;color:#FAFAFA;">{password}</div>
        </div>
      </div>
      <a href="{login_url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Sign in now →
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#52525B;">
        Please change your password after your first login. If you weren't expecting this, ignore this email.
      </p>
    </div>
  </div>
</body>
</html>
"""
    plain = (
        f"Hi {name},\n\n"
        f"You've been invited to {tenant_name} on Smart Ledger as {role_cap}.\n\n"
        f"Login URL: {login_url}\n"
        f"Email: {email}\n"
        f"Temporary Password: {password}\n\n"
        f"Please change your password after first login.\n"
    )
    return html, plain
