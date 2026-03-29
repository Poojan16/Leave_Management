import logging
from typing import TYPE_CHECKING

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from app.core.config import settings
from app.worker.celery_app import celery_app

if TYPE_CHECKING:
    from app.models.leave_request import LeaveRequest
    from app.models.user import User

logger = logging.getLogger(__name__)


# ── Celery Task ───────────────────────────────────────────────────────────────

@celery_app.task(
    name="tasks.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_email_task(self, to: str, subject: str, html_body: str) -> None:
    """Send a transactional email via SendGrid. Retries up to 3 times on failure."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping email to %s", to)
        return

    message = Mail(
        from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
        to_emails=to,
        subject=subject,
        html_content=html_body,
    )
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info("Email sent to %s — status %s", to, response.status_code)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        raise self.retry(exc=exc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def send_welcome_email(user: "User") -> None:
    html = f"""
    <h2>Welcome to {settings.FROM_NAME}, {user.first_name}!</h2>
    <p>Your account has been created successfully.</p>
    <p><strong>Email:</strong> {user.email}</p>
    <p><strong>Role:</strong> {user.role.value.capitalize()}</p>
    <p>You can now log in and start managing your leave requests.</p>
    """
    send_email_task.delay(
        to=user.email,
        subject=f"Welcome to {settings.FROM_NAME}",
        html_body=html,
    )


def send_reset_email(user: "User", token: str) -> None:
    reset_url = f"http://localhost:5173/reset-password?token={token}"
    html = f"""
    <h2>Password Reset Request</h2>
    <p>Hi {user.first_name},</p>
    <p>Click the link below to reset your password. This link expires in 30 minutes.</p>
    <p><a href="{reset_url}" style="padding:10px 20px;background:#4F46E5;color:white;
       border-radius:4px;text-decoration:none;">Reset Password</a></p>
    <p>If you did not request this, please ignore this email.</p>
    """
    send_email_task.delay(
        to=user.email,
        subject="Password Reset — Leave Management System",
        html_body=html,
    )


def send_leave_applied_email(user: "User", leave: "LeaveRequest") -> None:
    leave_type_name = leave.leave_type.name if leave.leave_type else "Leave"
    html = f"""
    <h2>Leave Application Received</h2>
    <p>Hi {user.first_name},</p>
    <p>Your leave request has been submitted and is pending approval.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Type</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave_type_name}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>From</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.start_date}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>To</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.end_date}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Days</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.days}</td></tr>
    </table>
    <p>You will be notified once your manager reviews the request.</p>
    """
    send_email_task.delay(
        to=user.email,
        subject="Leave Application Submitted — Pending Approval",
        html_body=html,
    )


def send_leave_status_email(
    user: "User", leave: "LeaveRequest", status: str, remarks: str = ""
) -> None:
    colour = "#16a34a" if status.lower() == "approved" else "#dc2626"
    leave_type_name = leave.leave_type.name if leave.leave_type else "Leave"
    html = f"""
    <h2>Leave Request <span style="color:{colour}">{status.capitalize()}</span></h2>
    <p>Hi {user.first_name},</p>
    <p>Your leave request has been <strong>{status.lower()}</strong>.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Type</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave_type_name}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>From</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.start_date}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>To</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.end_date}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Days</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.days}</td></tr>
      {f'<tr><td style="padding:8px;border:1px solid #ddd"><strong>Remarks</strong></td><td style="padding:8px;border:1px solid #ddd">{remarks}</td></tr>' if remarks else ''}
    </table>
    """
    send_email_task.delay(
        to=user.email,
        subject=f"Leave Request {status.capitalize()} — {settings.FROM_NAME}",
        html_body=html,
    )


def send_leave_cancelled_email(user: "User", leave: "LeaveRequest") -> None:
    leave_type_name = leave.leave_type.name if leave.leave_type else "Leave"
    html = f"""
    <h2>Leave Request Cancelled</h2>
    <p>Hi {user.first_name},</p>
    <p>Your leave request has been <strong>cancelled</strong> and your balance has been restored.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Type</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave_type_name}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>From</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.start_date}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>To</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.end_date}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Days Restored</strong></td>
          <td style="padding:8px;border:1px solid #ddd">{leave.days}</td></tr>
    </table>
    """
    send_email_task.delay(
        to=user.email,
        subject="Leave Request Cancelled — Balance Restored",
        html_body=html,
    )
