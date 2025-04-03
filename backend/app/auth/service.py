# service.py

import logging
import json
import secrets
import traceback
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from beanie import PydanticObjectId
from bson import ObjectId
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# Local imports (경로는 실제 프로젝트 구조에 맞게 조정하세요)
from .models import User, RefreshToken, TokenData, UserCreate, UserUpdate, UserResponse, Token

from ..core.config import get_settings
# get_user_by_session_id에서 필요할 수 있으므로 조건부 import 또는 의존성 주입 고려
# from ..core.socketio_manager import socketio_manager

# --- FastAPI 의존성 관련 설정 ---
# tokenUrl은 실제 API 엔드포인트 경로에 맞게 수정해야 합니다.
# 예: "api/v1/auth/token" 또는 "/auth/token" 등
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token") 
settings = get_settings()
logger = logging.getLogger(__name__)

class UserService:
    """사용자 및 인증 관련 서비스"""

    def __init__(self, socketio_manager=None):
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.settings = get_settings() # settings는 전역 변수로도 접근 가능하지만, 명시적으로 주입
        self.logger = logging.getLogger(__name__) # logger는 전역 변수로도 접근 가능
        self._socketio_manager = socketio_manager

    # --- Password Handling ---
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """비밀번호 검증"""
        return self.pwd_context.verify(plain_password, hashed_password)

    def get_password_hash(self, password: str) -> str:
        """비밀번호 해싱"""
        return self.pwd_context.hash(password)

    # --- Authentication ---
    async def authenticate_user(self, email: str, password: str) -> Optional[Token]:
        """사용자 인증 (이메일 기반) 및 토큰 발급"""
        self.logger.info(f"사용자 인증 시도: {email}")
        try:
            user = await User.find_one({"email": email})
            if not user:
                self.logger.warning(f"인증 실패: 사용자 없음 - {email}")
                return None

            if not self.verify_password(password, user.hashed_password):
                self.logger.warning(f"인증 실패: 잘못된 비밀번호 - {email}")
                return None

            if not user.is_active:
                self.logger.warning(f"인증 실패: 비활성화된 계정 - {email}")
                # 필요시 명시적 에러 처리 또는 None 반환 유지
                # raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
                return None

            # 액세스 토큰 생성
            access_token = self._create_access_token(
                data={"sub": str(user.id), "email": user.email}
            )

            # 리프레시 토큰 생성 및 저장
            refresh_token, _ = await self._create_refresh_token(str(user.id))

            user_response = self._map_user_to_response(user)

            self.logger.info(f"사용자 인증 성공: {email}")

            return Token(
                access_token=access_token,
                refresh_token=refresh_token,
                token_type="bearer",
                user=user_response
            )
        except Exception as e:
            self.logger.error(f"사용자 인증 중 오류 발생: {str(e)}")
            raise # 에러를 다시 발생시켜 상위 핸들러가 처리하도록 함

    # --- User CRUD ---
    async def create_user(self, user_data: UserCreate) -> Optional[UserResponse]:
        """새로운 사용자 생성"""
        self.logger.info(f"새 사용자 생성 시도: {user_data.username}, {user_data.email}")
        try:
            if await User.find_one({"username": user_data.username}):
                self.logger.warning(f"사용자 생성 실패: 이미 존재하는 사용자명 - {user_data.username}")
                raise ValueError("Username already registered")

            if await User.find_one({"email": user_data.email}):
                self.logger.warning(f"사용자 생성 실패: 이미 존재하는 이메일 - {user_data.email}")
                raise ValueError("Email already registered")

            hashed_password = self.get_password_hash(user_data.password)
            now = datetime.utcnow()

            new_user = User(
                username=user_data.username,
                email=user_data.email,
                hashed_password=hashed_password,
                is_admin=getattr(user_data, 'is_admin', False),
                is_active=True, # 기본값 활성
                created_at=now,
                last_modified_at=now
            )
            await new_user.save()
            self.logger.info(f"새 사용자 생성 성공: {new_user.username}, {new_user.email}")

            return self._map_user_to_response(new_user)
        except ValueError as ve: # 중복 에러는 그대로 전달
             raise ve
        except Exception as e:
            self.logger.error(f"사용자 생성 중 오류 발생: {str(e)}")
            raise # 다른 에러는 다시 발생

    async def get_user_by_id(self, user_id: str) -> Optional[UserResponse]:
        """사용자 ID로 사용자 조회"""
        self.logger.debug(f"ID로 사용자 조회: {user_id}")
        try:
            user = await User.get(user_id) # Beanie의 get 메서드 활용
            if user:
                 self.logger.debug(f"사용자 조회 성공 (ID): {user_id}")
                 return self._map_user_to_response(user)
            else:
                 self.logger.info(f"사용자 조회 실패: 사용자 없음 (ID) - {user_id}")
                 return None
        except Exception as e:
            # ObjectId 변환 오류 등 처리
            if "Argument is not a valid ObjectId" in str(e):
                 self.logger.warning(f"잘못된 사용자 ID 형식: {user_id}")
                 return None
            self.logger.error(f"ID로 사용자 조회 중 오류: {str(e)}")
            raise

    async def get_user_by_username(self, username: str) -> Optional[UserResponse]:
        """사용자명으로 사용자 조회"""
        self.logger.info(f"사용자명으로 사용자 조회: {username}")
        try:
            user = await User.find_one({"username": username})
            if user:
                self.logger.info(f"사용자 조회 성공 (Username): {username}")
                return self._map_user_to_response(user)
            else:
                self.logger.info(f"사용자 조회 실패: 사용자 없음 (Username) - {username}")
                return None
        except Exception as e:
            self.logger.error(f"사용자명으로 조회 중 오류 발생: {str(e)}")
            raise

    async def get_user_by_email(self, email: str) -> Optional[UserResponse]:
        """이메일로 사용자 조회"""
        self.logger.info(f"이메일로 사용자 조회: {email}")
        try:
            user = await User.find_one({"email": email})
            if user:
                 self.logger.info(f"사용자 조회 성공 (Email): {email}")
                 return self._map_user_to_response(user)
            else:
                 self.logger.info(f"사용자 조회 실패: 사용자 없음 (Email) - {email}")
                 return None
        except Exception as e:
            self.logger.error(f"이메일로 조회 중 오류 발생: {str(e)}")
            raise

    async def update_user(self, user_id: str, user_data: UserUpdate) -> Optional[UserResponse]:
        """사용자 정보 수정"""
        self.logger.info(f"사용자 정보 수정 시도: {user_id}")
        self.logger.debug(f"수정 데이터: {json.dumps(user_data.dict(exclude_unset=True))}")
        try:
            user = await User.get(user_id)
            if not user:
                self.logger.warning(f"사용자 정보 수정 실패: 사용자 없음 - {user_id}")
                return None

            update_data = user_data.dict(exclude_unset=True)

            # 사용자명 또는 이메일 변경 시 중복 확인
            if "username" in update_data and update_data["username"] != user.username:
                 if await User.find_one({"username": update_data["username"], "_id": {"$ne": user.id}}):
                     raise ValueError("Username already registered by another user")
            if "email" in update_data and update_data["email"] != user.email:
                 if await User.find_one({"email": update_data["email"], "_id": {"$ne": user.id}}):
                     raise ValueError("Email already registered by another user")

            if "password" in update_data:
                update_data["hashed_password"] = self.get_password_hash(update_data.pop("password"))

            update_data["last_modified_at"] = datetime.utcnow()

            await user.update({"$set": update_data})

            # 업데이트된 사용자 정보 다시 로드 (update 후 user 객체가 자동으로 갱신되지 않을 수 있음)
            updated_user = await User.get(user_id)
            self.logger.info(f"사용자 정보 수정 성공: {user_id}")
            return self._map_user_to_response(updated_user)

        except ValueError as ve: # 중복 에러는 그대로 전달
             raise ve
        except Exception as e:
            self.logger.error(f"사용자 정보 수정 중 오류 발생: {str(e)}")
            raise

    async def delete_user(self, user_id: str) -> bool:
        """사용자 삭제"""
        self.logger.info(f"사용자 삭제 시도: {user_id}")
        try:
            user = await User.get(user_id)
            if not user:
                self.logger.warning(f"사용자 삭제 실패: 사용자 없음 - {user_id}")
                return False

            # 연결된 리프레시 토큰 삭제
            await RefreshToken.find({"user_id": PydanticObjectId(user_id)}).delete()
            # 사용자 삭제
            await user.delete()

            self.logger.info(f"사용자 삭제 성공: {user_id}")
            return True
        except Exception as e:
            self.logger.error(f"사용자 삭제 중 오류 발생: {str(e)}")
            raise

    async def search_users(self, query: str, current_user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """사용자 검색 (자동완성용)"""
        self.logger.info(f"사용자 검색: {query}")
        try:
            clean_query = query.replace("@", "").strip()
            self.logger.debug(f"정리된 쿼리: {clean_query}")

            # 현재 사용자는 제외
            filter_query = {"_id": {"$ne": PydanticObjectId(current_user_id)}}

            if clean_query:
                # 사용자명 또는 이메일 시작 부분 일치 (대소문자 구분 없음)
                 filter_query["$or"] = [
                     {"username": {"$regex": f"^{clean_query}", "$options": "i"}},
                     {"email": {"$regex": f"^{clean_query}", "$options": "i"}}
                 ]
            # else: 빈 쿼리면 모든 사용자 (현재 사용자 제외)

            users = await User.find(filter_query).sort("username").limit(limit).to_list()
            self.logger.info(f"검색 결과: {len(users)}명의 사용자 발견")

            result = [{"username": user.username, "displayName": user.username} for user in users]
            return result
        except Exception as e:
            self.logger.error(f"사용자 검색 중 오류 발생: {str(e)}")
            raise

    async def get_all_users(self) -> List[UserResponse]:
        """모든 사용자 목록 조회"""
        self.logger.info("모든 사용자 목록 조회")
        try:
            users = await User.find_all().to_list()
            self.logger.info(f"조회된 사용자 수: {len(users)}")
            return [self._map_user_to_response(user) for user in users]
        except Exception as e:
            self.logger.error(f"사용자 목록 조회 중 오류 발생: {str(e)}")
            raise

    # --- Token Handling (Internal) ---
    def _create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """액세스 토큰 생성"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES)

        to_encode.update({
            "exp": expire,
            "type": "access" # 토큰 타입 명시
        })
        encoded_jwt = jwt.encode(
            to_encode, self.settings.SECRET_KEY, algorithm=self.settings.ALGORITHM
        )
        return encoded_jwt

    async def _create_refresh_token(self, user_id: str) -> tuple[str, datetime]:
        """리프레시 토큰 생성 및 저장"""
        self.logger.debug(f"리프레시 토큰 생성: 사용자 ID {user_id}")
        expires_at = datetime.utcnow() + self.settings.REFRESH_TOKEN_EXPIRE_DELTA
        token = secrets.token_urlsafe(32)

        refresh_token_doc = RefreshToken(
            user_id=PydanticObjectId(user_id),
            token=token,
            expires_at=expires_at,
            is_revoked=False, # 기본값 false
            created_at=datetime.utcnow()
        )
        await refresh_token_doc.insert()
        self.logger.debug(f"리프레시 토큰 생성 완료: {token[:10]}... (만료: {expires_at})")
        return token, expires_at

    async def verify_refresh_token(self, token: str) -> Optional[UserResponse]:
        """리프레시 토큰 검증 및 사용자 정보 반환"""
        self.logger.debug(f"리프레시 토큰 검증: {token[:10]}...")
        try:
            refresh_token_doc = await RefreshToken.find_one({
                "token": token,
                "is_revoked": False,
                "expires_at": {"$gt": datetime.utcnow()}
            })

            if not refresh_token_doc:
                self.logger.warning("유효하지 않은 리프레시 토큰 또는 만료/폐기됨")
                return None

            user = await User.get(refresh_token_doc.user_id)
            if not user or not user.is_active:
                self.logger.warning(f"토큰에 해당하는 사용자 없음 또는 비활성: {refresh_token_doc.user_id}")
                # 토큰 유출 가능성? 해당 토큰 폐기 고려
                # await self.revoke_refresh_token(token) # 필요시 주석 해제
                return None

            self.logger.debug(f"리프레시 토큰 검증 성공: 사용자 {user.email}")
            return self._map_user_to_response(user)
        except Exception as e:
            self.logger.error(f"리프레시 토큰 검증 중 오류 발생: {str(e)}")
            raise

    async def revoke_refresh_token(self, token: str) -> bool:
        """리프레시 토큰 무효화"""
        self.logger.debug(f"리프레시 토큰 무효화 시도: {token[:10]}...")
        try:
            refresh_token_doc = await RefreshToken.find_one({"token": token})
            if not refresh_token_doc:
                self.logger.warning("무효화할 토큰을 찾을 수 없음")
                return False

            if refresh_token_doc.is_revoked:
                self.logger.debug("이미 무효화된 토큰")
                return True # 이미 처리됨

            refresh_token_doc.is_revoked = True
            refresh_token_doc.last_modified_at = datetime.utcnow() # 수정 시간 기록
            await refresh_token_doc.save()

            self.logger.debug("리프레시 토큰 무효화 성공")
            return True
        except Exception as e:
            self.logger.error(f"리프레시 토큰 무효화 중 오류 발생: {str(e)}")
            raise

    # --- Socket.IO Related ---
    async def get_user_by_session_id(self, sid: str) -> Optional[UserResponse]:
        """Socket.IO 세션 ID로 사용자 조회"""
        if self._socketio_manager is None:
            self.logger.error("socketio_manager가 설정되지 않았습니다.")
            return None
            
        self.logger.debug(f"Socket.IO 세션 ID로 사용자 조회: {sid}")
        try:
            user_id = self._socketio_manager.sid_to_user.get(sid)
            if not user_id:
                self.logger.info(f"Socket.IO 세션 ID({sid})에 해당하는 사용자 ID 없음")
                return None

            self.logger.debug(f"Socket.IO 세션 {sid}에 해당하는 사용자 ID 발견: {user_id}")
            # get_user_by_id 재사용
            return await self.get_user_by_id(user_id)

        except Exception as e:
            self.logger.error(f"Socket.IO 세션 ID로 사용자 조회 중 오류: {str(e)}")
            self.logger.error(traceback.format_exc())
            return None  # 오류 발생 시 None 반환

    # --- Helper Methods ---
    def _map_user_to_response(self, user: User) -> UserResponse:
        """User 모델 객체를 UserResponse 스키마로 변환"""
        return UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            is_admin=user.is_admin,
            is_active=user.is_active,
            created_at=user.created_at,
            last_modified_at=user.last_modified_at
        )

    async def decode_access_token(self, token: str) -> Optional[TokenData]:
        """액세스 토큰 검증 및 페이로드 반환 (내부 및 외부 사용 가능)"""
        try:
            payload = jwt.decode(
                token,
                self.settings.SECRET_KEY,
                algorithms=[self.settings.ALGORITHM]
            )
            # 토큰 타입 확인 (선택 사항이지만 권장)
            token_type = payload.get("type")
            if token_type != "access":
                 self.logger.warning(f"잘못된 토큰 타입 수신: {token_type}")
                 return None

            email: Optional[str] = payload.get("email")
            user_id: Optional[str] = payload.get("sub") # 'sub' 클레임 사용

            if email is None or user_id is None:
                 self.logger.error("토큰에 필수 클레임(email, sub) 부족")
                 return None

            # 추가 검증: payload의 user_id와 email이 실제 DB와 일치하는지 등 (선택 사항)

            return TokenData(email=email, user_id=user_id) # 필요시 TokenData 스키마 확장

        except JWTError as e:
            self.logger.error(f"액세스 토큰 디코드 오류: {str(e)}")
            return None
        except Exception as e:
             self.logger.error(f"액세스 토큰 처리 중 예상치 못한 오류: {str(e)}")
             return None


# --- FastAPI Dependency Functions ---

# UserService 인스턴스 생성 (싱글톤처럼 사용하거나 요청마다 생성할 수 있음)
# FastAPI의 Depends를 활용하여 주입하는 것이 더 일반적이나, 여기서는 간단하게 전역 인스턴스 사용
user_service_instance = UserService()

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """현재 인증된 사용자 조회 (FastAPI 의존성)"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = await user_service_instance.decode_access_token(token)
    if not token_data or not token_data.email:
        logger.warning(f"토큰 검증 실패 또는 이메일 정보 없음: {token[:10]}...")
        raise credentials_exception

    # TokenData에 user_id도 포함하여 바로 ID로 조회하도록 개선 가능
    # user = await User.get(token_data.user_id)
    user = await User.find_one({"email": token_data.email}) # decode에서 email만 반환 시

    if user is None:
        logger.error(f"토큰의 이메일에 해당하는 사용자를 찾을 수 없음: {token_data.email}")
        raise credentials_exception

    if not user.is_active:
        logger.warning(f"비활성화된 사용자에 대한 접근 시도: {user.email}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    logger.debug(f"현재 사용자 확인됨: {user.email}")
    return user # FastAPI 경로 함수에서는 User 모델 직접 사용 가능

async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """현재 인증된 사용자가 관리자인지 확인 (FastAPI 의존성)"""
    if not current_user.is_admin:
        logger.warning(f"관리자 권한 없는 접근 시도: {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    logger.debug(f"관리자 사용자 확인됨: {current_user.email}")
    return current_user

# --- Standalone Verification (Optional) ---

async def verify_token(token: str) -> Optional[User]:
    """
    토큰(액세스)을 검증하고 해당 사용자 모델 반환 (FastAPI 의존성 없이 사용 가능)
    주로 WebSocket 등 HTTP 요청 컨텍스트 외부에서 사용될 수 있음
    """
    logger.debug(f"Standalone 토큰 검증 시도: {token[:10]}...")
    token_data = await user_service_instance.decode_access_token(token)

    if not token_data or not token_data.email:
         logger.warning("Standalone 토큰 검증 실패 또는 이메일 정보 없음")
         return None

    # User 모델 조회
    user = await User.find_one({"email": token_data.email})

    if user is None:
         logger.error(f"Standalone 검증: 이메일에 해당하는 사용자 없음 - {token_data.email}")
         return None

    if not user.is_active:
         logger.warning(f"Standalone 검증: 비활성화된 사용자 - {user.email}")
         return None # 비활성 사용자는 인증 실패로 간주

    logger.debug(f"Standalone 토큰 검증 성공: 사용자 {user.email}")
    return user