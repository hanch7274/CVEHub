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
from app.cve.models import CVEModel
from ..crawler_base import BaseCrawlerService
from app.core.config import get_settings
import re
from app.common.utils.datetime_utils import get_utc_now
from app.cve.utils import create_reference

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
        """전체 크롤링 프로세스 - 간결하고 오류에 강한 구현"""
        self.websocket_enabled = True
        
        try:
            # 1. 초기 상태 보고
            await self.report_progress("preparing", 0, f"{self.crawler_id} 업데이트를 시작합니다.", require_websocket=True)
            
            # 2. 저장소 준비 - 에러 처리 강화
            if not await self._clone_or_pull_repo():
                raise Exception("저장소 클론/풀 작업 실패")
            await self.report_progress("preparing", 20, "저장소 준비 완료")
            
            # 3. 데이터 수집 - 검증 단순화
            await self.report_progress("fetching", 20, "템플릿 파일 수집 시작...")
            templates = await self.fetch_data()
            if not templates:
                raise Exception("템플릿 파일을 찾지 못했습니다.")
            await self.report_progress("fetching", 40, f"템플릿 파일 {len(templates)}개 수집 완료")
            
            # 4. 데이터 처리 - 검증 단순화
            await self.report_progress("processing", 40, f"{len(templates)}개 템플릿 파일 처리 시작...")
            processed_data = await self.parse_data(templates)
            if not processed_data.get('items'):
                raise Exception("템플릿 파일 처리 중 오류가 발생했습니다.")
            await self.report_progress("processing", 60, f"템플릿 파일 {len(processed_data['items'])}개 처리 완료")
            
            # 5. 데이터베이스 업데이트
            await self.report_progress("saving", 60, f"{len(processed_data['items'])}개 항목 업데이트 시작...")
            if not await self.process_data(processed_data):
                raise Exception("데이터베이스 업데이트 중 오류가 발생했습니다.")
                
            # 6. 완료 보고
            updated_count = len(getattr(self, 'updated_cves', []))
            await self.report_progress("completed", 100, f"완료: {updated_count}개의 CVE가 업데이트되었습니다.", 
                                updated_cves=getattr(self, 'updated_cves', []))
            
            return {
                "stage": "success",
                "message": f"업데이트 완료: {updated_count}개의 CVE가 업데이트되었습니다.",
                "updated": updated_count
            }
        except Exception as e:
            self.log_error(f"크롤러 오류: {str(e)}", e)
            await self.report_progress("error", 0, f"오류 발생: {str(e)}")
            return {
                "stage": "error",
                "message": str(e),
                "error": str(e)
            }
        finally:
            self.websocket_enabled = False
    
    async def fetch_data(self) -> List[str]:
        """템플릿 파일 가져오기 - 간결하고 효율적인 구현"""
        await self.report_progress("fetching", 30, "Nuclei 템플릿 파일 검색 중...")
        
        # 템플릿 파일 검색 - 이미 비동기 함수로 구현
        files = await self._find_template_files()
        
        if not files:
            self.log_warning("템플릿 파일을 찾지 못했습니다.")
            return []
        
        self.log_info(f"총 {len(files)}개의 템플릿 파일 발견")
        await self.report_progress("fetching", 40, f"데이터 수집 완료: {len(files)}개 파일")
        
        return files
    
    async def parse_data(self, raw_data: Any) -> Dict[str, Any]:
        """데이터 파싱 - 타입 안전성 강화"""
        if not raw_data:
            self.log_warning("파싱할 데이터가 없습니다.")
            return {"items": [], "count": 0}
        
        # 입력 데이터 정규화
        template_files = []
        if isinstance(raw_data, str):
            template_files = [raw_data]
        elif isinstance(raw_data, list):
            template_files = raw_data
        else:
            self.log_error(f"파싱할 데이터가 잘못된 형식입니다: {type(raw_data)}")
            return {"items": [], "count": 0}
        
        # 템플릿 처리 (실질적인 비즈니스 로직)
        processed_data = await self._process_templates(template_files)
        
        return {
            "items": processed_data,
            "count": len(processed_data)
        }

    async def process_data(self, cve_data: dict) -> bool:
        """파싱된 CVE 데이터를 처리하고 데이터베이스에 저장"""
        try:
            # 상위 클래스의 cve_service 활용
            self.updated_cves = []
            total_count = len(cve_data.get('items', []))
            
            for idx, item in enumerate(cve_data.get('items', [])):
                try:
                    # 진행률 계산 및 보고
                    progress = 75 + int((idx / total_count) * 20) if total_count > 0 else 75
                    if idx % (total_count // 4) == 0 or idx == total_count - 1:
                        await self.report_progress("데이터베이스 업데이트", progress, 
                                            f"{idx+1}/{total_count} 항목 처리 중 ({(idx+1)/total_count*100:.1f}%)")
                    
                    cve_id = item.get('cve_id')
                    if not cve_id:
                        self.log_warning(f"CVE ID가 없는 항목 건너뜀: {item}")
                        continue
                    
                    # Nuclei 특화 로직: digest 해시 처리
                    content = item.get('content', '')
                    content_hash = self._extract_digest_hash(content)
                    item['nuclei_hash'] = content_hash or ""
                    
                    # 상위 클래스의 업데이트 메서드 활용
                    updated_cve = await self.update_cve(cve_id, item, creator="Nuclei-Crawler")
                    
                    if updated_cve:
                        self.log_info(f"CVE 업데이트 성공: {cve_id}")
                        self.updated_cves.append(item)
                    else:
                        self.log_error(f"CVE 업데이트 실패: {cve_id}")
                        
                except Exception as e:
                    self.log_error(f"항목 처리 중 오류: {str(e)}", e)
                    continue
                    
            return len(self.updated_cves) > 0
            
        except Exception as e:
            self.log_error(f"데이터 처리 중 오류: {str(e)}", e)
            return False

    async def _find_template_files(self) -> List[str]:
        """CVE 템플릿 파일 목록 찾기 - 비동기 파일 시스템 처리로 최적화"""
        self.log_info(f"템플릿 파일 검색 시작: {self.cves_path}")
        
        try:
            # asyncio 사용하여 IO 작업 비동기 처리
            template_files = []
            loop = asyncio.get_event_loop()
            
            # 디렉토리 내의 모든 연도 폴더 비동기 확인
            def get_year_dirs():
                return glob.glob(os.path.join(self.cves_path, "*"))
            
            year_dirs = await loop.run_in_executor(None, get_year_dirs)
            
            # 각 연도 디렉토리 병렬 처리
            async def process_year_dir(year_dir):
                if not os.path.isdir(year_dir):
                    return []
                    
                def get_yaml_files():
                    return glob.glob(os.path.join(year_dir, "*.yaml"))
                    
                return await loop.run_in_executor(None, get_yaml_files)
            
            # 모든 연도 디렉토리에서 병렬로 YAML 파일 검색
            tasks = [process_year_dir(year_dir) for year_dir in year_dirs]
            results = await asyncio.gather(*tasks)
            
            # 결과 병합
            for year_files in results:
                template_files.extend(year_files)
            
            self.log_info(f"템플릿 파일 검색 완료: {len(template_files)}개 파일 발견")
            return template_files
        except Exception as e:
            self.log_error(f"템플릿 파일 검색 중 오류: {str(e)}", e)
            return []
        
    async def _process_templates(self, template_files: List[str]) -> List[Dict[str, Any]]:
        """
        템플릿 파일 처리 최적화 - 병렬 처리, 메모리 효율성 개선
        헬퍼 메소드 활용으로 코드 중복 제거
        """
        if not template_files:
            return []
            
        self.log_info(f"템플릿 처리 시작: {len(template_files)}개 파일")
        results = []
        total = len(template_files)
        
        # 청크 단위로 처리 (메모리 효율성)
        chunk_size = 50  # 한 번에 처리할 파일 수
        
        for chunk_start in range(0, total, chunk_size):
            chunk_end = min(chunk_start + chunk_size, total)
            current_chunk = template_files[chunk_start:chunk_end]
            
            # 현재 청크 진행률 계산 및 보고
            progress = 40 + int((chunk_end / total) * 20)
            await self.report_progress(
                "processing", progress, 
                f"데이터 처리 중 ({chunk_end}/{total} 항목, {chunk_end/total*100:.1f}%)"
            )
            
            # 청크 내 파일 병렬 처리
            tasks = [self._process_single_template(file_path) for file_path in current_chunk]
            chunk_results = await asyncio.gather(*tasks)
            
            # 유효한 결과만 추가
            for result in chunk_results:
                if result:
                    results.append(result)
        
        self.log_info(f"템플릿 처리 완료: {len(results)}/{len(template_files)} 성공")
        return results
        
    async def _process_single_template(self, file_path: str) -> Optional[Dict[str, Any]]:
        """단일 템플릿 파일 처리 - 코드 모듈화"""
        try:
            if not isinstance(file_path, str) or not os.path.exists(file_path):
                return None
            
            # 파일에서 CVE ID 추출
            file_name = os.path.basename(file_path)
            cve_id = self._extract_cve_id_from_filename(file_name)
            
            # 파일 읽기 - 비동기로 변환
            loop = asyncio.get_event_loop()
            content = await loop.run_in_executor(None, lambda: open(file_path, 'r', encoding='utf-8').read())
            
            # 콘텐츠 해시 계산
            content_hash = self._extract_digest_hash(content)
            
            # YAML 파싱 - 비동기로 변환
            yaml_data = await loop.run_in_executor(None, lambda: yaml.safe_load(content))
            if not yaml_data:
                return None
            
            # 정보 추출 로직
            info = yaml_data.get('info', {})
            name = info.get('name', '')
            
            # 파싱된 템플릿에서 CVE ID 추출
            if 'CVE-' in name:
                cve_pattern = r'(CVE-\d{4}-\d{4,})'
                match = re.search(cve_pattern, name)
                if match:
                    cve_id = match.group(1).upper()
            
            # 헬퍼 메소드를 활용하여 심각도 표준화
            severity = self._standardize_severity(info.get('severity', 'unknown'))
            
            # 헬퍼 메소드를 활용하여 참조 URL 추출
            references = self._extract_references(info.get('reference', []))
            
            # 헬퍼 메소드를 활용하여 PoC 정보 생성
            pocs = self._create_pocs(cve_id, file_path)

            return {
                "cve_id": cve_id,
                "title": name or cve_id,
                "description": info.get('description', ''),
                "severity": severity,
                "content": content,
                "nuclei_hash": content_hash or "",
                "source": "nuclei-templates",
                "references": references,
                "pocs": pocs,
                "snort_rules": [],
                "file_path": file_path
            }
        except Exception as e:
            self.log_error(f"템플릿 처리 중 오류: {file_path}, {str(e)}")
            return None
            
    # 헬퍼 메서드들로 분리하여 가독성 향상
    def _extract_cve_id_from_filename(self, file_name: str) -> str:
        """파일명에서 CVE ID 추출"""
        cve_id_from_file = file_name.split(".")[0].upper()
        if cve_id_from_file.startswith("CVE-"):
            return cve_id_from_file
            
        # 파일명에 CVE ID가 포함되어 있는지 확인
        cve_pattern = r'(CVE-\d{4}-\d{4,})'
        match = re.search(cve_pattern, file_name, re.IGNORECASE)
        if match:
            return match.group(1).upper()
        
        return f"NUCLEI-{file_name.split('.')[0]}"
    
    def _standardize_severity(self, severity: str) -> str:
        """심각도 표준화"""
        if severity in ['critical', 'high', 'medium', 'low', 'info', 'unknown']:
            return severity
        
        # 매핑 로직
        severity_lower = severity.lower()
        if any(term in severity_lower for term in ['critical', 'crit']):
            return 'critical'
        elif any(term in severity_lower for term in ['high', 'severe']):
            return 'high'
        elif any(term in severity_lower for term in ['medium', 'moderate', 'med']):
            return 'medium'
        elif any(term in severity_lower for term in ['low', 'minor']):
            return 'low'
        elif any(term in severity_lower for term in ['info', 'information']):
            return 'info'
        
        return 'unknown'

    def _extract_references(self, references) -> List[Dict[str, Any]]:
        """참조 URL 추출 및 객체 변환"""
        if isinstance(references, str):
            references = [references]
        elif not references:
            return []
        
        reference_objects = []
        current_time = datetime.now(ZoneInfo("UTC")).isoformat()
        
        for ref_url in references:
            if ref_url:
                reference_objects.append({
                    "url": ref_url,
                    "type": "OTHER",
                    "description": f"Nuclei Template Reference",
                    "created_at": current_time,
                    "created_by": "Nuclei-Crawler",
                    "last_modified_at": current_time,
                    "last_modified_by": "Nuclei-Crawler"
                })
        
        return reference_objects

    def _create_pocs(self, cve_id: str, file_path: str) -> List[Dict[str, Any]]:
        """PoC 정보 생성"""
        # CVE ID에서 연도 추출
        cve_year_match = re.match(r'CVE-(\d{4})-\d+', cve_id)
        cve_year = cve_year_match.group(1) if cve_year_match else "unknown"
        
        # GitHub URL 생성
        github_url = f"https://github.com/projectdiscovery/nuclei-templates/blob/main/http/cves/{cve_year}/{cve_id}.yaml"
        
        current_time = datetime.now(ZoneInfo("UTC")).isoformat()
        return [{
            "source": "Nuclei-Templates",
            "url": github_url,
            "description": f"Nuclei Template for {cve_id}",
            "created_at": current_time,
            "created_by": "Nuclei-Crawler",
            "last_modified_at": current_time,
            "last_modified_by": "Nuclei-Crawler"
        }]

    async def _clone_or_pull_repo(self) -> bool:
        """저장소 클론 또는 풀 - 비동기 처리로 최적화"""
        try:
            loop = asyncio.get_event_loop()
            
            if not os.path.exists(self.repo_path):
                # 클론 작업 시작
                self.log_info(f"저장소 클론 시작: {self.repo_url} -> {self.repo_path}")
                
                # 비동기로 클론 작업 수행
                await loop.run_in_executor(
                    None, 
                    lambda: git.Repo.clone_from(self.repo_url, self.repo_path)
                )
                
                self.log_info("저장소 클론 완료")
            else:
                # 풀 작업 시작
                self.log_info(f"저장소 풀 시작: {self.repo_path}")
                
                # 저장소 불러오기
                def load_and_pull():
                    repo = git.Repo(self.repo_path)
                    origin = repo.remotes.origin
                    origin.pull()
                    return True
                
                # 비동기로 풀 작업 수행
                await loop.run_in_executor(None, load_and_pull)
                
                self.log_info("저장소 풀 완료")
            
            return True
        except Exception as e:
            self.log_error(f"저장소 클론/풀 중 오류: {str(e)}", e)
            
            # 오류 후 복구 시도
            if os.path.exists(self.repo_path):
                self.log_warning(f"문제가 있는 저장소 디렉토리 삭제 시도: {self.repo_path}")
                try:
                    import shutil
                    await loop.run_in_executor(None, lambda: shutil.rmtree(self.repo_path, ignore_errors=True))
                    self.log_info(f"다음 실행 시 새로 클론할 수 있도록 저장소 디렉토리 삭제됨")
                except Exception as cleanup_err:
                    self.log_error(f"저장소 디렉토리 정리 중 오류: {str(cleanup_err)}")
            
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