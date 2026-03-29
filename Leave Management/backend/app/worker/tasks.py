from app.worker.celery_app import celery_app


@celery_app.task(name="tasks.send_leave_status_email", bind=True, max_retries=3)
def send_leave_status_email(self, user_email: str, user_name: str, status: str, leave_id: int):
    """
    Send leave status notification email via SendGrid.
    Implemented in Sprint 4 (Notifications).
    """
    # TODO: Sprint 4 — integrate SendGrid
    pass
