"""
Comment 모델 및 스키마 생성 유틸리티
"""
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

def generate_comment_model():
    """Comment 모델 생성"""
    try:
        # CommentSchemaDefinition 동적 임포트
        comment_schema_module = importlib.import_module('app.schemas.comment_schema')
        schema = comment_schema_module.CommentSchemaDefinition()
    except (ImportError, AttributeError) as e:
        print(f"CommentSchemaDefinition 임포트 실패: {e}")
        return
    
    template = env.get_template("comment_model.py.jinja2")
    
    output = template.render(
        fields=schema.fields,
        embedded_models=schema.embedded_models,
        generation_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    
    # 출력 파일 경로
    output_path = Path(__file__).parent.parent / "comment" / "models.py"
    
    # 출력 디렉토리 확인
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 파일 생성
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    
    print(f"Comment 모델 생성 완료: {output_path}")

def generate_comment_schemas():
    """Comment API 스키마 생성"""
    try:
        # CommentSchemaDefinition 동적 임포트
        comment_schema_module = importlib.import_module('app.schemas.comment_schema')
        schema = comment_schema_module.CommentSchemaDefinition()
    except (ImportError, AttributeError) as e:
        print(f"CommentSchemaDefinition 임포트 실패: {e}")
        return
    
    template = env.get_template("comment_schemas.py.jinja2")
    
    output = template.render(
        fields=schema.fields,
        embedded_models=schema.embedded_models,
        generation_timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    
    # 출력 파일 경로
    output_path = Path(__file__).parent.parent / "comment" / "schemas.py"
    
    # 출력 디렉토리 확인
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 파일 생성
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)
    
    print(f"Comment API 스키마 생성 완료: {output_path}")

if __name__ == "__main__":
    generate_comment_model()
    generate_comment_schemas()
