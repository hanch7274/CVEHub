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
from app.cve.models import CVEModel, ChangeItem
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
        
        # 웹소켓 항상 활성화 상태로 유지
        self.websocket_enabled = True
        
        self.log_info(f"NucleiCrawlerService 초기화됨, 저장소 경로: {self.repo_path}")
    
    async def crawl(self) -> Dict[str, Any]:
        """전체 크롤링 프로세스 - 간결하고 오류에 강한 구현"""
        # 웹소켓은 이미 초기화에서 활성화됨
        
        try:
            # 시작 시간 기록 (성능 측정용)
            start_time = datetime.now()
            
            # 1. 초기 상태 보고
            await self.report_progress("preparing", 0, f"{self.crawler_id} 업데이트를 시작합니다.", require_websocket=True)
            
            # 2. 저장소 준비 - 에러 처리 강화
            if not await self._clone_or_pull_repo():
                raise Exception("저장소 클론/풀 작업 실패")
            await self.report_progress("preparing", 10, "저장소 준비 완료")
            
            # 3. 데이터 수집 - 검증 단순화
            await self.report_progress("fetching", 10, "템플릿 파일 수집 시작...")
            templates = await self.fetch_data()
            if not templates:
                raise Exception("템플릿 파일을 찾지 못했습니다.")
            
            # 파일 수집 완료 - 25% 지점
            await self.report_progress("fetching", 20, f"템플릿 파일 {len(templates)}개 수집 완료")
            
            # 4. 데이터 처리 - 검증 단순화
            await self.report_progress("processing", 20, f"{len(templates)}개 템플릿 파일 처리 시작...")
            processed_data = await self.parse_data(templates)
            if not processed_data.get('items'):
                raise Exception("템플릿 파일 처리 중 오류가 발생했습니다.")
            
            # 파일 처리 완료 - 60% 지점
            processed_count = len(processed_data['items'])
            await self.report_progress("processing", 60, f"템플릿 파일 {processed_count}개 처리 완료")
            
            # 5. 데이터베이스 업데이트
            await self.report_progress("saving", 60, f"{processed_count}개 항목 업데이트 시작...")
            if not await self.process_data(processed_data):
                raise Exception("데이터베이스 업데이트 중 오류가 발생했습니다.")
                
            # 6. 완료 보고
            updated_count = len(getattr(self, 'updated_cves', []))
            
            # 소요 시간 계산
            elapsed_time = (datetime.now() - start_time).total_seconds()
            time_per_item = elapsed_time / max(1, processed_count)
            
            # 완료 메시지 - 성능 정보 포함
            completion_message = (f"완료: {updated_count}개의 CVE가 업데이트되었습니다. "  
                                f"(처리 속도: {time_per_item:.2f}초/항목, 총 소요 시간: {elapsed_time:.1f}초)")
            
            await self.report_progress("completed", 100, completion_message, 
                                updated_cves=getattr(self, 'updated_cves', []))
            
            # 성능 요약 로깅
            self.log_info(f"크롤링 완료: {processed_count}개 항목 분석, {updated_count}개 항목 업데이트")
            self.log_info(f"총 소요 시간: {elapsed_time:.1f}초, 평균 처리 속도: {time_per_item:.2f}초/항목")
            
            return {
                "stage": "success",
                "message": completion_message,
                "updated": updated_count,
                "performance": {
                    "total_time": round(elapsed_time, 1),
                    "time_per_item": round(time_per_item, 2),
                    "items_processed": processed_count
                }
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
            
            # 성능 최적화를 위한 로깅 제한
            log_interval = max(1, total_count // 20)  # 전체 항목의 5%마다 로그 출력
            
            # 진행률 보고를 위한 마일스톤 계산 (0%, 25%, 50%, 75%, 100%)
            milestones = [int(total_count * p) for p in [0, 0.25, 0.5, 0.75, 1.0]]
            next_milestone_idx = 0
            
            for idx, item in enumerate(cve_data.get('items', [])):
                try:
                    # 중요 마일스톤에 도달했을 때만 웹소켓 메시지 전송
                    if next_milestone_idx < len(milestones) and idx >= milestones[next_milestone_idx]:
                        # 진행률 계산 (0-100%)
                        progress = 60 + int((next_milestone_idx / 4) * 40)
                        milestone_percent = int(next_milestone_idx * 25)
                        
                        await self.report_progress(
                            "saving", progress, 
                            f"데이터베이스 업데이트 {milestone_percent}% 완료: {idx}/{total_count} 항목"
                        )
                        next_milestone_idx += 1
                    
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
                    
                    # 제한된 로깅 - 특정 간격으로만 상세 로그 출력
                    if updated_cve:
                        if idx % log_interval == 0 or idx == total_count - 1:
                            self.log_info(f"CVE 업데이트 진행 중: {idx+1}/{total_count} ({(idx+1)/total_count*100:.1f}%)")
                        self.updated_cves.append(item)
                    else:
                        self.log_error(f"CVE 업데이트 실패: {cve_id}")
                        
                except Exception as e:
                    self.log_error(f"항목 처리 중 오류: {str(e)}", e)
                    continue
            
            # 최종 결과 요약 로깅
            self.log_info(f"총 {total_count}개 항목 중 {len(self.updated_cves)}개 업데이트 완료")
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
        
        # 진행률 보고를 위한 마일스톤 계산 (0%, 25%, 50%, 75%, 100%)
        milestones = [int(total * p) for p in [0, 0.25, 0.5, 0.75, 1.0]]
        next_milestone_idx = 0
        
        # 로그 최적화를 위한 간격 설정
        log_interval = max(1, total // 10)  # 10% 간격으로 로그 출력
        
        processed_count = 0
        for chunk_start in range(0, total, chunk_size):
            chunk_end = min(chunk_start + chunk_size, total)
            current_chunk = template_files[chunk_start:chunk_end]
            processed_count += len(current_chunk)
            
            # 중요 마일스톤에 도달했을 때만 웹소켓 메시지 전송
            if next_milestone_idx < len(milestones) and processed_count >= milestones[next_milestone_idx]:
                # 진행률 계산 (0-60%)
                progress = 20 + int((next_milestone_idx / 4) * 40)
                milestone_percent = int(next_milestone_idx * 25)
                
                await self.report_progress(
                    "processing", progress, 
                    f"파일 처리 {milestone_percent}% 완료: {processed_count}/{total} 항목"
                )
                next_milestone_idx += 1
            
            # 제한된 로깅 - 특정 간격으로만 상세 로그 출력
            if chunk_start % log_interval < chunk_size or chunk_end == total:
                self.log_info(f"템플릿 처리 진행 중: {processed_count}/{total} ({processed_count/total*100:.1f}%)")
            
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
            # 파일명에서 CVE ID 추출
            file_name = os.path.basename(file_path)
            cve_id = self._extract_cve_id_from_filename(file_name)
            
            if not cve_id:
                # 디버그 레벨로 낮춤 - 많은 파일이 처리되므로 경고 로그가 과도하게 생성됨
                self.logger.debug(f"CVE ID를 추출할 수 없음: {file_name}")
                return None
            
            # YAML 파일 읽기
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            try:
                yaml_data = yaml.safe_load(content)
            except Exception as e:
                self.log_error(f"YAML 파싱 오류 ({file_path}): {str(e)}")
                return None
                
            if not yaml_data or not isinstance(yaml_data, dict):
                # 디버그 레벨로 낮춤
                self.logger.debug(f"유효하지 않은 YAML 형식 ({file_path})")
                return None
                
            # 기본 데이터 추출
            info = yaml_data.get('info', {})
            
            severity = info.get('severity', '')
            description = info.get('description', '')
            name = info.get('name', '')
            
            # CVE 데이터 구성
            cve_data = {
                'cve_id': cve_id,
                'title': name,
                'description': description,
                'severity': self._standardize_severity(severity),
                'content': content,  # 원본 콘텐츠 보존
                'reference': self._extract_reference(info.get('reference', [])),
                'poc': self._create_poc(cve_id, file_path),
                'snort_rule': [],
                'file_path': file_path
            }
            
            # 로그 제거 - 파일이 많아 로그가 과도하게 생성됨
            return cve_data
            
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

    def _extract_reference(self, reference) -> List[Dict[str, Any]]:
        """참조 URL 추출 및 객체 변환"""
        if isinstance(reference, str):
            reference = [reference]
        elif not reference:
            return []
        
        reference_objects = []
        current_time = datetime.now(ZoneInfo("UTC")).isoformat()
        
        # URL 패턴과 해당 타입을 매핑하는 딕셔너리
        url_type_mapping = {
            "nvd.nist.gov": "NVD",
            "exploit.db.com": "Exploit",
            "nuclei-templates": "Exploit",
            "metasploit-framework": "Exploit"
            # 필요시 여기에 더 많은 매핑을 추가할 수 있습니다
        }
        
        for ref_url in reference:
            if not ref_url:
                continue
                
            # 기본 타입은 OTHER로 설정
            ref_type = "OTHER"
            description = "Nuclei Template Reference"
            
            # URL 패턴 매칭
            for pattern, type_value in url_type_mapping.items():
                if pattern in ref_url:
                    ref_type = type_value
                    description = f"{type_value} Reference"
                    break
                    
            reference_objects.append({
                "url": ref_url,
                "type": ref_type,
                "description": description,
                "created_at": current_time,
                "created_by": "Nuclei-Crawler",
                "last_modified_at": current_time,
                "last_modified_by": "Nuclei-Crawler"
            })
        
        return reference_objects

    def _create_poc(self, cve_id: str, file_path: str) -> List[Dict[str, Any]]:
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
                
                # 얕은 클론 옵션 추가 - 다운로드 속도 향상을 위해 최신 커밋만 가져옴
                def clone_with_timeout():
                    try:
                        # 얕은 클론으로 속도 최적화 (depth=1로 최신 커밋만 가져옴)
                        return git.Repo.clone_from(
                            self.repo_url, 
                            self.repo_path,
                            depth=1,  # 얕은 클론
                            single_branch=True,  # 단일 브랜치만
                            branch='master'  # 메인 브랜치
                        )
                    except git.GitCommandError as e:
                        self.log_error(f"Git 클론 명령 실패: {str(e)}")
                        raise
                
                # 비동기로 클론 작업 수행 (타임아웃 설정)
                try:
                    await asyncio.wait_for(
                        loop.run_in_executor(None, clone_with_timeout),
                        timeout=180  # 3분 타임아웃
                    )
                    self.log_info("저장소 클론 완료")
                except asyncio.TimeoutError:
                    self.log_error("저장소 클론 시간 초과 (3분). 작업 중단.")
                    return False
                
            else:
                # 풀 작업 시작
                self.log_info(f"저장소 풀 시작: {self.repo_path}")
                
                # 저장소 불러오기 - 타임아웃 처리 추가
                def load_and_pull():
                    try:
                        repo = git.Repo(self.repo_path)
                        origin = repo.remotes.origin
                        origin.pull()
                        return True
                    except git.GitCommandError as e:
                        self.log_error(f"Git 풀 명령 실패: {str(e)}")
                        raise
                
                # 비동기로 풀 작업 수행 (타임아웃 설정)
                try:
                    await asyncio.wait_for(
                        loop.run_in_executor(None, load_and_pull),
                        timeout=120  # 2분 타임아웃
                    )
                    self.log_info("저장소 풀 완료")
                except asyncio.TimeoutError:
                    self.log_error("저장소 풀 시간 초과 (2분). 작업 중단.")
                    return False
            
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