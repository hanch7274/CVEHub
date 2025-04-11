"""
사용자 인증 관련 스키마 정의
"""
from typing import Dict, List, Any, Optional

class AuthSchemaDefinition:
    """인증 관련 스키마 정의 클래스"""
    
    def __init__(self):
        # 사용자 모델 스키마
        self.user_models = [
            {
                'name': 'UserBase',
                'fields': [
                    {'name': 'username', 'type': 'str', 'required': True, 'description': '사용자 이름'},
                    {'name': 'email', 'type': 'EmailStr', 'required': True, 'description': '이메일'},
                    {'name': 'is_active', 'type': 'bool', 'default': 'True', 'description': '활성화 여부'},
                    {'name': 'is_admin', 'type': 'bool', 'default': 'False', 'description': '관리자 여부'}
                ],
                'inherits': ['UserBaseMixin', 'BaseSchema'],
                'is_base': True,
                'example': {
                    'username': 'johndoe',
                    'email': 'johndoe@example.com',
                    'is_active': True,
                    'is_admin': False
                }
            },
            {
                'name': 'UserCreate',
                'fields': [
                    {'name': 'password', 'type': 'str', 'required': True, 'description': '비밀번호'}
                ],
                'inherits': ['UserBase'],
                'is_request': True,
                'example': {
                    'username': 'johndoe',
                    'email': 'johndoe@example.com',
                    'password': 'password123',
                    'is_active': True,
                    'is_admin': False
                }
            },
            {
                'name': 'UserUpdate',
                'fields': [
                    {'name': 'email', 'type': 'Optional[EmailStr]', 'default': 'None', 'description': '이메일'},
                    {'name': 'full_name', 'type': 'Optional[str]', 'default': 'None', 'description': '전체 이름'},
                    {'name': 'is_active', 'type': 'Optional[bool]', 'default': 'None', 'description': '활성화 여부'},
                    {'name': 'is_admin', 'type': 'Optional[bool]', 'default': 'None', 'description': '관리자 여부'},
                    {'name': 'password', 'type': 'Optional[str]', 'default': 'None', 'description': '비밀번호'}
                ],
                'inherits': ['BaseSchema'],
                'is_request': True,
                'example': {
                    'email': 'johndoe-updated@example.com',
                    'full_name': 'John Doe Updated',
                    'is_active': True,
                    'is_admin': False,
                    'password': 'newpassword123'
                }
            },
            {
                'name': 'UserResponse',
                'fields': [
                    {'name': 'id', 'type': 'str', 'required': True, 'description': '사용자 ID'},
                    {'name': 'full_name', 'type': 'Optional[str]', 'default': 'None', 'description': '전체 이름'}
                ],
                'inherits': ['UserBase', 'TimestampMixin'],
                'is_response': True,
                'example': {
                    'id': '507f1f77bcf86cd799439011',
                    'username': 'johndoe',
                    'email': 'johndoe@example.com',
                    'full_name': 'John Doe',
                    'is_active': True,
                    'is_admin': False,
                    'created_at': '2023-01-01T00:00:00Z',
                    'last_modified_at': '2023-01-01T00:00:00Z'
                }
            },
            {
                'name': 'UserInDB',
                'fields': [
                    {'name': 'id', 'type': 'str', 'required': True, 'description': '사용자 ID'},
                    {'name': 'hashed_password', 'type': 'str', 'required': True, 'description': '해시된 비밀번호'},
                    {'name': 'full_name', 'type': 'Optional[str]', 'default': 'None', 'description': '전체 이름'},
                    {'name': 'created_at', 'type': 'datetime', 'required': True, 'description': '생성 시간'},
                    {'name': 'last_modified_at', 'type': 'datetime', 'required': True, 'description': '마지막 수정 시간'}
                ],
                'inherits': ['UserBase'],
                'is_internal': True
            },
            {
                'name': 'UserSearchResponse',
                'fields': [
                    {'name': 'username', 'type': 'str', 'required': True, 'description': '사용자 이름'},
                    {'name': 'displayName', 'type': 'str', 'required': True, 'description': '표시 이름'}
                ],
                'inherits': ['BaseSchema'],
                'is_response': True,
                'example': {
                    'username': 'johndoe',
                    'displayName': 'John Doe'
                }
            }
        ]

        # 토큰 관련 모델 스키마
        self.token_models = [
            {
                'name': 'TokenData',
                'fields': [
                    {'name': 'sub', 'type': 'Optional[str]', 'default': 'None', 'description': '토큰 주체 (사용자 ID)'},
                    {'name': 'email', 'type': 'Optional[str]', 'default': 'None', 'description': '사용자 이메일'},
                    {'name': 'token_type', 'type': 'Optional[str]', 'default': 'None', 'description': '토큰 타입'},
                    {'name': 'exp', 'type': 'Optional[int]', 'default': 'None', 'description': '만료 시간'}
                ],
                'inherits': ['BaseSchema'],
                'is_internal': True
            },
            {
                'name': 'Token',
                'fields': [
                    {'name': 'access_token', 'type': 'str', 'required': True, 'description': '액세스 토큰'},
                    {'name': 'refresh_token', 'type': 'str', 'required': True, 'description': '리프레시 토큰'},
                    {'name': 'token_type', 'type': 'str', 'required': True, 'description': '토큰 타입'},
                    {'name': 'user', 'type': 'UserResponse', 'required': True, 'description': '사용자 정보'}
                ],
                'inherits': ['BaseSchema'],
                'is_response': True,
                'example': {
                    'access_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                    'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                    'token_type': 'bearer',
                    'user': {
                        'id': '507f1f77bcf86cd799439011',
                        'username': 'johndoe',
                        'email': 'johndoe@example.com',
                        'is_active': True,
                        'is_admin': False
                    }
                }
            },
            {
                'name': 'RefreshTokenRequest',
                'fields': [
                    {'name': 'refresh_token', 'type': 'str', 'required': True, 'description': '리프레시 토큰'}
                ],
                'inherits': ['BaseSchema'],
                'is_request': True,
                'example': {
                    'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                }
            },
            {
                'name': 'LoginRequest',
                'fields': [
                    {'name': 'username', 'type': 'str', 'required': True, 'description': '사용자 이름 또는 이메일'},
                    {'name': 'password', 'type': 'str', 'required': True, 'description': '비밀번호'}
                ],
                'inherits': ['BaseSchema'],
                'is_request': True,
                'example': {
                    'username': 'johndoe@example.com',
                    'password': 'password123'
                }
            },
            {
                'name': 'LogoutRequest',
                'fields': [
                    {'name': 'refresh_token', 'type': 'str', 'required': True, 'description': '리프레시 토큰'}
                ],
                'inherits': ['BaseSchema'],
                'is_request': True,
                'example': {
                    'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                }
            }
        ]

        # 문서 모델 스키마
        self.document_models = [
            {
                'name': 'User',
                'fields': [
                    {'name': 'username', 'type': 'str', 'required': True, 'description': '사용자 이름'},
                    {'name': 'email', 'type': 'EmailStr', 'required': True, 'description': '이메일'},
                    {'name': 'hashed_password', 'type': 'str', 'required': True, 'description': '해시된 비밀번호'},
                    {'name': 'full_name', 'type': 'Optional[str]', 'default': 'None', 'description': '전체 이름'},
                    {'name': 'is_active', 'type': 'bool', 'default': 'True', 'description': '활성화 여부'},
                    {'name': 'is_admin', 'type': 'bool', 'default': 'False', 'description': '관리자 여부'}
                ],
                'inherits': ['BaseDocument'],
                'collection_name': 'users',
                'indexes': [
                    {'field': 'username', 'unique': False},
                    {'field': 'email', 'unique': False}
                ],
                'methods': [
                    {
                        'name': 'is_authenticated',
                        'return_type': 'bool',
                        'is_property': True,
                        'code': 'return True if self.is_active else False',
                        'docstring': '사용자 인증 여부'
                    },
                    {
                        'name': 'to_dict',
                        'return_type': 'Dict[str, Any]',
                        'is_property': False,
                        'code': 'return {\n    "id": str(self.id),\n    "username": self.username,\n    "email": self.email,\n    "full_name": self.full_name,\n    "is_active": self.is_active,\n    "is_admin": self.is_admin,\n    "created_at": self.created_at,\n    "last_modified_at": self.last_modified_at\n}',
                        'docstring': 'User 객체를 dictionary로 변환'
                    }
                ]
            },
            {
                'name': 'RefreshToken',
                'fields': [
                    {'name': 'user_id', 'type': 'PydanticObjectId', 'required': True, 'description': '사용자 ID'},
                    {'name': 'token', 'type': 'str', 'required': True, 'description': '토큰'},
                    {'name': 'expires_at', 'type': 'datetime', 'required': True, 'description': '만료 시간'},
                    {'name': 'is_revoked', 'type': 'bool', 'default': 'False', 'description': '취소 여부'}
                ],
                'inherits': ['BaseDocument'],
                'collection_name': 'refresh_tokens',
                'indexes': [
                    {'field': 'user_id', 'unique': False},
                    {'field': 'token', 'unique': False},
                    {'field': 'expires_at', 'unique': False}
                ]
            }
        ]
