from typing import Optional
from passlib.context import CryptContext
from ..models.user import User, UserCreate, UserInDB

class UserService:
    """사용자 관련 서비스"""
    
    def __init__(self):
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """비밀번호 검증"""
        return self.pwd_context.verify(plain_password, hashed_password)
    
    def get_password_hash(self, password: str) -> str:
        """비밀번호 해싱"""
        return self.pwd_context.hash(password)
    
    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """사용자 인증 (이메일 기반)"""
        user = await User.find_one({"email": email})
        if not user:
            return None
        if not self.verify_password(password, user.hashed_password):
            return None
        return user
    
    async def create_user(self, user_data: UserCreate) -> User:
        """새로운 사용자 생성"""
        # 사용자명 중복 확인
        existing_user = await User.find_one({"username": user_data.username})
        if existing_user:
            raise ValueError("Username already registered")
        
        # 이메일 중복 확인
        existing_email = await User.find_one({"email": user_data.email})
        if existing_email:
            raise ValueError("Email already registered")
        
        # 새 사용자 생성
        hashed_password = self.get_password_hash(user_data.password)
        new_user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password,
            is_admin=getattr(user_data, 'is_admin', False)
        )
        await new_user.save()
        return new_user
    
    async def get_user_by_username(self, username: str) -> Optional[User]:
        """사용자명으로 사용자 조회"""
        return await User.find_one({"username": username})
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """이메일로 사용자 조회"""
        return await User.find_one({"email": email}) 