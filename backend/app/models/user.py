from typing import Optional
from pydantic import BaseModel
from beanie import Document
from datetime import datetime

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    is_admin: bool = False

class User(Document):
    username: str
    email: str
    hashed_password: str
    is_admin: bool = False
    created_at: datetime = datetime.utcnow()
    
    class Settings:
        name = "users"
        
    class Config:
        json_schema_extra = {  
            "example": {
                "username": "johndoe",
                "email": "johndoe@example.com",
                "hashed_password": "hashedversion",
                "is_admin": False
            }
        }
        
    def to_dict(self):
        """User 객체를 dictionary로 변환"""
        return {
            "username": self.username,
            "email": self.email,
            "is_admin": self.is_admin
        }
