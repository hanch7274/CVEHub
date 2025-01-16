from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.core.auth import get_current_active_user
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

router = APIRouter()

# MongoDB 클라이언트 설정
client = AsyncIOMotorClient(settings.MONGODB_URL)
db = client[settings.MONGODB_DB_NAME]
users_collection = db.users

@router.get("/users", response_model=List[str])
async def get_users(current_user: str = Depends(get_current_active_user)):
    """
    등록된 모든 사용자 목록을 반환합니다.
    """
    try:
        # users 컬렉션에서 모든 사용자의 username을 가져옵니다.
        users = await users_collection.distinct("username")
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
