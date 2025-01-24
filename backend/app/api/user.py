from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import List
from app.models.user import User, UserCreate, UserUpdate
from app.services.user import UserService
from app.core.auth import get_current_user

router = APIRouter()
user_service = UserService()

@router.post("/register")
async def register(user_data: UserCreate):
    """새로운 사용자를 등록합니다."""
    try:
        user = await user_service.create_user(user_data)
        if not user:
            raise HTTPException(status_code=400, detail="사용자 등록에 실패했습니다.")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """사용자 로그인을 처리합니다."""
    try:
        token = await user_service.authenticate_user(
            form_data.username,
            form_data.password
        )
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="잘못된 사용자 이름 또는 비밀번호입니다.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return token
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자의 정보를 조회합니다."""
    return current_user

@router.patch("/me")
async def update_current_user(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """현재 로그인한 사용자의 정보를 수정합니다."""
    try:
        user = await user_service.update_user(current_user.id, user_data)
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/me")
async def delete_current_user(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자의 계정을 삭제합니다."""
    try:
        success = await user_service.delete_user(current_user.id)
        if not success:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        return {"message": "사용자 계정이 삭제되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
