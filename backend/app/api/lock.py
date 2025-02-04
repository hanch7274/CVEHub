from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from ..models.cve_model import CVEModel
from ..auth.user import get_current_user

router = APIRouter()

LOCK_DURATION = timedelta(minutes=30)  # 잠금 유효 시간

@router.post("/cve/{cve_id}/lock")
async def lock_cve(cve_id: str, current_user: str = Depends(get_current_user)):
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")

    # 현재 시간 기준으로 만료된 잠금 확인
    now = datetime.now()
    if cve.isLocked:
        if cve.lockExpiresAt and cve.lockExpiresAt < now:
            # 만료된 잠금 해제
            cve.isLocked = False
        else:
            # 다른 사용자가 이미 편집 중
            if cve.lockedBy != current_user:
                raise HTTPException(
                    status_code=423,
                    detail={
                        "message": "CVE is locked by another user",
                        "lockedBy": cve.lockedBy,
                        "lockExpiresAt": cve.lockExpiresAt
                    }
                )
            # 현재 사용자의 잠금 시간 연장
            cve.lockExpiresAt = now + LOCK_DURATION
            await cve.save()
            return {"message": "Lock extended"}

    # 새로운 잠금 설정
    cve.isLocked = True
    cve.lockedBy = current_user
    cve.lockTimestamp = now
    cve.lockExpiresAt = now + LOCK_DURATION
    await cve.save()
    
    return {"message": "CVE locked successfully"}

@router.post("/cve/{cve_id}/unlock")
async def unlock_cve(cve_id: str, current_user: str = Depends(get_current_user)):
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")

    if not cve.isLocked:
        return {"message": "CVE is already unlocked"}

    # 잠금을 설정한 사용자만 해제 가능
    if cve.lockedBy != current_user:
        raise HTTPException(
            status_code=403,
            detail="Only the user who locked the CVE can unlock it"
        )

    cve.isLocked = False
    cve.lockedBy = None
    cve.lockTimestamp = None
    cve.lockExpiresAt = None
    await cve.save()
    
    return {"message": "CVE unlocked successfully"}

@router.get("/cve/{cve_id}/lock-status")
async def get_lock_status(cve_id: str):
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")

    # 만료된 잠금 확인
    if cve.isLocked and cve.lockExpiresAt and cve.lockExpiresAt < datetime.now():
        cve.isLocked = False
        cve.lockedBy = None
        cve.lockTimestamp = None
        cve.lockExpiresAt = None
        await cve.save()

    return {
        "isLocked": cve.isLocked,
        "lockedBy": cve.lockedBy,
        "lockTimestamp": cve.lockTimestamp,
        "lockExpiresAt": cve.lockExpiresAt
    }
