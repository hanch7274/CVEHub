#!/bin/bash
# collect_source.sh
# Usage: ./collect_source.sh [root_directory]
# 기본적으로 현재 디렉토리(.)를 시작점으로 하며,
# 프론트엔드 소스파일(jsx, js, ts, tsx)와 백엔드 소스파일(py)을 각각
# frontend_sources.txt와 backend_sources.txt 파일로 생성합니다.

# 시작 디렉토리 (인자가 없으면 현재 디렉토리)
ROOT_DIR="${1:-.}"

# 출력 파일명
FRONT_OUTPUT="frontend_sources.txt"
BACK_OUTPUT="backend_sources.txt"

# 기존 출력 파일 초기화
> "$FRONT_OUTPUT"
> "$BACK_OUTPUT"

echo "프론트엔드 소스코드를 수집합니다..."

# node_modules, venv, data, __pycache__ 폴더 제외
find "$ROOT_DIR" \( -path "*/node_modules/*" -o -path "*/venv/*" -o -path "*/data/*" -o -path "*/__pycache__/*" \) -prune -o \
  \( -iname "*.js" -o -iname "*.jsx" -o -iname "*.ts" -o -iname "*.tsx" \) -type f -print0 | \
while IFS= read -r -d '' file; do
  abs_path=$(readlink -f "$file")
  {
    echo "============================================================"
    echo "File: $abs_path"
    echo "------------------------------------------------------------"
    cat "$file"
    echo -e "\n\n"
  } >> "$FRONT_OUTPUT"
done

echo "백엔드 소스코드를 수집합니다..."

find "$ROOT_DIR" \( -path "*/node_modules/*" -o -path "*/venv/*" -o -path "*/data/*" -o -path "*/__pycache__/*" \) -prune -o \
  -iname "*.py" -type f -print0 | \
while IFS= read -r -d '' file; do
  abs_path=$(readlink -f "$file")
  {
    echo "============================================================"
    echo "File: $abs_path"
    echo "------------------------------------------------------------"
    cat "$file"
    echo -e "\n\n"
  } >> "$BACK_OUTPUT"
done

echo "수집 완료:"
echo " - 프론트엔드 소스코드: $FRONT_OUTPUT"
echo " - 백엔드 소스코드: $BACK_OUTPUT"
