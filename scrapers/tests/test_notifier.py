import pytest
from unittest.mock import patch, MagicMock


def test_send_email_skips_when_not_configured(monkeypatch):
    monkeypatch.delenv("NOTIFY_EMAIL_FROM", raising=False)
    monkeypatch.delenv("NOTIFY_EMAIL_TO", raising=False)
    monkeypatch.delenv("NOTIFY_EMAIL_APP_PASSWORD", raising=False)
    from notifier import send_email
    assert send_email("Subject", "Body") is False


def test_send_email_success(monkeypatch):
    monkeypatch.setenv("NOTIFY_EMAIL_FROM", "from@gmail.com")
    monkeypatch.setenv("NOTIFY_EMAIL_TO", "to@gmail.com")
    monkeypatch.setenv("NOTIFY_EMAIL_APP_PASSWORD", "app_pass")
    mock_server = MagicMock()
    with patch("smtplib.SMTP_SSL") as mock_cls:
        mock_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_cls.return_value.__exit__ = MagicMock(return_value=False)
        from notifier import send_email
        result = send_email("Subject", "Body")
    assert result is True
    mock_server.login.assert_called_once_with("from@gmail.com", "app_pass")


def test_format_failure_email():
    from notifier import format_failure_email
    subject, body = format_failure_email("rankings", "Count dropped 50%", "log line 1\nlog line 2")
    assert "FAILED" in subject
    assert "rankings" in subject
    assert "Count dropped 50%" in body
    assert "log line 1" in body


def test_format_mismatch_email_blocked():
    from notifier import format_mismatch_email
    subject, body = format_mismatch_email(
        "weekly_fighters",
        new_mismatches=["Fighter A"],
        persistent_mismatches=["Fighter B"] * 25,
        blocked=True,
    )
    assert "weekly_fighters" in subject
    assert "Fighter A" in body
    assert "New this run" in body
    assert "Persistent" in body
    assert "Upload blocked" in body


def test_format_mismatch_email_informational():
    from notifier import format_mismatch_email
    subject, body = format_mismatch_email(
        "weekly_fighters",
        new_mismatches=["Fighter A"],
        persistent_mismatches=["Fighter B"],
        blocked=False,
    )
    assert "Upload proceeded" in body


def test_format_success_email():
    from notifier import format_success_email
    subject, body = format_success_email("upcoming", "500 fights loaded")
    assert "upcoming" in subject
    assert "✅" in subject
    assert "500 fights loaded" in body


def test_format_crash_email():
    from notifier import format_crash_email
    subject, body = format_crash_email("rankings", "Traceback...\nValueError: bad value")
    assert "CRASH" in subject
    assert "ValueError" in body
