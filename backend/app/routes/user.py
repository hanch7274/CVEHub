from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models.user import User
from app.routes.auth import get_current_user

router = APIRouter()

@router.get("/search", response_model=List[dict])
async def search_users(query: str = "", current_user: User = Depends(get_current_user)):
    """사용자 검색 API - 멘션 자동완성을 위해 사용됩니다."""
    # 쿼리에서 @ 기호 제거
    clean_query = query.replace("@", "").strip()
    
    # 빈 쿼리이거나 '@'만 입력된 경우 모든 사용자 반환
    if not clean_query:
        users = await User.find(
            {"username": {"$ne": current_user.username}}  # 현재 사용자 제외
        ).sort("username").limit(10).to_list()  # 사용자명 알파벳 순으로 정렬
    else:
        users = await User.find(
            {
                "username": {
                    "$regex": f"^{clean_query}", 
                    "$options": "i",  # 대소문자 구분 없이
                    "$ne": current_user.username  # 현재 사용자 제외
                }
            }
        ).sort("username").limit(10).to_list()
    
    # 필요한 필드만 추출하여 반환
    return [
        {
            "username": user.username,
            "displayName": user.username  # 필요한 경우 추가 필드 포함 가능
        } 
        for user in users
    ]
