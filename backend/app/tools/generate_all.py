"""
모든 코드 생성 도구를 실행하는 통합 스크립트
"""
import subprocess
import sys
import os
from pathlib import Path

def create_directories():
    """필요한 디렉토리 생성"""
    directories = [
        Path(__file__).parent.parent / "schemas",
        Path(__file__).parent / "templates",
        Path(__file__).parent.parent.parent / "src" / "shared" / "types" / "generated",
        Path(__file__).parent.parent / "comment"  # 댓글 디렉토리 추가
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"디렉토리 생성/확인: {directory}")

def main():
    """모든 생성 스크립트 실행"""
    # 작업 경로 출력
    print(f"현재 작업 디렉토리: {os.getcwd()}")
    
    # 필요한 디렉토리 생성
    create_directories()
    
    print("스키마 기반 코드 생성을 시작합니다...")
    
    # Beanie 모델 생성
    print("\n1. 백엔드 모델 생성 중...")
    try:
        subprocess.run([sys.executable, "-m", "app.tools.cve_model_generator"], check=True)
        print("✅ 백엔드 모델 생성 완료")
    except subprocess.CalledProcessError as e:
        print(f"❌ 백엔드 모델 생성 실패: {e}")
    
    # Pydantic 스키마 생성
    print("\n2. API 스키마 생성 중...")
    try:
        subprocess.run([sys.executable, "-m", "app.tools.cve_schema_generator"], check=True)
        print("✅ API 스키마 생성 완료")
    except subprocess.CalledProcessError as e:
        print(f"❌ API 스키마 생성 실패: {e}")
    
    # TypeScript 인터페이스 생성
    print("\n3. TypeScript 타입 생성 중...")
    try:
        subprocess.run([sys.executable, "-m", "app.tools.typescript_generator"], check=True)
        print("✅ TypeScript 타입 생성 완료")
    except subprocess.CalledProcessError as e:
        print(f"❌ TypeScript 타입 생성 실패: {e}")
    
    # Comment 모델 및 스키마 생성
    print("\n4. Comment 모델 및 스키마 생성 중...")
    try:
        subprocess.run([sys.executable, "-m", "app.tools.comment_generator"], check=True)
        print("✅ Comment 모델 및 스키마 생성 완료")
    except subprocess.CalledProcessError as e:
        print(f"❌ Comment 모델 및 스키마 생성 실패: {e}")
    
    print("\n모든 코드 생성이 완료되었습니다!")

if __name__ == "__main__":
    main()