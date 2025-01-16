from typing import Optional
from pydantic import BaseModel
from beanie import Document

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
