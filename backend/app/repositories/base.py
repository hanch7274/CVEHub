from typing import Generic, TypeVar, Optional, List, Type
from beanie import Document
from pydantic import BaseModel
from ..database import get_database

ModelType = TypeVar("ModelType", bound=Document)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model
        self.db = get_database()

    async def get(self, id: str) -> Optional[ModelType]:
        """ID로 단일 문서를 조회합니다."""
        return await self.model.get(id)

    async def get_by_field(self, field: str, value: any) -> Optional[ModelType]:
        """특정 필드 값으로 단일 문서를 조회합니다."""
        return await self.model.find_one({field: value})

    async def get_all(self, skip: int = 0, limit: int = 10) -> List[ModelType]:
        """모든 객체를 조회합니다."""
        return await self.model.find().skip(skip).limit(limit).to_list()

    async def create(self, data):
        """새로운 객체를 생성합니다."""
        # Pydantic 모델인 경우 dict()를 호출하고, dictionary인 경우 그대로 사용
        if hasattr(data, 'dict'):
            data = data.dict()
        obj = self.model(**data)
        await obj.insert()
        return obj

    async def update(self, obj):
        """객체를 업데이트합니다."""
        await obj.save()
        return obj

    async def delete(self, id: str) -> bool:
        """객체를 삭제합니다."""
        obj = await self.get(id)
        if obj:
            await obj.delete()
            return True
        return False

    async def count(self, filter_query=None) -> int:
        """객체의 수를 반환합니다."""
        if filter_query:
            return await self.model.find(filter_query).count()
        return await self.model.find().count()

    async def update_one(self, filter_query: dict, update_data: dict) -> Optional[ModelType]:
        """필터 조건에 맞는 단일 문서를 업데이트합니다."""
        result = await self.model.find_one(filter_query)
        if result:
            # $set 연산자가 있는 경우와 없는 경우를 모두 처리
            if "$set" in update_data:
                await result.update(update_data)
            else:
                await result.update({"$set": update_data})
            return result
        return None 