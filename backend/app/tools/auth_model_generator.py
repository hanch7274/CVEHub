"""
스키마 정의에서 Auth 관련 Beanie 모델을 자동 생성하는 유틸리티
"""
import sys
import os
from pathlib import Path
import jinja2
from datetime import datetime
import importlib
import inspect
import re
import importlib.util

# 템플릿 디렉토리 설정
template_dir = Path(__file__).parent / "templates"
env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(template_dir),
    trim_blocks=True,
    lstrip_blocks=True
)

def normalize_class_name(name):
    """
    임베디드 모델 이름을 일관된 규칙으로 변환
    - 매핑 테이블을 통한 명시적 클래스명 변환
    - snake_case를 PascalCase로 변환
    """
    # 단수형 이름으로 변환 (복수형인 경우)
    singular_name = name[:-1] if name.endswith('s') else name
    
    # 명시적 매핑 테이블 (단수형 키 사용)
    class_name_map = {
        "user": "User",
        "users": "User",
        "token": "Token",
        "refresh_token": "RefreshToken",
        "token_data": "TokenData"
    }
    
    # 매핑 테이블에 있으면 해당 이름 반환
    if singular_name in class_name_map:
        return class_name_map[singular_name]
    
    # 기본 변환 로직: snake_case를 PascalCase로 변환
    return ''.join(word.capitalize() for word in singular_name.split('_'))

def get_serialize_datetime_function():
    """
    날짜 직렬화 함수 정의 반환
    models.py와 동일한 방식의 직렬화 함수 사용
    """
    return '''
def serialize_datetime(dt):
    """datetime 객체를 ISO 8601 형식의 문자열로 직렬화"""
    if not dt:
        return None
    return dt.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z')
'''

def extract_methods_from_model(model_class):
    """
    모델 클래스에서 메서드 추출
    """
    methods = {}
    
    # 클래스의 모든 속성 검사
    for name, method in inspect.getmembers(model_class, predicate=inspect.isfunction):
        if not name.startswith('__'):  # 매직 메서드 제외
            # 메서드 소스 코드와 데코레이터 정보 저장
            methods[name] = {
                'source': inspect.getsource(method),
                'decorators': [d for d in getattr(method, '__decorators__', [])]
            }
    
    return methods

def generate_auth_model():
    """AuthSchemaDefinition에서 Beanie 모델 클래스 생성"""
    # AuthSchemaDefinition 동적 임포트
    try:
        auth_schema_module = importlib.import_module('app.schemas.auth_schema')
        schema = auth_schema_module.AuthSchemaDefinition()
        
        # 기존 모델 클래스 임포트 시도 (메서드 추출용)
        model_classes = {}
        try:
            # 직접 import 하지 않고 importlib.util을 사용하여 모듈 존재 여부 확인
            module_spec = importlib.util.find_spec('app.auth.models')
            
            if module_spec is not None:
                # 순환 참조를 피하기 위해 동적으로 임포트
                models_module = importlib.import_module('app.auth.models')
                model_classes = {
                    name: cls for name, cls in inspect.getmembers(models_module, predicate=inspect.isclass)
                    if not name.startswith('__') and name not in ['BaseModel', 'Document', 'BaseDocument', 'BaseSchema', 'TimestampMixin', 'UserBaseMixin']
                }
                print("기존 모델에서 메서드 추출 성공")
            else:
                print("models.py 모듈을 찾을 수 없음 - 기본 메서드로 생성합니다")
                # 모듈이 없는 경우에도 진행, model_classes는 빈 딕셔너리로 유지
                
        except (ImportError, AttributeError) as e:
            print(f"기존 모델 클래스 임포트 실패 - 기본 메서드로 생성합니다: {e}")
            # 예외가 발생해도 진행, model_classes는 빈 딕셔너리로 유지
    
    except (ImportError, AttributeError) as e:
        print(f"AuthSchemaDefinition 임포트 실패: {e}")
        return
    
    # 모델 메서드 추출 (기존 모델이 없는 경우 빈 딕셔너리 사용)
    methods_by_class = {}
    for model_name, model_class in model_classes.items():
        methods_by_class[model_name] = extract_methods_from_model(model_class)
    
    # 기본 메서드 추가 (기존 모델이 없는 경우 기본 제공)
    # User 클래스에 기본 메서드 추가
    if 'User' not in methods_by_class:
        methods_by_class['User'] = [
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
    
    template = env.get_template("auth_model.py.jinja2")
    
    output = template.render(
        schema=schema,
        methods_by_class=methods_by_class,
        generation_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        serialize_datetime_function=get_serialize_datetime_function(),
        normalize_class_name=normalize_class_name
    )
    
    # 출력 파일 경로
    output_path = Path(__file__).parent.parent / "auth" / "models.py"
    
    # 출력 디렉토리 확인
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 파일 생성
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    
    print(f"Auth 모델 생성 완료: {output_path}")

if __name__ == "__main__":
    generate_auth_model()
