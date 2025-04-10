"""
스키마 정의에서 TypeScript 인터페이스를 자동 생성하는 유틸리티
"""
import sys
import os
from pathlib import Path
import jinja2
from datetime import datetime
import importlib
import re

# 템플릿 디렉토리 설정
template_dir = Path(__file__).parent / "templates"
env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(template_dir),
    trim_blocks=True,
    lstrip_blocks=True
)

# snake_case를 camelCase로 변환하는 필터 추가
def snake_to_camel(value):
    components = value.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

# Python 타입을 TypeScript 타입으로 변환하는 필터 추가
def python_to_ts(value):
    # 기본 타입 매핑
    type_map = {
        "str": "string",
        "int": "number",
        "float": "number",
        "bool": "boolean",
        "datetime": "string | Date",
        "dict": "Record<string, any>",
        "Dict": "Record<string, any>",
        "List": "Array",
        "Optional": "",
        "Any": "any",
        "Literal": "",
        "PydanticObjectId": "string",
        "ObjectId": "string",
    }
    
    # value에서 타입 문자열 추출
    value = str(value).replace('"', '')
    
    # Optional 처리
    if "Optional[" in value:
        inner_type = value[9:-1]  # "Optional[type]"에서 "type" 추출
        return python_to_ts(inner_type)
    
    # List 처리
    if "List[" in value:
        inner_type = value[5:-1]  # "List[type]"에서 "type" 추출
        return f"Array<{python_to_ts(inner_type)}>"
    
    # Literal 처리
    if "Literal[" in value:
        # "Literal["add", "edit", "delete"]" 형태 처리
        inner_values = value[8:-1].split(", ")
        inner_values = [v.strip('"\'') for v in inner_values]
        return " | ".join([f'"{v}"' for v in inner_values])
    
    # 기본 타입 변환
    for py, ts in type_map.items():
        if py in value:
            return value.replace(py, ts)
    
    # 기타 처리되지 않은 타입
    return "any"

# Jinja2 환경에 필터 등록
env.filters['camelcase'] = snake_to_camel
env.filters['python_to_ts'] = python_to_ts

def generate_typescript_interfaces():
    """CVESchemaDefinition에서 TypeScript 인터페이스 생성"""
    # CVESchemaDefinition 동적 임포트
    try:
        cve_schema_module = importlib.import_module('app.schemas.cve_schema')
        schema = cve_schema_module.CVESchemaDefinition()
    except (ImportError, AttributeError) as e:
        print(f"CVESchemaDefinition 임포트 실패: {e}")
        return
    
    template = env.get_template("ts_interfaces.ts.jinja2")
    
    # 모델 설명 사전 준비
    descriptions = {
        "reference": "참조 정보",
        "poc": "Proof of Concept 코드",
        "snort_rule": "Snort 침입 탐지 규칙",
        "comment": "CVE 관련 댓글",
        "modification_history": "변경 이력",
        "change_item": "변경 항목"
    }
    
    output = template.render(
        fields=schema.fields,
        embedded_models=schema.embedded_models,
        descriptions=descriptions,
        generation_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    
    # 출력 파일 경로 (프론트엔드 디렉토리로 설정)
    frontend_dir = Path("/home/CVEHub/frontend")  # 실제 프론트엔드 디렉토리 경로로 수정
    output_path = frontend_dir / "src" / "features" / "cve" / "types" / "generated" / "cve.ts"
    
    # 출력 디렉토리 확인 및 생성
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 파일 생성
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    
    print(f"TypeScript 인터페이스 생성 완료: {output_path}")

def format_type_name(name):
    """타입 이름 포맷팅 - snake_case를 PascalCase로 변환, 대소문자 조정"""
    # snort_rule -> SnortRule, poc -> PoC 등의 변환
    special_cases = {
        'poc': 'PoC',
        'poc': 'PoC',
        'snort_rule': 'SnortRule',
        'snort_rule': 'SnortRule', # 오타 수정
        'reference': 'Reference',
        'comments': 'Comment',
        'comment': 'Comment',
        'modification_history': 'ModificationHistory',
        'change_item': 'ChangeItem'
    }
    
    if name.lower() in special_cases:
        return special_cases[name.lower()]
        
    # 일반적인 snake_case -> PascalCase 변환
    words = name.split('_')
    return ''.join(word.capitalize() for word in words)

# Jinja2 환경에 필터 등록
env.filters['format_type_name'] = format_type_name

if __name__ == "__main__":
    generate_typescript_interfaces()