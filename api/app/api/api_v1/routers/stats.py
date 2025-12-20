from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.app.db.session import get_db
from api.app.models import Test, TestRunLog
from api.app.schemas.stats import StatsResponse

router = APIRouter(prefix="/stats", tags=["stats"], redirect_slashes=False)


def _range_for_day(day_value: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day_value, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end


def _range_for_month(year: int, month: int) -> tuple[datetime, datetime]:
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


@router.get("", response_model=StatsResponse)
@router.get("/", response_model=StatsResponse)
def get_stats(day: date | None = None, month: int | None = None, year: int | None = None, db: Session = Depends(get_db)):
    tests_created = db.query(func.count(Test.id)).scalar() or 0
    tests_completed = (
        db.query(func.count(TestRunLog.id))
        .filter(TestRunLog.event_type == "complete")
        .scalar()
        or 0
    )
    opened_only = (
        db.query(func.count(TestRunLog.id))
        .filter(TestRunLog.event_type == "open")
        .scalar()
        or 0
    )
    tests_opened = max(opened_only, tests_completed)

    today = datetime.now(timezone.utc).date()
    day_value = day or today
    day_start, day_end = _range_for_day(day_value)

    month_value = month or today.month
    year_value = year or today.year
    month_start, month_end = _range_for_month(year_value, month_value)

    daily_created_users = (
        db.query(func.count(func.distinct(Test.created_by)))
        .filter(Test.created_at >= day_start, Test.created_at < day_end)
        .scalar()
        or 0
    )
    daily_opened_users = (
        db.query(func.count(func.distinct(TestRunLog.user_id)))
        .filter(TestRunLog.event_type.in_(["open", "complete"]))
        .filter(TestRunLog.created_at >= day_start, TestRunLog.created_at < day_end)
        .scalar()
        or 0
    )
    daily_completed_users = (
        db.query(func.count(func.distinct(TestRunLog.user_id)))
        .filter(TestRunLog.event_type == "complete")
        .filter(TestRunLog.created_at >= day_start, TestRunLog.created_at < day_end)
        .scalar()
        or 0
    )

    monthly_created_users = (
        db.query(func.count(func.distinct(Test.created_by)))
        .filter(Test.created_at >= month_start, Test.created_at < month_end)
        .scalar()
        or 0
    )
    monthly_opened_users = (
        db.query(func.count(func.distinct(TestRunLog.user_id)))
        .filter(TestRunLog.event_type.in_(["open", "complete"]))
        .filter(TestRunLog.created_at >= month_start, TestRunLog.created_at < month_end)
        .scalar()
        or 0
    )
    monthly_completed_users = (
        db.query(func.count(func.distinct(TestRunLog.user_id)))
        .filter(TestRunLog.event_type == "complete")
        .filter(TestRunLog.created_at >= month_start, TestRunLog.created_at < month_end)
        .scalar()
        or 0
    )
    return StatsResponse(
        tests_created=tests_created,
        tests_completed=tests_completed,
        tests_opened=tests_opened,
        daily_created_users=daily_created_users,
        daily_opened_users=daily_opened_users,
        daily_completed_users=daily_completed_users,
        monthly_created_users=monthly_created_users,
        monthly_opened_users=monthly_opened_users,
        monthly_completed_users=monthly_completed_users,
    )
