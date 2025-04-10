"""
스키마 정의에서 Beanie 모델을 자동 생성하는 유틸리티
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

# 스키마 이름 변환 함수 정의
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
        "comment": "Comment",
        "poc": "PoC",
        "reference": "Reference",
        "snort_rule": "SnortRule",
        "change_item": "ChangeItem"
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
    return """
def serialize_datetime(dt):
    \"\"\"datetime 객체를 ISO 8601 형식의 문자열로 직렬화\"\"\"
    if not dt:
        return None
    return dt.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z')
"""

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

def generate_beanie_model():
    """CVESchemaDefinition에서 Beanie 모델 클래스 생성"""
    # CVESchemaDefinition 동적 임포트
    try:
        cve_schema_module = importlib.import_module('app.schemas.cve_schema')
        schema = cve_schema_module.CVESchemaDefinition()
        
        # 기존 모델 클래스 임포트 시도 (메서드 추출용)
        model_classes = {}
        try:
            # 직접 import 하지 않고 importlib.util을 사용하여 모듈 존재 여부 확인
            module_spec = importlib.util.find_spec('app.cve.models')
            
            if module_spec is not None:
                # 순환 참조를 피하기 위해 동적으로 임포트
                models_module = importlib.import_module('app.cve.models')
                model_classes = {
                    name: cls for name, cls in inspect.getmembers(models_module, predicate=inspect.isclass)
                    if not name.startswith('__') and name not in ['BaseModel', 'Document', 'BaseDocument']
                }
                print("기존 모델에서 메서드 추출 성공")
            else:
                print("models.py 모듈을 찾을 수 없음 (메서드 추출 생략)")
                
        except (ImportError, AttributeError) as e:
            print(f"기존 모델 클래스 임포트 실패 (메서드 추출 생략): {e}")
            
    except (ImportError, AttributeError) as e:
        print(f"CVESchemaDefinition 임포트 실패: {e}")
        return
    
    # 임베디드 모델 클래스명 정규화
    normalized_models = {}
    methods_by_class = {}
    
    for name, model in schema.embedded_models.items():
        if name != "modification_history":
            normalized_name = normalize_class_name(name)
            normalized_models[normalized_name] = model
            
            # 기존 클래스에서 메서드 추출 시도
            if normalized_name in model_classes:
                methods_by_class[normalized_name] = extract_methods_from_model(model_classes[normalized_name])
    
    # 임베디드 모델 의존성 그래프 생성 (ChangeItem과 같은 특수 케이스 처리)
    dependency_order = ["ChangeItem"]  # 특정 순서가 필요한 클래스
    
    # 나머지 클래스들 추가
    for name in normalized_models.keys():
        if name not in dependency_order:
            dependency_order.append(name)
    
    template = env.get_template("cve_model.py.jinja2")
    
    output = template.render(
        fields=schema.fields,
        embedded_models=schema.embedded_models,
        normalized_models=normalized_models,
        dependency_order=dependency_order,
        methods_by_class=methods_by_class,
        generation_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        serialize_datetime_function=get_serialize_datetime_function(),
        normalize_class_name=normalize_class_name
    )
    
    # 출력 파일 경로
    output_path = Path(__file__).parent.parent / "cve" / "models.py"
    
    # 출력 디렉토리 확인
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 파일 생성
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    
    print(f"Beanie 모델 생성 완료: {output_path}")

if __name__ == "__main__":
    generate_beanie_model()