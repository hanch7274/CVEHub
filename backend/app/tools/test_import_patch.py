# app/tools/test_import_patch.py
"""
마이그레이션 테스트용 임포트 패치 스크립트
"""
import sys
import types
from pathlib import Path

# 가짜 models 모듈 생성
models_module = types.ModuleType('app.cve.models')

# generated_models.py에서 모든 심볼 가져오기
import app.cve.generated_models as generated_models
for name in dir(generated_models):
    if not name.startswith('__'):
        setattr(models_module, name, getattr(generated_models, name))

# 시스템에 모듈 등록
sys.modules['app.cve.models'] = models_module

print("임포트 패치 적용 완료 - app.cve.models는 이제 generated_models.py를 참조합니다.")