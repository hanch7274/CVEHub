import logging
import os
import aiohttp
import asyncio
import json
import hashlib
import yaml
import git
import glob
from typing import Dict, List, Any, Optional, Union
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from app.models.cve_model import CVEModel
from app.services.crawler_base import BaseCrawlerService
from app.core.config import get_settings
import re
from ...utils.datetime_utils import get_utc_now
from ...utils.cve_utils import create_reference

logger = logging.getLogger(__name__)
settings = get_settings()

class NucleiCrawlerService(BaseCrawlerService):
    """Nuclei-Templates 데이터 수집/처리를 위한 크롤러 서비스"""
    
    def __init__(self):
        # 부모 클래스 초기화
        super().__init__(
            crawler_id="nuclei",  
            display_name="Nuclei Templates Crawler"
        )
        
        # 저장소 정보
        self.repo_url = "https://github.com/projectdiscovery/nuclei-templates.git"
        self.repo_path = os.path.join(settings.DATA_DIR, "nuclei-templates")
        self.cves_path = os.path.join(self.repo_path, "http", "cves")
        
        # 디렉토리 생성
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        
        # 웹소켓 메시지 최적화를 위한 플래그
        self.websocket_enabled = False
        
        self.log_info(f"NucleiCrawlerService 초기화됨, 저장소 경로: {self.repo_path}")
    
    async def crawl(self) -> Dict[str, Any]:
        """전체 크롤링 프로세스"""
        # 웹소켓 메시지 활성화 (crawl 함수에서만 웹소켓 메시지 전송 활성화)
        self.websocket_enabled = True
        
        try:
            # 초기 상태 메시지 (웹소켓 연결 필수)
            await self.report_progress("준비", 0, f"{self.crawler_id} 업데이트를 시작합니다.", require_websocket=True)
            
            # 1. 준비 단계 (0-20%)
            await self.report_progress("준비", 0, "Nuclei 템플릿 저장소 준비 중...")
            
            # 2. 저장소 클론 또는 풀
            if not await self._clone_or_pull_repo():
                error_msg = "저장소 클론/풀 작업 실패"
                self.log_error(error_msg)
                await self.report_progress("오류", 0, error_msg, require_websocket=True)
                return {
                    "stage": "error",
                    "message": error_msg
                }
            
            # 준비 단계 완료 메시지
            await self.report_progress("준비", 20, "저장소 준비 완료")
            
            # 3. 데이터 수집 단계 (20-40%)
            await self.report_progress("데이터 수집", 20, "템플릿 파일 수집 시작...")
            templates = await self.fetch_data()
            if not templates or len(templates) == 0:
                error_msg = "템플릿 파일을 찾지 못했습니다."
                self.log_error(error_msg)
                await self.report_progress("오류", 0, error_msg, require_websocket=True)
                return {
                    "stage": "error",
                    "message": error_msg
                }
            self.log_info(f"총 {len(templates)}개의 템플릿 파일 발견")
            await self.report_progress("데이터 수집", 40, f"템플릿 파일 {len(templates)}개 수집 완료")
            
            # 4. 데이터 처리 단계 (40-60%)
            await self.report_progress("데이터 처리", 40, f"{len(templates)}개 템플릿 파일 처리 시작...")
            processed_data = await self.parse_data(templates)
            if not processed_data or len(processed_data.get('items', [])) == 0:
                error_msg = "템플릿 파일 처리 중 오류가 발생했습니다."
                self.log_error(error_msg)
                await self.report_progress("오류", 0, error_msg, require_websocket=True)
                return {
                    "stage": "error",
                    "message": error_msg
                }
            self.log_info(f"템플릿 처리 완료: {len(processed_data['items'])}개 처리됨")
            await self.report_progress("데이터 처리", 60, f"템플릿 파일 {len(processed_data['items'])}개 처리 완료")
            
            # 5. 데이터베이스 업데이트 단계 (60-95%)
            await self.report_progress("데이터베이스 업데이트", 60, f"{len(processed_data['items'])}개 항목 데이터베이스 업데이트 시작...")
            
            # _update_database 대신 process_data 호출
            process_result = await self.process_data(processed_data)
            if not process_result:
                error_msg = "데이터베이스 업데이트 중 오류가 발생했습니다."
                self.log_error(error_msg)
                await self.report_progress("오류", 0, error_msg, require_websocket=True)
                return {
                    "stage": "error",
                    "message": error_msg
                }
            
            # 업데이트된 항목 수 가져오기
            updated_count = len(self.updated_cves) if hasattr(self, 'updated_cves') else 0
            
            # 6. 완료 보고 (95-100%)
            await self.report_progress("완료", 95, f"완료: {updated_count}개의 CVE가 업데이트되었습니다.")
            
            # 최종 상태 확실히 전송 (100ms 후)
            await asyncio.sleep(0.1)
            await self.report_progress("완료", 100, "업데이트가 완료되었습니다.")
            
            return {
                "stage": "success",
                "message": f"업데이트 완료: {updated_count}개의 CVE가 업데이트되었습니다.",
                "updated": updated_count
            }
        except Exception as e:
            # 오류 메시지를 웹소켓 필수로 전송 시도
            error_msg = f"오류 발생: {str(e)}"
            self.log_error(f"크롤러 오류: {str(e)}", e)
            try:
                await self.report_progress("오류", 0, error_msg, require_websocket=True)
            except Exception as ws_error:
                # 웹소켓 메시지 전송 실패 시, 로그만 남김
                self.log_error(f"크롤러 오류 및 웹소켓 메시지 전송 실패: {str(e)} (웹소켓 오류: {str(ws_error)})")
            
            return {
                "stage": "error",
                "message": error_msg,
                "error": str(e)
            }
        finally:
            # 웹소켓 메시지 비활성화
            self.websocket_enabled = False
    
    async def fetch_data(self) -> Any:
        """데이터 가져오기 (BaseCrawlerService 추상 메소드 구현)"""
        # 진행 상황 25% 단위로 보고 - 상위 함수에서 웹소켓 상태 관리
        await self.report_progress("데이터 수집", 40, "Git 저장소 준비 중...")
        
        # 템플릿 파일 검색 실행
        files = await self._find_template_files()
        
        # 완료 메시지
        await self.report_progress("데이터 수집", 40, f"데이터 수집 완료: {len(files)}개 파일")
        
        # files가 비어있으면 빈 리스트 반환
        if not files:
            self.log_warning("템플릿 파일을 찾지 못했습니다.")
            return []
            
        # files가 문자열인 경우 리스트로 변환
        if isinstance(files, str):
            self.log_warning(f"템플릿 파일 목록이 문자열로 반환되었습니다: {files}")
            return [files]
        
        return files
    
    async def parse_data(self, raw_data: Any) -> Dict[str, Any]:
        """데이터 파싱 (BaseCrawlerService 추상 메소드 구현)"""
        # raw_data가 문자열인 경우 리스트로 변환
        if isinstance(raw_data, str):
            self.log_warning(f"파싱할 데이터가 문자열로 전달되었습니다: {raw_data}")
            template_files = [raw_data]
        elif not isinstance(raw_data, list):
            self.log_error(f"파싱할 데이터가 잘못된 형식입니다: {type(raw_data)}")
            template_files = []
        else:
            template_files = raw_data
        
        # 기존 _process_templates 메소드 재사용
        processed_data = await self._process_templates(template_files)
        
        return {
            "items": processed_data,
            "count": len(processed_data)
        }

    async def process_data(self, cve_data: dict) -> bool:
        """파싱된 CVE 데이터를 처리하고 데이터베이스에 저장"""
        try:
            from ..cve_service import CVEService
            cve_service = CVEService()
            
            # 업데이트 결과 추적용
            self.updated_cves = []
            total_count = len(cve_data.get('items', []))
            
            # 처리 결과 통계 초기화
            result = {
                "added": 0,
                "updated": 0,
                "unchanged": 0,
                "failed": 0
            }
            
            for idx, item in enumerate(cve_data.get('items', [])):
                try:
                    # 진행률 계산 및 보고 (75% ~ 95%)
                    progress = 75 + int((idx / total_count) * 20) if total_count > 0 else 75
                    # 25% 단위로만 진행 상황 보고
                    if idx == 0 or idx == total_count // 4 or idx == total_count // 2 or idx == (total_count * 3) // 4 or idx == total_count - 1:
                        await self.report_progress("데이터베이스 업데이트", progress, 
                                               f"{idx+1}/{total_count} 항목 처리 중 ({(idx+1)/total_count*100:.1f}%)")
                    
                    cve_id = item.get('cve_id')
                    if not cve_id:
                        self.log_warning(f"CVE ID가 없는 항목 건너뜀: {item}")
                        continue
                    
                    # 원본 파일의 digest 해시 사용
                    content = item.get('content', '')
                    content_hash = self._extract_digest_hash(content)
                    
                    # 해시가 없는 경우 기본값 설정
                    if not content_hash:
                        self.log_warning(f"Digest 해시를 찾을 수 없음: {cve_id}. 이 파일은 표준 Nuclei 템플릿이 아닐 수 있습니다.")
                        # 빈 해시 대신 고유한 해시 생성
                        import hashlib
                        content_hash = hashlib.md5(f"{cve_id}_{datetime.now().isoformat()}".encode('utf-8')).hexdigest()
                    
                    # 기존 CVE 조회
                    existing_cve = await cve_service.get_cve_detail(cve_id)
                    
                    if existing_cve:
                        # 기존 CVE의 해시 확인
                        existing_hash = existing_cve.get('nuclei_hash', '')
                        
                        if not existing_hash:
                            self.log_info(f"CVE 변경 감지: {cve_id} (해시 없음, 해시 추가 업데이트)")
                            # 해시만 추가하는 업데이트
                            item['nuclei_hash'] = content_hash
                            try:
                                await cve_service.update_cve(cve_id, {'nuclei_hash': content_hash})
                            except Exception as e:
                                self.log_error(f"해시 업데이트 실패 ({cve_id}): {str(e)}", e)
                                # 전체 문서 덮어쓰기 시도
                                item['nuclei_hash'] = content_hash
                                await cve_service.replace_cve(cve_id, item)
                        
                        elif existing_hash != content_hash:
                            self.log_info(f"CVE 변경 감지: {cve_id} (해시 변경됨)")
                            # 전체 정보 업데이트
                            item['nuclei_hash'] = content_hash
                            try:
                                await cve_service.update_cve(cve_id, item)
                            except Exception as e:
                                # 더 자세한 오류 정보 로깅
                                self.log_error(f"CVE 업데이트 실패 ({cve_id}), 오류 유형: {e.__class__.__name__}, 오류 메시지: {str(e)}", e)
                                self.log_info(f"문서 교체 시도 중: {cve_id}")
                                try:
                                    # update_cve 실패 시 replace_cve 시도 (문서 전체 교체)
                                    await cve_service.replace_cve(cve_id, item)
                                    self.log_info(f"문서 교체 성공: {cve_id}")
                                    self.updated_cves.append(item)
                                except Exception as replace_err:
                                    self.log_error(f"문서 교체도 실패 ({cve_id}): {replace_err.__class__.__name__} - {str(replace_err)}", replace_err)
                                    # 오류 발생한 항목 기록
                                    if not hasattr(self, 'failed_updates'):
                                        self.failed_updates = []
                                    self.failed_updates.append({"cve_id": cve_id, "error": str(replace_err)})
                            else:
                                self.log_info(f"CVE 업데이트 성공: {cve_id}")
                                self.updated_cves.append(item)
                        else:
                            # 해시가 동일하면 변경 없음
                            # self.log_debug(f"CVE 변경 없음: {cve_id}")
                            result["unchanged"] += 1
                            continue
                    else:
                        # 새 CVE 추가 (해시 포함)
                        self.log_info(f"새 CVE 추가: {cve_id}")
                        item['nuclei_hash'] = content_hash
                        item['created_by'] = 'Nuclei-Crawler'  # 생성자 표시
                        
                        # 히스토리 정보 추가
                        current_time = get_utc_now()
                        changes = [
                            {
                                "field": "cve",
                                "field_name": "CVE ID",
                                "action": "add",
                                "summary": f"{cve_id} 등록됨",
                                "old_value": None,
                                "new_value": cve_id
                            },
                            {
                                "field": "status",
                                "field_name": "상태",
                                "action": "add",
                                "summary": "신규 상태로 등록됨",
                                "old_value": None,
                                "new_value": "신규등록"
                            }
                        ]
                        
                        # 제목 정보 기록
                        if item.get('title'):
                            changes.append({
                                "field": "title",
                                "field_name": "제목",
                                "action": "add",
                                "summary": "제목 추가됨",
                                "old_value": None,
                                "new_value": item.get('title')
                            })
                            
                        # 설명 정보 기록
                        if item.get('description'):
                            changes.append({
                                "field": "description",
                                "field_name": "설명",
                                "action": "add",
                                "summary": "설명 추가됨",
                                "old_value": None,
                                "new_value": item.get('description')
                            })
                            
                        # 상태 정보 기록
                        changes.append({
                            "field": "status",
                            "field_name": "상태",
                            "action": "add",
                            "summary": "신규 상태로 등록됨",
                            "old_value": None,
                            "new_value": item.get('status', '신규등록')
                        })
                        
                        # 참조 정보 기록
                        if item.get('references') and len(item.get('references')) > 0:
                            changes.append({
                                "field": "references",
                                "field_name": "References",
                                "action": "add",
                                "summary": f"Reference {len(item.get('references'))}개 추가됨",
                                "old_value": None,
                                "new_value": item.get('references')
                            })
                            
                        # PoC 정보 기록
                        if item.get('pocs') and len(item.get('pocs')) > 0:
                            changes.append({
                                "field": "pocs",
                                "field_name": "PoC",
                                "action": "add",
                                "summary": f"PoC {len(item.get('pocs'))}개 추가됨",
                                "old_value": None,
                                "new_value": item.get('pocs')
                            })
                        
                        item['modification_history'] = [{
                            "username": "Nuclei-Crawler",
                            "modified_at": current_time,
                            "changes": changes
                        }]
                        
                        try:
                            await cve_service.create_cve(item, username="Nuclei-Crawler")
                            self.log_info(f"새 CVE 추가 성공: {cve_id}")
                            self.updated_cves.append(item)
                        except Exception as e:
                            self.log_error(f"새 CVE 추가 실패 ({cve_id}): {e.__class__.__name__} - {str(e)}", e)
                            # 오류 발생한 항목 기록
                            if not hasattr(self, 'failed_updates'):
                                self.failed_updates = []
                            self.failed_updates.append({"cve_id": cve_id, "error": str(e)})
                        
                except Exception as e:
                    self.log_error(f"항목 처리 중 오류: {e.__class__.__name__} - {str(e)}", e)
                    # 오류 발생한 항목 기록
                    if not hasattr(self, 'failed_updates'):
                        self.failed_updates = []
                    self.failed_updates.append({"cve_id": cve_id if 'cve_id' in locals() else 'unknown', "error": str(e)})
                    # 개별 항목 오류는 전체 프로세스를 중단하지 않음
                    continue
            
            # 완료 또는 오류 상태 결정
            if hasattr(self, 'failed_updates') and self.failed_updates:
                failure_count = len(self.failed_updates)
                self.log_warning(f"데이터 처리 중 {failure_count}개 항목에서 오류 발생")
                
                # 처리 결과를 포함한 상태 보고
                return {
                    "stage": "partial_success" if self.updated_cves else "error",
                    "updated_count": len(self.updated_cves),
                    "failed_count": failure_count,
                    "message": f"{len(self.updated_cves)}개 항목 업데이트 성공, {failure_count}개 항목 처리 실패"
                }
            
            return {
                "stage": "success",
                "updated_count": len(self.updated_cves),
                "message": f"{len(self.updated_cves)}개 항목이 성공적으로 업데이트됨"
            }
        except Exception as e:
            self.log_error(f"데이터 처리 중 오류: {str(e)}", e)
            return False

    async def _find_template_files(self) -> List[str]:
        """CVE 템플릿 파일 목록 찾기"""
        self.log_info(f"템플릿 파일 검색 시작: {self.cves_path}")
        
        # CVE 디렉토리 내의 모든 연도 하위 디렉토리 검색
        year_dirs = glob.glob(os.path.join(self.cves_path, "*"))
        template_files = []
        
        for year_dir in year_dirs:
            if os.path.isdir(year_dir):
                # 각 연도 디렉토리 내의 YAML 파일 검색
                yaml_files = glob.glob(os.path.join(year_dir, "*.yaml"))
                template_files.extend(yaml_files)
        
        self.log_info(f"템플릿 파일 검색 완료: {len(template_files)}개 파일 발견")
        return template_files
    
    async def _process_templates(self, template_files: List[str]) -> List[Dict[str, Any]]:
        """
        템플릿 파일들을 처리하여 필요한 정보 추출
        
        Args:
            template_files: 처리할 템플릿 파일 경로 리스트
            
        Returns:
            추출된 정보가 담긴 항목 리스트
        """
        self.log_info(f"템플릿 처리 시작: {len(template_files)}개 파일")
        results = []
        
        # 타입 검사 추가
        if not isinstance(template_files, list):
            self.log_error(f"template_files가 리스트가 아닙니다: {type(template_files)}")
            if isinstance(template_files, str):
                # 문자열을 리스트로 변환
                self.log_warning(f"문자열을 리스트로 변환합니다: {template_files}")
                template_files = [template_files]
            else:
                # 처리할 수 없는 타입이면 빈 결과 반환
                return []
        
        total = len(template_files)
        # 진행 상황 보고 포인트 정의 (25% 간격으로 보고)
        progress_points = [
            0,  # 시작
            total // 4,  # 25%
            total // 2,  # 50%
            (total * 3) // 4,  # 75%
            total - 1  # 마지막
        ]
        
        for idx, file_path in enumerate(template_files):
            try:
                # 진행률 계산 (40% ~ 60% 사이에서 변화)
                progress = 40 + int((idx / total) * 20) if total > 0 else 40
                
                # 진행 상황 보고 (25% 간격 또는 처음/마지막)
                if idx in progress_points or idx == 0 or idx == total - 1:
                    await self.report_progress(
                        "데이터 처리", 
                        progress,  # 동적 진행률 적용
                        f"데이터 처리 중 ({idx+1}/{total} 항목, {(idx+1)/total*100:.1f}%)"  # 현재/전체 형식으로 메시지 표시
                    )
                    
                # 파일 경로 유효성 검사
                if not isinstance(file_path, str):
                    self.log_warning(f"잘못된 파일 경로 형식: {file_path}, 타입: {type(file_path)}")
                    continue
                    
                if not os.path.exists(file_path):
                    self.log_warning(f"파일이 존재하지 않습니다: {file_path}")
                    continue
                
                # 파일명에서 CVE ID 추출 시도
                file_name = os.path.basename(file_path)
                cve_id_from_file = file_name.split(".")[0].upper()
                if cve_id_from_file.startswith("CVE-"):
                    cve_id = cve_id_from_file
                else:
                    # 파일명에 CVE ID가 포함되어 있는지 확인
                    cve_pattern = r'(CVE-\d{4}-\d{4,})'
                    match = re.search(cve_pattern, file_name, re.IGNORECASE)
                    if match:
                        cve_id = match.group(1).upper()
                    else:
                        cve_id = f"NUCLEI-{file_name.split('.')[0]}"
                
                # 파일 읽기
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # 콘텐츠 해시 계산
                content_hash = self._extract_digest_hash(content)
                
                # YAML 파싱
                data = yaml.safe_load(content)
                if not data:
                    self.log_warning(f"YAML 파싱 실패: {file_path}")
                    continue
                
                # 필요한 정보 추출
                info = data.get('info', {})
                name = info.get('name', '')
                
                # YAML 데이터에서 CVE ID 추출 시도
                if 'CVE-' in name:
                    cve_pattern = r'(CVE-\d{4}-\d{4,})'
                    match = re.search(cve_pattern, name)
                    if match:
                        cve_id = match.group(1).upper()
                        
                description = info.get('description', '')
                severity = info.get('severity', 'unknown')
                
                # 표준화된 심각도로 변환
                if severity in ['critical', 'high', 'medium', 'low', 'info', 'unknown']:
                    standardized_severity = severity
                else:
                    # 매핑 로직
                    severity_lower = severity.lower()
                    if any(term in severity_lower for term in ['critical', 'crit']):
                        standardized_severity = 'critical'
                    elif any(term in severity_lower for term in ['high', 'severe']):
                        standardized_severity = 'high'
                    elif any(term in severity_lower for term in ['medium', 'moderate', 'med']):
                        standardized_severity = 'medium'
                    elif any(term in severity_lower for term in ['low', 'minor']):
                        standardized_severity = 'low'
                    elif any(term in severity_lower for term in ['info', 'information']):
                        standardized_severity = 'info'
                    else:
                        standardized_severity = 'unknown'
                
                # 참조 URL 추출
                references = info.get('reference', [])
                if isinstance(references, str):
                    references = [references]
                
                # Reference 객체 리스트로 변환
                reference_objects = []
                for ref_url in references:
                    if ref_url:
                        # 현재 시간을 ISO 형식으로 설정
                        current_time = datetime.now(ZoneInfo("UTC")).isoformat()
                        reference_objects.append({
                            "url": ref_url,
                            "type": "OTHER",
                            "description": f"Nuclei Template Reference",
                            "created_at": current_time,
                            "created_by": "Nuclei-Crawler",
                            "last_modified_at": current_time,
                            "last_modified_by": "Nuclei-Crawler"
                        })
                
                # PoC 정보 생성 (Nuclei 템플릿 자체를 PoC로 간주)
                pocs = []
                if content:  # 템플릿 내용이 있는 경우
                    # CVE ID에서 연도 추출 (예: CVE-2024-1114 -> 2024)
                    cve_year_match = re.match(r'CVE-(\d{4})-\d+', cve_id)
                    cve_year = cve_year_match.group(1) if cve_year_match else "unknown"
                    
                    # 연도를 포함한 올바른 GitHub URL 생성
                    github_url = f"https://github.com/projectdiscovery/nuclei-templates/blob/main/http/cves/{cve_year}/{cve_id}.yaml"
                    
                    # 현재 시간을 ISO 형식으로 설정
                    current_time = datetime.now(ZoneInfo("UTC")).isoformat()
                    pocs.append({
                        "source": "Nuclei-Templates",
                        "url": github_url,
                        "description": f"Nuclei Template for {cve_id}",
                        "created_at": current_time,
                        "created_by": "Nuclei-Crawler",
                        "last_modified_at": current_time,
                        "last_modified_by": "Nuclei-Crawler"
                    })
                
                # Snort Rules 정보 (Nuclei 템플릿에는 없으므로 빈 리스트)
                snort_rules = []
                
                # 처리된 데이터 생성
                processed_template = {
                    "cve_id": cve_id,
                    "title": name or cve_id,
                    "description": description,
                    "severity": standardized_severity,
                    "content": content,
                    "nuclei_hash": content_hash or "",
                    "source": "nuclei-templates",
                    "references": reference_objects,
                    "pocs": pocs,
                    "snort_rules": snort_rules,
                    "file_path": file_path
                }
                
                results.append(processed_template)
                
            except Exception as e:
                self.log_error(f"템플릿 파일 처리 중 오류: {file_path}, {str(e)}")
                continue
        
        self.log_info(f"템플릿 처리 완료: {len(results)}/{len(template_files)} 성공")
        return results
    
    async def _clone_or_pull_repo(self) -> bool:
        """저장소 클론 또는 풀"""
        try:
            if not os.path.exists(self.repo_path):
                # 클론 작업 시작
                self.log_info(f"저장소 클론 시작: {self.repo_url} -> {self.repo_path}")
                
                # 클론 작업 시작
                git.Repo.clone_from(self.repo_url, self.repo_path)
                
                self.log_info("저장소 클론 완료")
            else:
                # 풀 작업 시작
                self.log_info(f"저장소 풀 시작: {self.repo_path}")
                
                # 풀 작업 실행
                repo = git.Repo(self.repo_path)
                origin = repo.remotes.origin
                
                # 풀 실행
                origin.pull()
                
                self.log_info("저장소 풀 완료")
            return True
        except Exception as e:
            self.log_error(f"저장소 클론/풀 중 오류: {str(e)}", e)
            return False
    
    def _extract_digest_hash(self, content: Union[str, Dict]) -> str:
        """템플릿 파일에서 digest 해시 값 추출"""
        # 텍스트 콘텐츠로 변환
        if isinstance(content, dict):
            try:
                # 딕셔너리를 YAML 텍스트로 변환
                import yaml
                content = yaml.dump(content)
                # self.log_debug("딕셔너리를 YAML 텍스트로 변환하여 digest 추출을 시도합니다.")
            except Exception as e:
                self.log_error(f"YAML 변환 중 오류: {str(e)}")
                content = str(content)  # 실패 시 문자열로 변환

        if not isinstance(content, str):
            content = str(content)
            self.log_warning(f"콘텐츠가 문자열이 아니므로 변환했습니다: {type(content)}")

        # 파일 끝에 있는 digest 주석 형식 검색
        digest_pattern = r'#\s*digest:\s*([a-fA-F0-9:]+)'
        match = re.search(digest_pattern, content)
        
        if match:
            # self.log_debug(f"파일에서 digest 값을 추출했습니다: {match.group(1)}")
            return match.group(1)
        
        # digest를 찾지 못한 경우 에러 로깅
        self.log_error("템플릿 파일에서 digest 값을 찾을 수 없습니다. 모든 Nuclei 템플릿에는 digest 값이 있어야 합니다.")
        # 첫 100자와 마지막 100자 로깅하여 문제 확인 가능하도록 함
        content_start = content[:100] if len(content) > 100 else content
        content_end = content[-100:] if len(content) > 100 else content
        self.log_error(f"콘텐츠 시작 부분: {content_start}...")
        self.log_error(f"콘텐츠 마지막 부분: ...{content_end}")
        
        # digest가 없을 경우 빈 문자열 반환 (오류 표시를 위해)
        return "" 