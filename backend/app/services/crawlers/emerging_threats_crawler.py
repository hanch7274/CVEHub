import os
import re
import aiohttp
import hashlib
import asyncio
from typing import Dict, List, Set, Tuple, Optional, Any
from datetime import datetime
from zoneinfo import ZoneInfo

from ...core.config import get_settings
from ...models.cve_model import CVEModel, Reference
from ..crawler_base import BaseCrawlerService

settings = get_settings()

class EmergingThreatsCrawlerService(BaseCrawlerService):
    """EmergingThreats 룰을 크롤링하는 서비스"""
    
    def __init__(self):
        """크롤러 초기화"""
        super().__init__(
            crawler_id="emerging_threats",
            display_name="EmergingThreats Rules Crawler"
        )
        self.rule_url = "https://rules.emergingthreats.net/open/snort-2.9.0/emerging-all.rules"
        self.download_path = os.path.join(settings.EMERGING_DIR, "emerging_threats")
        self.rule_file_path = os.path.join(self.download_path, "emerging-all.rules")
        self.hash_file_path = os.path.join(self.download_path, "last_hash.txt")
        self.updated_cves = []  # 업데이트된 CVE 목록 (결과 보고용)
        self.rule_type = "Emerging-Threats"  # SNORT 룰 타입
        
        # 디렉토리 생성
        os.makedirs(self.download_path, exist_ok=True)
    
    async def fetch_data(self) -> bool:
        """원격 저장소에서 룰 파일 다운로드"""
        try:
            await self.report_progress("준비", 0, "EmergingThreats 룰 파일 다운로드 준비 중...")
            
            # 최신 파일 해시 확인
            current_hash = await self._get_remote_file_hash()
            if not current_hash:
                self.log_error("원격 파일 해시를 가져올 수 없습니다.")
                await self.report_progress("오류", 0, "원격 파일 해시를 가져올 수 없습니다.")
                return False
            
            # 이전 해시와 비교
            previous_hash = await self._get_stored_hash()
            
            if current_hash == previous_hash and os.path.exists(self.rule_file_path):
                self.log_info("EmergingThreats 룰 파일이 최신 상태입니다. 다운로드를 건너뜁니다.")
                await self.report_progress("데이터 수집", 100, "파일이 이미 최신 상태입니다.")
                return True
            
            # 파일 다운로드
            await self.report_progress("데이터 수집", 10, "EmergingThreats 룰 파일 다운로드 중...")
            async with aiohttp.ClientSession() as session:
                async with session.get(self.rule_url) as response:
                    if response.status != 200:
                        self.log_error(f"룰 파일 다운로드 실패: {response.status}")
                        await self.report_progress("오류", 0, f"룰 파일 다운로드 실패: HTTP {response.status}")
                        return False
                    
                    content = await response.text()
                    with open(self.rule_file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
            
            # 새 해시 저장
            with open(self.hash_file_path, 'w') as f:
                f.write(current_hash)
            
            self.log_info(f"EmergingThreats 룰 파일 다운로드 완료: {len(content)} 바이트")
            await self.report_progress("데이터 수집", 100, "EmergingThreats 룰 파일 다운로드 완료")
            return True
            
        except Exception as e:
            self.log_error(f"데이터 다운로드 중 오류 발생: {str(e)}")
            await self.report_progress("오류", 0, f"데이터 다운로드 중 오류 발생: {str(e)}")
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
            await self.report_progress("데이터 처리", 0, "EmergingThreats 룰 파싱 중...")
            
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
                        await self.report_progress("데이터 처리", percent, f"룰 파싱 중... ({total_rules}개 처리)")
                    
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
            
            await self.report_progress("데이터 처리", 100, 
                                     f"룰 파싱 완료: 총 {total_rules}개 룰 중 {cve_rules}개 CVE 관련 룰 발견")
            
            return {
                "rules": rules_with_cve,
                "total_rules": total_rules,
                "cve_rules": cve_rules
            }
            
        except Exception as e:
            self.log_error(f"룰 파싱 중 오류 발생: {str(e)}")
            await self.report_progress("오류", 0, f"룰 파싱 중 오류 발생: {str(e)}")
            return {"rules": [], "total_rules": 0, "cve_rules": 0}
    
    async def process_data(self, cve_data: dict) -> bool:
        """파싱된 데이터를 DB에 저장"""
        try:
            rules = cve_data["rules"]
            total_rules = len(rules)
            
            if total_rules == 0:
                self.log_info("처리할 CVE 룰이 없습니다.")
                await self.report_progress("데이터베이스 업데이트", 100, "처리할 CVE 룰이 없습니다.")
                return True
            
            self.log_info(f"처리 시작: {total_rules}개의 CVE 룰")
            await self.report_progress("데이터베이스 업데이트", 0, f"{total_rules}개의 CVE 룰 처리 시작")
            
            # 중복 처리 방지를 위한 처리 완료된 CVE ID 추적
            processed_cves = set()
            updated_count = 0
            new_count = 0
            
            for i, rule_data in enumerate(rules):
                cve_id = rule_data["cve_id"]
                
                # 진행 상황 업데이트
                if i % 10 == 0 or i == total_rules - 1:
                    percent = int((i / total_rules) * 100)
                    await self.report_progress("데이터베이스 업데이트", percent, 
                                             f"CVE 업데이트 중... ({i}/{total_rules})")
                
                # 이미 처리된 CVE는 건너뛰기
                if cve_id in processed_cves:
                    continue
                
                processed_cves.add(cve_id)
                
                # DB에서 CVE 찾기 또는 새로 생성
                cve = await CVEModel.find_one({"cve_id": cve_id})
                is_new = False
                
                if not cve:
                    # 새 CVE 생성
                    cve = CVEModel(
                        cve_id=cve_id,
                        title=cve_id,  # title을 CVE ID로 설정
                        description="",  # description은 빈 상태로 설정
                        status="신규등록",
                        severity="unassigned",  # 기본값
                        created_at=datetime.now(ZoneInfo("Asia/Seoul")),
                        updated_at=datetime.now(ZoneInfo("Asia/Seoul"))
                    )
                    is_new = True
                    new_count += 1
                else:
                    # 기존 CVE 업데이트 - 상태는 변경하지 않음
                    updated_count += 1
                
                # 룰 정보 추가/업데이트
                if not hasattr(cve, "snort_rules") or not cve.snort_rules:
                    cve.snort_rules = []
                
                # 룰 객체 형식으로 저장
                rule_obj = {
                    "type": self.rule_type,  # Emerging-Threats로 설정
                    "rule": rule_data["rule_content"],
                    "sid": rule_data["rule_sid"],
                    "added_by": "emerging_threats_crawler",
                    "date_added": datetime.now(ZoneInfo("Asia/Seoul"))
                }
                
                # SID로 기존 룰 검색
                rule_exists = False
                for idx, existing_rule in enumerate(cve.snort_rules):
                    if isinstance(existing_rule, dict) and existing_rule.get("sid") == rule_data["rule_sid"]:
                        # 기존 룰 업데이트
                        cve.snort_rules[idx] = rule_obj
                        rule_exists = True
                        break
                
                if not rule_exists:
                    cve.snort_rules.append(rule_obj)
                
                # 참조 URL 업데이트
                if rule_data["references"]:
                    if not hasattr(cve, "references") or not cve.references:
                        cve.references = []
                    
                    for url in rule_data["references"]:
                        # URL이 이미 존재하는지 확인
                        url_exists = False
                        for ref in cve.references:
                            if isinstance(ref, dict) and ref.get("url") == url:
                                url_exists = True
                                break
                            elif isinstance(ref, str) and ref == url:
                                url_exists = True
                                break
                        
                        # 새 URL이면 Reference 객체로 추가
                        if not url_exists:
                            reference_obj = Reference(
                                url=url,
                                type="ADVISORY",
                                description="EmergingThreats Rule Reference",
                                added_by="emerging_threats_crawler"
                            )
                            cve.references.append(reference_obj.dict())
                
                # 변경 사항 저장
                cve.updated_at = datetime.now(ZoneInfo("Asia/Seoul"))
                await cve.save()
                
                # 업데이트된 CVE 목록에 추가
                self.updated_cves.append({
                    "cve_id": cve_id,
                    "title": cve_id,  # title은 CVE ID 그대로 사용
                    "is_new": is_new
                })
            
            # 완료 메시지
            status_msg = f"업데이트 완료: {new_count}개 신규 CVE, {updated_count}개 기존 CVE 업데이트"
            self.log_info(status_msg)
            await self.report_progress("완료", 100, status_msg, self.updated_cves)
            
            return True
            
        except Exception as e:
            self.log_error(f"데이터 처리 중 오류 발생: {str(e)}")
            await self.report_progress("오류", 0, f"데이터 처리 중 오류 발생: {str(e)}")
            return False
    
    async def crawl(self) -> bool:
        """전체 크롤링 프로세스 실행"""
        try:
            self.log_info("EmergingThreats 크롤링 시작")
            self.updated_cves = []  # 결과 초기화
            
            # 1. 데이터 다운로드
            fetch_success = await self.fetch_data()
            if not fetch_success:
                return False
            
            # 2. 데이터 파싱
            parsed_data = await self.parse_data(self.rule_file_path)
            if not parsed_data or not parsed_data.get("rules"):
                await self.report_progress("완료", 100, "파싱된 CVE 룰이 없습니다.")
                return True  # 오류는 아니므로 True 반환
            
            # 3. 데이터 처리 및 저장
            process_success = await self.process_data(parsed_data)
            if not process_success:
                return False
            
            self.log_info("EmergingThreats 크롤링 완료")
            return True
            
        except Exception as e:
            self.log_error(f"크롤링 중 오류 발생: {str(e)}")
            await self.report_progress("오류", 0, f"크롤링 중 오류 발생: {str(e)}")
            return False 