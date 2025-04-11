"""
스키마 정의에서 API 스키마(Pydantic 모델)를 자동 생성하는 유틸리티
"""
import sys
import os
from pathlib import Path
import jinja2
from datetime import datetime
import importlib

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
    
    # 매핑 테이블에 없으면 PascalCase로 변환
    return ''.join(word.capitalize() for word in singular_name.split('_'))

def generate_api_schemas():
    """CVESchemaDefinition에서 API 스키마 클래스 생성"""
    # CVESchemaDefinition 동적 임포트
    try:
        cve_schema_module = importlib.import_module('app.schemas.cve_schema')
        cve_schema = cve_schema_module.CVESchemaDefinition()
        
        # 댓글 스키마 동적 임포트
        comment_schema_module = importlib.import_module('app.schemas.comment_schema')
        comment_schema = comment_schema_module.CommentSchemaDefinition()
        
        print("CVE와 댓글 스키마 모듈 임포트 성공")
    except (ImportError, AttributeError) as e:
        print(f"스키마 모듈 임포트 실패: {e}")
        return
    
    # 템플릿에 클래스명 변환 함수 제공
    env.globals['normalize_class_name'] = normalize_class_name
    
    template = env.get_template("cve_schemas.py.jinja2")
    
    # 댓글 스키마 참조 형태로 통합 (embedded_models에 추가)
    combined_embedded_models = cve_schema.embedded_models.copy()
    if 'comment' not in combined_embedded_models:  # comment가 이미 있는지 확인
        combined_embedded_models['comment'] = comment_schema.fields
    
    # 추가 설정 - comments 필드를 별도 참조하도록 설정
    additional_fields = {
        "comments": ("List[CommentResponse]", "댓글 목록", "[]", False, [], "comment")
    }
    
    output = template.render(
        fields=cve_schema.fields,
        embedded_models=combined_embedded_models,
        additional_fields=additional_fields,
        generation_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    
    # 출력 파일 경로
    output_path = Path(__file__).parent.parent / "cve" / "schemas.py"
    
    # 출력 디렉토리 확인
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 파일 생성
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    
    print(f"API 스키마 생성 완료: {output_path}")

if __name__ == "__main__":
    generate_api_schemas()