from typing import Generic, TypeVar, Optional, List, Type
from beanie import Document
from pydantic import BaseModel

ModelType = TypeVar("ModelType", bound=Document)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, id: str) -> Optional[ModelType]:
        """ID로 단일 문서를 조회합니다."""
        return await self.model.get(id)

    async def get_by_field(self, field: str, value: any) -> Optional[ModelType]:
        """특정 필드 값으로 단일 문서를 조회합니다."""
        return await self.model.find_one({field: value})

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[ModelType]:
        """모든 문서를 조회합니다."""
        return await self.model.find_all().skip(skip).limit(limit).to_list()

    async def create(self, data: CreateSchemaType) -> ModelType:
        """새로운 문서를 생성합니다."""
        obj = self.model(**data.dict())
        await obj.insert()
        return obj

    async def update(self, id: str, data: UpdateSchemaType) -> Optional[ModelType]:
        """문서를 수정합니다."""
        obj = await self.get(id)
        if obj:
            for key, value in data.dict(exclude_unset=True).items():
                setattr(obj, key, value)
            await obj.save()
        return obj

    async def delete(self, id: str) -> bool:
        """문서를 삭제합니다."""
        obj = await self.get(id)
        if obj:
            await obj.delete()
            return True
        return False

    async def count(self, filter_query: dict = None) -> int:
        """문서 수를 계산합니다."""
        if filter_query:
            return await self.model.find(filter_query).count()
        return await self.model.find_all().count() 