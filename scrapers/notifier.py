import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_email(subject: str, body: str) -> bool:
    """Send email via Gmail SMTP. Returns True on success, False if not configured or send fails."""
    from_addr = os.getenv("NOTIFY_EMAIL_FROM")
    to_addr = os.getenv("NOTIFY_EMAIL_TO")
    app_password = os.getenv("NOTIFY_EMAIL_APP_PASSWORD")

    if not all([from_addr, to_addr, app_password]):
        print("⚠️  Email not configured — skipping notification")
        return False

    msg = MIMEMultipart()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(from_addr, app_password)
            server.send_message(msg)
        print(f"✅ Email sent: {subject}")
        return True
    except Exception as e:
        print(f"❌ Email send failed: {e}")
        return False


def format_failure_email(task_name: str, reason: str, log_tail: str) -> tuple[str, str]:
    subject = f"[UFC Pipeline] ❌ FAILED — {task_name}"
    body = f"Task: {task_name}\n\nFailure reason:\n{reason}\n\nLast log output:\n{log_tail}"
    return subject, body


def format_success_email(task_name: str, summary: str) -> tuple[str, str]:
    subject = f"[UFC Pipeline] ✅ {task_name} complete"
    body = f"Task: {task_name}\n\n{summary}"
    return subject, body


def format_mismatch_email(
    task_name: str,
    new_mismatches: list[str],
    persistent_mismatches: list[str],
    blocked: bool,
) -> tuple[str, str]:
    total = len(new_mismatches) + len(persistent_mismatches)
    subject = f"[UFC Pipeline] ⚠️ {total} unmatched fighters — {task_name}"

    lines = [f"Task: {task_name}", f"Total unmatched: {total}", ""]

    if new_mismatches:
        lines.append(f"New this run ({len(new_mismatches)}):")
        for name in new_mismatches:
            lines.append(f"  - {name}")
        lines.append("")

    if persistent_mismatches:
        lines.append(f"Persistent ({len(persistent_mismatches)}):")
        for name in persistent_mismatches:
            lines.append(f"  - {name}")
        lines.append("")

    if blocked:
        lines.append(
            "Upload blocked. Add new fighters to utils/name_fixes.py and re-run merge manually."
        )
    else:
        lines.append(
            "Upload proceeded with UFC-only data. Add new fighters to utils/name_fixes.py when convenient."
        )

    return subject, "\n".join(lines)


def format_crash_email(task_name: str, traceback_str: str) -> tuple[str, str]:
    subject = f"[UFC Pipeline] 💥 CRASH — {task_name}"
    body = f"Task: {task_name}\n\nUnhandled exception:\n\n{traceback_str}"
    return subject, body
