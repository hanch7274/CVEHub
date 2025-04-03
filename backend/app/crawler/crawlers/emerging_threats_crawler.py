import os
import re
import aiohttp
import asyncio
from typing import Dict, List, Optional, Any
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from app.cve.models import CVEModel, SnortRule
from app.core.config import get_settings
from ..crawler_base import BaseCrawlerService
from app.common.utils.datetime_utils import get_utc_now

settings = get_settings()

class EmergingThreatsCrawlerService(BaseCrawlerService):
    """EmergingThreats 룰을 크롤링하는 서비스"""
    
    def __init__(self):
        super().__init__("emerging_threats", "EmergingThreats Crawler")
        self.rule_url = settings.EMERGING_THREATS_URL
        self.data_dir = settings.DATA_DIR
        self.rule_file_path = os.path.join(self.data_dir, "emerging-all.rules")
        self.hash_file_path = os.path.join(self.data_dir, "emerging-all.hash")
        self.updated_cves = []  # 업데이트된 CVE 목록
        
        # 임시 디렉토리 생성
        os.makedirs(self.data_dir, exist_ok=True)
    
    async def fetch_data(self) -> bool: 
        """원격 저장소에서 룰 파일 다운로드"""
        try:
            await self.report_progress("preparing", 0, "EmergingThreats 룰 파일 다운로드 준비 중...")
            
            # 최신 파일 해시 확인
            current_hash = await self._get_remote_file_hash()
            if not current_hash:
                self.log_error("원격 파일 해시를 가져올 수 없습니다.")
                await self.report_progress("error", 0, "원격 파일 해시를 가져올 수 없습니다.")
                return False
            
            # 이전 해시와 비교
            previous_hash = await self._get_stored_hash()
            
            if current_hash == previous_hash and os.path.exists(self.rule_file_path):
                self.log_info("EmergingThreats 룰 파일이 최신 상태입니다. 다운로드를 건너뜁니다.")
                await self.report_progress("fetching", 100, "파일이 이미 최신 상태입니다.")
                return True
            
            # 파일 다운로드
            await self.report_progress("fetching", 10, "EmergingThreats 룰 파일 다운로드 중...")
            async with aiohttp.ClientSession() as session:
                async with session.get(self.rule_url) as response:
                    if response.status != 200:
                        self.log_error(f"룰 파일 다운로드 실패: {response.status}")
                        await self.report_progress("error", 0, f"룰 파일 다운로드 실패: HTTP {response.status}")
                        return False
                    
                    content = await response.text()
                    with open(self.rule_file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
            
            # 새 해시 저장
            with open(self.hash_file_path, 'w') as f:
                f.write(current_hash)
            
            self.log_info(f"EmergingThreats 룰 파일 다운로드 완료: {len(content)} 바이트")
            await self.report_progress("fetching", 100, "EmergingThreats 룰 파일 다운로드 완료")
            return True
            
        except Exception as e:
            self.log_error(f"데이터 다운로드 중 오류 발생: {str(e)}")
            await self.report_progress("error", 0, f"데이터 다운로드 중 오류 발생: {str(e)}")
            return False
    
    async def _get_remote_file_hash(self) -> Optional[str]:
        """원격 파일의 해시 값을 가져옵니다."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.rule_url) as response:
                    if response.status != 200:
                        return None
                    content = await response.read()
                    return hashlib.sha256(content).hexdigest()
        except Exception as e:
            self.log_error(f"원격 파일 해시 가져오기 실패: {str(e)}")
            return None
    
    async def _get_stored_hash(self) -> Optional[str]:
        """저장된 이전 해시 값을 가져옵니다."""
        if not os.path.exists(self.hash_file_path):
            return None
        try:
            with open(self.hash_file_path, 'r') as f:
                return f.read().strip()
        except Exception as e:
            self.log_error(f"저장된 해시 가져오기 실패: {str(e)}")
            return None
    
    async def parse_data(self, data_path: str) -> dict:
        """파일에서 CVE 정보가 있는 룰만 파싱"""
        try:
            await self.report_progress("processing", 0, "EmergingThreats 룰 파싱 중...")
            
            rules_with_cve = []
            total_rules = 0
            cve_rules = 0
            
            with open(self.rule_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # 주석 제거
                content = re.sub(r'^\s*#.*$', '', content, flags=re.MULTILINE)
                # 빈 줄 제거
                content = re.sub(r'^\s*$', '', content, flags=re.MULTILINE)
                
                # 각 룰 분리하여 처리
                for i, rule in enumerate(re.finditer(r'alert\s+.*?\)\s*$', content, re.MULTILINE | re.DOTALL)):
                    total_rules += 1
                    
                    # 진행 상황 업데이트 (10%마다)
                    if total_rules % 100 == 0:
                        percent = min(int((i / len(content)) * 100), 99)
                        await self.report_progress("processing", percent, f"룰 파싱 중... ({total_rules}개 처리)")
                    
                    rule_text = rule.group(0)
                    
                    # CVE 참조 확인
                    cve_matches = re.finditer(r'reference:cve,(\d{4}-\d+)', rule_text)
                    cves = [match.group(1) for match in cve_matches]
                    
                    if cves:
                        cve_rules += 1
                        
                        # URL 참조 추출
                        url_refs = []
                        for url_match in re.finditer(r'reference:url,([^;]+)', rule_text):
                            url_refs.append(url_match.group(1).strip())
                        
                        # 룰에서 메시지 추출 (디버깅용, title로는 사용하지 않음)
                        msg_match = re.search(r'msg:"([^"]+)"', rule_text)
                        msg = msg_match.group(1) if msg_match else "No description"
                        
                        # sid 추출
                        sid_match = re.search(r'sid:(\d+)', rule_text)
                        sid = sid_match.group(1) if sid_match else "unknown"
                        
                        # Rule 코드에서 reference와 metadata 부분 제거
                        clean_rule = re.sub(r'reference:[^;]+;', '', rule_text)
                        clean_rule = re.sub(r'metadata:[^;]+;', '', clean_rule)
                        
                        # 각 CVE ID에 대해 정보 저장
                        for cve_id in cves:
                            rules_with_cve.append({
                                "cve_id": f"CVE-{cve_id}",
                                "msg": msg,  # 원본 메시지 (참고용)
                                "rule_sid": sid,
                                "rule_content": clean_rule.strip(),
                                "references": url_refs
                            })
            
            await self.report_progress("processing", 100, 
                                     f"룰 파싱 완료: 총 {total_rules}개 룰 중 {cve_rules}개 CVE 관련 룰 발견")
            
            return {
                "rules": rules_with_cve,
                "total_rules": total_rules,
                "cve_rules": cve_rules
            }
            
        except Exception as e:
            self.log_error(f"룰 파싱 중 오류 발생: {str(e)}")
            await self.report_progress("error", 0, f"룰 파싱 중 오류 발생: {str(e)}")
            return {"rules": [], "total_rules": 0, "cve_rules": 0}
    
    async def process_data(self, cve_data: dict) -> bool:
        """파싱된 데이터를 DB에 저장"""
        try:
            rules = cve_data["rules"]
            total_rules = len(rules)
            
            if total_rules == 0:
                self.log_info("처리할 CVE 룰이 없습니다.")
                await self.report_progress("saving", 100, "처리할 CVE 룰이 없습니다.")
                return True
            
            self.log_info(f"처리 시작: {total_rules}개의 CVE 룰")
            await self.report_progress("saving", 0, f"{total_rules}개의 CVE 룰 처리 시작")
            
            # 중복 처리 방지를 위한 처리 완료된 CVE ID 추적
            processed_cves = set()
            updated_count = 0
            new_count = 0
            
            for i, rule_data in enumerate(rules):
                cve_id = rule_data["cve_id"]
                
                # 진행 상황 업데이트
                if i % 10 == 0 or i == total_rules - 1:
                    percent = int((i / total_rules) * 100)
                    await self.report_progress("saving", percent, 
                                             f"CVE 업데이트 중... ({i}/{total_rules})")
                
                # 이미 처리된 CVE는 건너뛰기
                if cve_id in processed_cves:
                    continue
                
                processed_cves.add(cve_id)
                
                # 기본 CVE 데이터 생성
                cve_data = {
                    "title": cve_id,  # title을 CVE ID로 설정
                    "description": "",  # description은 빈 상태로 설정
                    "severity": "unassigned",  # 기본값
                    "source": "EmergingThreats"
                }
                
                # 룰 객체 생성
                rule_obj = {
                    "type": "Emerging-Threats",  # Emerging-Threats로 설정
                    "rule": rule_data["rule_content"],
                    "sid": rule_data["rule_sid"],
                    "created_by": "emerging_threats_crawler",
                    "created_at": get_utc_now()
                }
                
                # 기존 CVE 가져오기
                cve = await self.cve_service.get_cve_detail(cve_id)
                is_new = cve is None
                
                if cve:
                    # 기존 CVE의 스노트 룰 가져오기
                    if hasattr(cve, "snort_rules") and cve.snort_rules:
                        current_rules = cve.snort_rules
                    else:
                        current_rules = []
                        
                    # SID로 기존 룰 검색
                    rule_exists = False
                    for idx, existing_rule in enumerate(current_rules):
                        if isinstance(existing_rule, dict) and existing_rule.get("sid") == rule_data["rule_sid"]:
                            # 기존 룰 업데이트
                            current_rules[idx] = rule_obj
                            rule_exists = True
                            break
                    
                    if not rule_exists:
                        current_rules.append(rule_obj)
                        
                    # 업데이트할 데이터에 룰 추가
                    cve_data["snort_rules"] = current_rules
                    updated_count += 1
                else:
                    # 새 CVE의 경우
                    cve_data["snort_rules"] = [rule_obj]
                    new_count += 1
                
                # 참조 URL 처리
                if rule_data["references"]:
                    references = []
                    
                    # 기존 참조 URL 가져오기
                    if cve and hasattr(cve, "references") and cve.references:
                        existing_urls = {
                            ref.get("url") if isinstance(ref, dict) else ref
                            for ref in cve.references
                        }
                        references = cve.references
                    else:
                        existing_urls = set()
                        references = []
                    
                    # 새로운 URL 추가
                    for url in rule_data["references"]:
                        if url not in existing_urls:
                            # cve_utils의 create_reference 함수 사용
                            from ..utils.cve_utils import create_reference
                            reference_obj = create_reference(
                                url=url,
                                type="ADVISORY",
                                description="EmergingThreats Rule Reference",
                                creator="emerging_threats_crawler"
                            )
                            references.append(reference_obj)
                            existing_urls.add(url)
                    
                    # 업데이트할 데이터에 참조 URL 추가
                    cve_data["references"] = references
                
                # BaseCrawlerService의 update_cve 메서드 사용
                cve = await self.update_cve(cve_id, cve_data, "EmergingThreats-Crawler")
                
                # 업데이트된 CVE 목록에 추가
                self.updated_cves.append({
                    "cve_id": cve_id,
                    "title": cve.title if hasattr(cve, "title") and cve.title else cve_id,
                    "is_new": is_new
                })
            
            # 완료 메시지
            status_msg = f"업데이트 완료: {new_count}개 신규 CVE, {updated_count}개 기존 CVE 업데이트"
            self.log_info(status_msg)
            await self.report_progress("completed", 100, status_msg, self.updated_cves)
            
            return True
            
        except Exception as e:
            self.log_error(f"데이터 처리 중 오류 발생: {str(e)}")
            await self.report_progress("error", 0, f"데이터 처리 중 오류 발생: {str(e)}")
            return False
    
    async def crawl(self, requester_id: str = None, quiet_mode: bool = False) -> dict:
        """EmergingThreats 규칙을 크롤링하고 데이터베이스에 저장합니다."""
        self.requester_id = requester_id
        self.quiet_mode = quiet_mode
        
        try:
            # 초기화 단계
            await self.report_progress("preparing", 0, "크롤링 초기화 중")
            
            # 데이터 수집 단계
            await self.report_progress("fetching", 10, "EmergingThreats 규칙 다운로드 시작")
            success = await self.fetch_data()
            if not success:
                await self.report_progress("error", 0, "EmergingThreats 규칙 다운로드 실패")
                return {"success": False, "message": "EmergingThreats 규칙 다운로드 실패"}
            
            await self.report_progress("fetching", 50, "EmergingThreats 규칙 다운로드 완료")
            
            # 데이터 처리 단계
            await self.report_progress("processing", 60, "EmergingThreats 규칙 파싱 시작")
            parsed_data = await self.parse_data(self.rule_file_path)
            if not parsed_data:
                await self.report_progress("error", 0, "EmergingThreats 규칙 파싱 실패")
                return {"success": False, "message": "EmergingThreats 규칙 파싱 실패"}
            
            await self.report_progress("processing", 80, f"EmergingThreats 규칙 파싱 완료 ({len(parsed_data.get('rules', []))} 개 규칙)")
            
            # 데이터베이스 업데이트 단계
            await self.report_progress("saving", 85, "데이터베이스 업데이트 시작")
            success = await self.process_data(parsed_data)
            if not success:
                await self.report_progress("error", 0, "데이터베이스 업데이트 실패")
                return {"success": False, "message": "데이터베이스 업데이트 실패"}
            
            # 완료 단계
            await self.report_progress("completed", 100, f"EmergingThreats 크롤링 완료 ({len(self.updated_cves)} 개 CVE 업데이트)", updated_cves=self.updated_cves)
            
            return {
                "success": True,
                "message": f"EmergingThreats 크롤링 완료 ({len(self.updated_cves)} 개 CVE 업데이트)",
                "updated_count": len(self.updated_cves)
            }
            
        except Exception as e:
            error_message = f"EmergingThreats 크롤링 중 오류 발생: {str(e)}"
            self.log_exception(error_message)
            await self.report_progress("error", 0, error_message)
            return {"success": False, "message": error_message}