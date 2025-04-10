# app/tools/bridge_generator.py
import sys
import os
from pathlib import Path
import re

def generate_bridge_file():
    """
    generated/cve.ts 파일을 분석하여 bridge.ts 파일 생성
    """
    frontend_dir = Path("../frontend")
    generated_path = frontend_dir / "src" / "features" / "cve" / "types" / "generated" / "cve.ts"
    
    if not generated_path.exists():
        print(f"생성된 파일이 존재하지 않습니다: {generated_path}")
        return False
    
    # 생성된 파일에서 인터페이스 추출
    with open(generated_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 인터페이스 이름 추출
    interface_pattern = r'export\s+interface\s+Generated(\w+)'
    interfaces = re.findall(interface_pattern, content)
    
    # bridge.ts 파일 생성
    bridge_content = """/**
 * 스키마 중앙화 시스템의 브릿지 파일
 * 자동 생성된 인터페이스와 기존 코드 연결
 */

import {
"""
    
    # 임포트 구문 생성
    for interface in interfaces:
        bridge_content += f"  Generated{interface},\n"
    
    bridge_content += """} from './generated/cve';

// 기본 확장 인터페이스 정의
"""
    
    # 확장 인터페이스 생성
    special_cases = {
        "CVEDetail": """export interface CVEDetail extends Omit<GeneratedCVEDetail, 'reference' | 'poc' | 'snortRule' | 'modificationHistory' | 'comments'> {
  id?: string;
  reference: Reference[];
  poc: PoC[];
  snortRule: SnortRule[];
  modificationHistory: ModificationHistory[];
  comments?: Comment[];
  createdAt?: string | Date;
  lastModifiedAt?: string | Date;
  [key: string]: unknown;
}""",
        "PoC": """export interface PoC extends Omit<GeneratedPoC, 'source'> {
  id?: string;
  code: string; // 'source' 대신 'code' 필드 사용
  language?: string;
  [key: string]: unknown;
}""",
        "Comment": """export interface Comment extends Omit<GeneratedComment, 'id'> {
  id?: string;
  children?: Comment[];
  [key: string]: unknown;
}"""
    }
    
    for interface in interfaces:
        if interface in special_cases:
            bridge_content += f"\n{special_cases[interface]}\n"
        else:
            bridge_content += f"""
export interface {interface} extends Generated{interface} {{
  id?: string;
  [key: string]: unknown;
}}
"""
    
    # 파일 저장
    bridge_path = frontend_dir / "src" / "features" / "cve" / "types" / "bridge.ts"
    with open(bridge_path, 'w', encoding='utf-8') as f:
        f.write(bridge_content)
    
    print(f"브릿지 파일 생성 완료: {bridge_path}")
    return True

if __name__ == "__main__":
    generate_bridge_file()