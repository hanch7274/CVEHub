from typing import Optional, List, Dict, Any
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt
import logging
import json
from beanie import PydanticObjectId
from ..models.user import User, RefreshToken
from ..schemas.user import UserCreate, UserUpdate, UserResponse, Token, TokenData
from ..core.config import get_settings

class UserService:
    """사용자 관련 서비스"""
    
    def __init__(self):
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """비밀번호 검증"""
        return self.pwd_context.verify(plain_password, hashed_password)
    
    def get_password_hash(self, password: str) -> str:
        """비밀번호 해싱"""
        return self.pwd_context.hash(password)
    
    async def authenticate_user(self, email: str, password: str) -> Optional[Token]:
        """사용자 인증 (이메일 기반)"""
        self.logger.info(f"사용자 인증 시도: {email}")
        
        try:
            user = await User.find_one({"email": email})
            if not user:
                self.logger.warning(f"인증 실패: 사용자 없음 - {email}")
                return None
                
            if not self.verify_password(password, user.hashed_password):
                self.logger.warning(f"인증 실패: 잘못된 비밀번호 - {email}")
                return None
                
            # 액세스 토큰 생성
            access_token = self._create_access_token(
                data={"sub": str(user.id), "email": user.email}
            )
            
            # 리프레시 토큰 생성 및 저장
            refresh_token, _ = await self._create_refresh_token(str(user.id))
            
            # UserResponse 모델로 변환
            user_response = UserResponse(
                id=str(user.id),
                username=user.username,
                email=user.email,
                is_admin=user.is_admin,
                is_active=user.is_active,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
            
            self.logger.info(f"사용자 인증 성공: {email}")
            
            return Token(
                access_token=access_token,
                refresh_token=refresh_token,
                token_type="bearer",
                user=user_response
            )
        except Exception as e:
            self.logger.error(f"사용자 인증 중 오류 발생: {str(e)}")
            raise
    
    async def create_user(self, user_data: UserCreate) -> Optional[UserResponse]:
        """새로운 사용자 생성"""
        self.logger.info(f"새 사용자 생성 시도: {user_data.username}, {user_data.email}")
        
        try:
            # 사용자명 중복 확인
            existing_user = await User.find_one({"username": user_data.username})
            if existing_user:
                self.logger.warning(f"사용자 생성 실패: 이미 존재하는 사용자명 - {user_data.username}")
                raise ValueError("Username already registered")
            
            # 이메일 중복 확인
            existing_email = await User.find_one({"email": user_data.email})
            if existing_email:
                self.logger.warning(f"사용자 생성 실패: 이미 존재하는 이메일 - {user_data.email}")
                raise ValueError("Email already registered")
            
            # 새 사용자 생성
            hashed_password = self.get_password_hash(user_data.password)
            now = datetime.utcnow()
            
            new_user = User(
                username=user_data.username,
                email=user_data.email,
                hashed_password=hashed_password,
                is_admin=getattr(user_data, 'is_admin', False),
                is_active=True,
                created_at=now,
                updated_at=now
            )
            
            await new_user.save()
            self.logger.info(f"새 사용자 생성 성공: {user_data.username}, {user_data.email}")
            
            return UserResponse(
                id=str(new_user.id),
                username=new_user.username,
                email=new_user.email,
                is_admin=new_user.is_admin,
                is_active=new_user.is_active,
                created_at=new_user.created_at,
                updated_at=new_user.updated_at
            )
        except Exception as e:
            self.logger.error(f"사용자 생성 중 오류 발생: {str(e)}")
            raise
    
    async def get_user_by_username(self, username: str) -> Optional[UserResponse]:
        """사용자명으로 사용자 조회"""
        self.logger.info(f"사용자명으로 사용자 조회: {username}")
        
        try:
            user = await User.find_one({"username": username})
            if not user:
                self.logger.info(f"사용자 조회 실패: 사용자 없음 - {username}")
                return None
                
            self.logger.info(f"사용자 조회 성공: {username}")
            return UserResponse(
                id=str(user.id),
                username=user.username,
                email=user.email,
                is_admin=user.is_admin,
                is_active=user.is_active,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
        except Exception as e:
            self.logger.error(f"사용자 조회 중 오류 발생: {str(e)}")
            raise
    
    async def get_user_by_email(self, email: str) -> Optional[UserResponse]:
        """이메일로 사용자 조회"""
        self.logger.info(f"이메일로 사용자 조회: {email}")
        
        try:
            user = await User.find_one({"email": email})
            if not user:
                self.logger.info(f"사용자 조회 실패: 사용자 없음 - {email}")
                return None
                
            self.logger.info(f"사용자 조회 성공: {email}")
            return UserResponse(
                id=str(user.id),
                username=user.username,
                email=user.email,
                is_admin=user.is_admin,
                is_active=user.is_active,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
        except Exception as e:
            self.logger.error(f"사용자 조회 중 오류 발생: {str(e)}")
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
            
            # 수정할 필드만 추출
            update_data = {k: v for k, v in user_data.dict(exclude_unset=True).items()}
            
            # 비밀번호 변경이 포함된 경우 해싱 처리
            if "password" in update_data:
                update_data["hashed_password"] = self.get_password_hash(update_data.pop("password"))
            
            # 업데이트 시간 설정
            update_data["updated_at"] = datetime.utcnow()
            
            # 사용자 정보 업데이트
            await user.update({"$set": update_data})
            
            # 업데이트된 사용자 정보 조회
            updated_user = await User.get(user_id)
            self.logger.info(f"사용자 정보 수정 성공: {user_id}")
            
            return UserResponse(
                id=str(updated_user.id),
                username=updated_user.username,
                email=updated_user.email,
                is_admin=updated_user.is_admin,
                is_active=updated_user.is_active,
                created_at=updated_user.created_at,
                updated_at=updated_user.updated_at
            )
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
            
            # 사용자 및 관련 리프레시 토큰 삭제
            await user.delete()
            await RefreshToken.find({"user_id": PydanticObjectId(user_id)}).delete()
            
            self.logger.info(f"사용자 삭제 성공: {user_id}")
            return True
        except Exception as e:
            self.logger.error(f"사용자 삭제 중 오류 발생: {str(e)}")
            raise
    
    async def search_users(self, query: str, current_user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """사용자 검색 (자동완성용)"""
        self.logger.info(f"사용자 검색: {query}")
        
        try:
            # 쿼리에서 @ 기호 제거
            clean_query = query.replace("@", "").strip()
            self.logger.debug(f"정리된 쿼리: {clean_query}")
            
            # 빈 쿼리이거나 '@'만 입력된 경우 모든 사용자 반환
            if not clean_query:
                users = await User.find(
                    {"_id": {"$ne": PydanticObjectId(current_user_id)}}
                ).sort("username").limit(limit).to_list()
            else:
                users = await User.find(
                    {
                        "username": {
                            "$regex": f"^{clean_query}", 
                            "$options": "i"
                        },
                        "_id": {"$ne": PydanticObjectId(current_user_id)}
                    }
                ).sort("username").limit(limit).to_list()
            
            self.logger.info(f"검색 결과: {len(users)}명의 사용자 발견")
            
            result = [
                {
                    "username": user.username,
                    "displayName": user.username
                } 
                for user in users
            ]
            
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
            
            return [
                UserResponse(
                    id=str(user.id),
                    username=user.username,
                    email=user.email,
                    is_admin=user.is_admin,
                    is_active=user.is_active,
                    created_at=user.created_at,
                    updated_at=user.updated_at
                )
                for user in users
            ]
        except Exception as e:
            self.logger.error(f"사용자 목록 조회 중 오류 발생: {str(e)}")
            raise
    
    def _create_access_token(self, data: dict) -> str:
        """액세스 토큰 생성"""
        to_encode = data.copy()
        
        # 만료 시간 설정
        expire = datetime.utcnow() + timedelta(minutes=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({
            "exp": expire,
            "type": "access"
        })
        
        # JWT 토큰 생성
        encoded_jwt = jwt.encode(
            to_encode,
            self.settings.SECRET_KEY,
            algorithm=self.settings.ALGORITHM
        )
        
        return encoded_jwt
    
    async def _create_refresh_token(self, user_id: str) -> tuple[str, datetime]:
        """리프레시 토큰 생성 및 저장"""
        import secrets
        
        self.logger.debug(f"리프레시 토큰 생성: 사용자 ID {user_id}")
        
        # 만료 시간 설정
        expires_at = datetime.utcnow() + self.settings.REFRESH_TOKEN_EXPIRE_DELTA
        token = secrets.token_urlsafe(32)
        
        # 리프레시 토큰 저장
        refresh_token = RefreshToken(
            user_id=PydanticObjectId(user_id),
            token=token,
            expires_at=expires_at,
            is_revoked=False,
            created_at=datetime.utcnow()
        )
        await refresh_token.insert()
        
        self.logger.debug(f"리프레시 토큰 생성 완료: {token[:10]}... (만료: {expires_at})")
        return token, expires_at
    
    async def verify_refresh_token(self, token: str) -> Optional[UserResponse]:
        """리프레시 토큰 검증"""
        self.logger.debug(f"리프레시 토큰 검증: {token[:10]}...")
        
        try:
            # 유효한 리프레시 토큰 조회
            refresh_token = await RefreshToken.find_one({
                "token": token,
                "is_revoked": False,
                "expires_at": {"$gt": datetime.utcnow()}
            })
            
            if not refresh_token:
                self.logger.warning("유효하지 않은 리프레시 토큰")
                return None
            
            # 사용자 조회
            user = await User.get(refresh_token.user_id)
            if not user:
                self.logger.warning(f"토큰에 해당하는 사용자를 찾을 수 없음: {refresh_token.user_id}")
                return None
            
            self.logger.debug(f"리프레시 토큰 검증 성공: 사용자 {user.email}")
            
            return UserResponse(
                id=str(user.id),
                username=user.username,
                email=user.email,
                is_admin=user.is_admin,
                is_active=user.is_active,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
        except Exception as e:
            self.logger.error(f"리프레시 토큰 검증 중 오류 발생: {str(e)}")
            raise
    
    async def revoke_refresh_token(self, token: str) -> bool:
        """리프레시 토큰 무효화"""
        self.logger.debug(f"리프레시 토큰 무효화 시도: {token[:10]}...")
        
        try:
            # 리프레시 토큰 조회
            refresh_token = await RefreshToken.find_one({"token": token})
            
            if not refresh_token:
                self.logger.warning("무효화할 토큰을 찾을 수 없음")
                return False
            
            # 토큰 무효화
            refresh_token.is_revoked = True
            await refresh_token.save()
            
            self.logger.debug("리프레시 토큰 무효화 성공")
            return True
        except Exception as e:
            self.logger.error(f"리프레시 토큰 무효화 중 오류 발생: {str(e)}")
            raise