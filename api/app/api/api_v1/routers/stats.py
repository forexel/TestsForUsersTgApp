from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.app.db.session import get_db
from api.app.models import Test, TestRunLog
from api.app.schemas.stats import StatsResponse

router = APIRouter(prefix="/stats", tags=["stats"], redirect_slashes=False)


@router.get("", response_model=StatsResponse)
@router.get("/", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
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
    return StatsResponse(
        tests_created=tests_created,
        tests_completed=tests_completed,
        tests_opened=tests_opened,
    )
