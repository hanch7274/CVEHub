import logging
import os
import aiohttp
import asyncio
import json
import hashlib
import yaml
import git
import glob
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path
from app.models.cve_model import CVEModel
from app.services.crawler_base import BaseCrawlerService
from app.core.config import get_settings

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
        
        self.log_info(f"NucleiCrawlerService 초기화됨, 저장소 경로: {self.repo_path}")
    
    async def run(self) -> Dict[str, Any]:
        """크롤러 실행"""
        self.log_info("==== Nuclei 크롤러 실행 시작 ====")
        
        try:
            # 1. 진행 상황 보고 - 준비 단계
            await self.report_progress("준비", 0, "Nuclei 템플릿 저장소 준비 중...")
            
            # 2. 저장소 클론 또는 풀
            await self.report_progress("준비", 10, "GitHub 저장소 클론/풀 작업 중...")
            if not await self._clone_or_pull_repo():
                raise Exception("저장소 클론/풀 작업 실패")
            
            # 3. 데이터 수집 단계 시작 시 진행률 명확히 설정
            await self.report_progress("수집", 20, "데이터 수집 시작...")
            await self.report_progress("수집", 30, "템플릿 파일 검색 중...")
            templates = await self._find_template_files()
            self.log_info(f"총 {len(templates)}개의 템플릿 파일 발견")
            
            # 4. 데이터 처리 단계 시작 시 진행률 오버랩
            await self.report_progress("처리", 45, "데이터 처리 시작...")
            await self.report_progress("처리", 40, "템플릿 파일 파싱 중...")
            processed_data = await self._process_templates(templates)
            self.log_info(f"템플릿 처리 완료: {len(processed_data)}개 처리됨")
            
            # 5. 데이터베이스 업데이트 단계 시작
            await self.report_progress("업데이트", 75, "데이터베이스 업데이트 시작...")
            await self.report_progress("업데이트", 70, "CVE 데이터베이스 업데이트 중...")
            update_result = await self._update_database(processed_data)
            
            # 6. 완료 보고
            await self.report_progress(
                "완료", 
                100, 
                f"Nuclei 업데이트 완료. {update_result['count']}개의 CVE가 업데이트되었습니다."
            )
            
            # 최종 상태 확실히 전송 (100ms 후)
            await asyncio.sleep(0.1)
            await self.report_progress("완료", 100, f"Nuclei 업데이트 완료. {update_result['count']}개의 CVE가 업데이트되었습니다.", update_result)
            
            # 결과 반환
            return {
                "status": "success",
                "updated_cves": update_result,
                "message": f"업데이트 완료. {update_result['count']}개의 CVE 업데이트됨."
            }
            
        except Exception as e:
            error_msg = f"Nuclei 크롤러 실행 중 오류: {str(e)}"
            self.log_error(error_msg, e)
            await self.report_progress("오류", 0, error_msg)
            return {
                "status": "error",
                "message": error_msg
            }
    
    async def _clone_or_pull_repo(self) -> bool:
        """저장소 클론 또는 풀"""
        try:
            if not os.path.exists(self.repo_path):
                # 클론 작업 시작
                self.log_info(f"저장소 클론 시작: {self.repo_url} -> {self.repo_path}")
                
                # 25% 지점 메시지
                await self.report_progress("데이터 수집", 25, "Git 저장소 클론 중... (25%)")
                
                # 클론 작업 시작
                git.Repo.clone_from(self.repo_url, self.repo_path)
                
                # 75% 지점 메시지
                await self.report_progress("데이터 수집", 75, "Git 저장소 클론 중... (75%)")
                
                self.log_info("저장소 클론 완료")
            else:
                # 풀 작업 시작
                self.log_info(f"저장소 풀 시작: {self.repo_path}")
                
                # 25% 지점 메시지
                await self.report_progress("데이터 수집", 25, "Git 저장소 업데이트 중... (25%)")
                
                # 풀 작업 실행
                repo = git.Repo(self.repo_path)
                origin = repo.remotes.origin
                
                # 50% 지점 메시지
                await self.report_progress("데이터 수집", 50, "Git 저장소 업데이트 중... (50%)")
                
                # 풀 실행
                origin.pull()
                
                # 75% 지점 메시지
                await self.report_progress("데이터 수집", 75, "Git 저장소 업데이트 중... (75%)")
                
                self.log_info("저장소 풀 완료")
            return True
        except Exception as e:
            self.log_error(f"저장소 클론/풀 중 오류: {str(e)}", e)
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
        """템플릿 파일 처리"""
        self.log_info(f"템플릿 처리 시작: {len(template_files)}개")
        processed_data = []
        total = len(template_files)
        
        # 진행 상황 변수
        last_progress_idx = -1
        progress_points = [0, total // 4, total // 2, (total * 3) // 4, total - 1]
        
        for idx, file_path in enumerate(template_files):
            try:
                # 진행률 업데이트 전에 스킵 여부 확인
                # 중복 메시지 방지 로직
                if idx in progress_points and idx != last_progress_idx:
                    progress = 40 + int((idx / total) * 30)  # 40% ~ 70% 진행률
                    await self.report_progress(
                        "처리", 
                        progress, 
                        f"템플릿 처리 중... ({idx}/{total})"
                    )
                    last_progress_idx = idx
                
                # 파일명에서 CVE ID 추출
                file_name = os.path.basename(file_path)
                cve_id = file_name.split(".")[0].upper()
                if not cve_id.startswith("CVE-"):
                    cve_id = f"CVE-{cve_id}"
                
                # 파일 내용 읽기
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Nuclei 템플릿의 digest 해시값만 사용
                content_hash = self._extract_digest_hash(content)
                if not content_hash:
                    self.log_warning(f"Digest 해시를 찾을 수 없음: {cve_id}. 이 파일은 표준 Nuclei 템플릿이 아닐 수 있습니다.")
                    # 빈 해시 대신 고유한 해시 생성
                    import hashlib
                    content_hash = hashlib.md5(f"{cve_id}_{datetime.now().isoformat()}".encode('utf-8')).hexdigest()
                else:
                    self.log_debug(f"Digest 해시: {content_hash} ({cve_id})")
                
                # YAML 파싱
                template_data = yaml.safe_load(content)
                
                # 메타데이터 추출
                info = template_data.get('info', {})
                name = info.get('name', cve_id)
                description = info.get('description', '')
                severity = info.get('severity', 'unknown')
                references = info.get('reference', [])
                tags = info.get('tags', [])
                
                # 처리된 데이터 생성
                processed_template = {
                    "cve_id": cve_id,
                    "title": name,
                    "description": description,
                    "severity": severity,
                    "content": content,
                    "nuclei_hash": content_hash,
                    "source": "nuclei-templates",
                    "reference_urls": references,
                    "published_date": datetime.now(),
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                    "tags": tags
                }
                
                processed_data.append(processed_template)
                
            except Exception as e:
                self.log_error(f"템플릿 파일 처리 중 오류: {file_path}, {str(e)}")
                continue
        
        self.log_info(f"템플릿 처리 완료: {len(processed_data)}/{total} 성공")
        return processed_data
    
    async def _update_database(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """데이터베이스 업데이트"""
        self.log_info(f"데이터베이스 업데이트 시작: {len(data)}개 항목")
        updated = []
        total = len(data)
        
        # 데이터 검증
        if not data:
            self.log_warning("업데이트할 데이터가 없습니다.")
            return {"count": 0, "items": []}
        
        # DB 상태 확인
        try:
            # Beanie 문법 사용: find().count()
            db_count = await CVEModel.find().count()
            self.log_info(f"현재 DB에 {db_count}개의 CVE 레코드가 있습니다.")
        except AttributeError:
            # 다른 방법으로 시도: 컬렉션 직접 접근
            try:
                from motor.motor_asyncio import AsyncIOMotorClient
                from app.core.database import get_database
                
                db = await get_database()
                cve_collection = db.get_collection("cve_model")
                db_count = await cve_collection.count_documents({})
                self.log_info(f"현재 DB에 {db_count}개의 CVE 레코드가 있습니다.")
            except Exception as e:
                # 카운트 실패 시 0으로 가정
                self.log_warning(f"DB 레코드 수 조회 실패: {str(e)}")
                db_count = 0
        
        # 업데이트 진행
        for idx, item in enumerate(data):
            try:
                # 진행상황 보고 - 10% 단위에서 25% 단위로 변경
                if idx == 0 or idx == total // 4 or idx == total // 2 or idx == (total * 3) // 4 or idx == total - 1:
                    progress = int(70 + (idx / total) * 30)  # 70% ~ 100% 진행률
                    await self.report_progress(
                        "업데이트", 
                        progress, 
                        f"데이터베이스 업데이트 중... ({idx+1}/{total})"
                    )
                
                # CVE ID 확인
                cve_id = item.get("cve_id")
                if not cve_id:
                    self.log_warning(f"CVE ID가 없는 항목 무시: {item}")
                    continue
                
                # 기존 레코드 조회
                existing = await CVEModel.find_one({"cve_id": cve_id})
                
                # 변경 여부 확인
                is_new_or_changed = False
                if existing:
                    # 기존 해시값과 비교
                    old_hash = getattr(existing, 'nuclei_hash', '')
                    new_hash = item.get('nuclei_hash', '')
                    
                    if old_hash != new_hash:
                        is_new_or_changed = True
                        if old_hash and new_hash:
                            self.log_info(f"CVE 변경 감지: {cve_id} (digest 해시: {old_hash} -> {new_hash})")
                        else:
                            self.log_info(f"CVE 변경 감지: {cve_id} (해시 없음, 강제 업데이트)")
                else:
                    is_new_or_changed = True
                    self.log_info(f"새 CVE 발견: {cve_id}")
                
                # 새로운 항목이거나 변경된 경우 업데이트
                if is_new_or_changed:
                    if existing:
                        # 기존 항목 업데이트
                        update_data = {
                            "title": item.get("title"),
                            "description": item.get("description"),
                            "severity": item.get("severity"),
                            "content": item.get("content"),
                            "nuclei_hash": item.get("nuclei_hash"),
                            "reference_urls": item.get("reference_urls"),
                            "updated_at": datetime.now(),
                            "tags": item.get("tags")
                        }
                        
                        # None 값 필드 제거
                        update_data = {k: v for k, v in update_data.items() if v is not None}
                        
                        # 업데이트 실행
                        await CVEModel.update_one({"cve_id": cve_id}, {"$set": update_data})
                        self.log_info(f"CVE 업데이트됨: {cve_id}")
                    else:
                        # 새 항목 추가
                        try:
                            # published_date 필드 추가
                            if "published_date" not in item or item["published_date"] is None:
                                item["published_date"] = datetime.now()
                            
                            cve_model = CVEModel(**item)
                            await cve_model.save()
                            self.log_info(f"새 CVE 추가됨: {cve_id}")
                        except Exception as e:
                            self.log_error(f"CVE 저장 오류: {cve_id} - {str(e)}")
                            self.log_error(f"문제가 발생한 항목: {item}")
                            continue
                    
                    # 업데이트 목록에 추가
                    updated.append({
                        "cve_id": cve_id,
                        "title": item.get("title", ""),
                        "severity": item.get("severity", "unknown"),
                        "updated_at": datetime.now().isoformat()
                    })
            
            except Exception as e:
                self.log_error(f"항목 처리 중 오류: {str(e)}")
                continue
        
        # 업데이트 결과 로깅
        self.log_info(f"데이터베이스 업데이트 완료: {len(updated)}개 업데이트됨, 총 {total}개 처리됨")
        
        if len(updated) == 0:
            self.log_info("변경된 CVE가 없습니다.")
        
        # 업데이트 결과 반환
        return {
            "count": len(updated),
            "items": updated[:20] if updated else []  # 최대 20개 항목 반환
        }

    async def report_progress(self, stage, percent, message, updated_cves=None):
        """진행 상황 보고"""
        self.log_info(f"[{stage}] {percent}% - {message}")
        
        # 부모 클래스의 메서드 호출하여 웹소켓 메시지 전송
        await super().report_progress(stage, percent, message, updated_cves)
        
        # 기존 콜백 호출 로직 유지
        if hasattr(self, 'on_progress') and callable(self.on_progress):
            await self.on_progress(self.crawler_id, stage, percent, message)

    async def crawl(self) -> bool:
        """전체 크롤링 프로세스 실행"""
        try:
            # 초기 진행 상황 보고
            await self.report_progress("준비", 0, f"{self.crawler_id} 업데이트를 시작합니다.")
            # 메시지 전송 보장을 위한 지연
            await asyncio.sleep(0.5)
            
            # 1. 데이터 수집 단계
            await self.report_progress("데이터 수집", 10, "Git 저장소에서 데이터를 가져오는 중입니다...")
            # 메시지 전송 보장을 위한 지연
            await asyncio.sleep(0.5)
            
            success = await self.fetch_data()
            if not success:
                await self.report_progress("오류", 0, "Git 저장소에서 데이터를 가져오는데 실패했습니다.")
                return False
            await self.report_progress("데이터 수집", 40, "데이터 수집이 완료되었습니다.")
            # 메시지 전송 보장을 위한 지연
            await asyncio.sleep(0.5)
            
            # 2. 데이터 처리 단계
            await self.report_progress("데이터 처리", 45, "YAML 파일을 파싱하고 CVE 정보를 추출하는 중입니다...")
            cve_data = await self.parse_data(self.repo_path)
            if not cve_data or not cve_data.get('items'):
                await self.report_progress("오류", 0, "템플릿 파싱에 실패했거나 추출된 CVE가 없습니다.")
                return False
            await self.report_progress("데이터 처리", 70, f"{len(cve_data['items'])}개의 CVE 정보 파싱이 완료되었습니다.")
            # 메시지 전송 보장을 위한 지연
            await asyncio.sleep(0.5)
            
            # 3. 데이터베이스 업데이트 단계
            await self.report_progress("데이터베이스 업데이트", 75, "데이터베이스에 CVE 정보를 업데이트하는 중입니다...")
            success = await self.process_data(cve_data)
            if not success:
                await self.report_progress("오류", 0, "데이터베이스 업데이트에 실패했습니다.")
                return False
            
            # 4. 완료 단계
            updated_cves = self.updated_cves if hasattr(self, 'updated_cves') else []
            update_count = len(updated_cves)
            
            message = f"{self.crawler_id} 업데이트가 완료되었습니다. "
            if update_count > 0:
                message += f"{update_count}개의 CVE가 업데이트되었습니다."
            else:
                message += "업데이트된 CVE가 없습니다."
            
            # 완료 상태 명확하게 전송
            await self.report_progress("완료", 100, message, updated_cves)
            
            # 최종 상태 확실히 전송 (100ms 후)
            await asyncio.sleep(0.1)
            await self.report_progress("완료", 100, message, updated_cves)
            
            return True
            
        except Exception as e:
            self.log_error(f"크롤링 중 오류 발생: {str(e)}", e)
            await self.report_progress("오류", 0, f"크롤링 중 오류 발생: {str(e)}")
            return False

    async def fetch_data(self) -> Any:
        """데이터 가져오기 (BaseCrawlerService 추상 메소드 구현)"""
        # 진행 상황 25% 단위로 보고
        await self.report_progress("데이터 수집", 10, "Git 저장소 준비 중...")
        
        # 25% 지점 메시지
        await self.report_progress("데이터 수집", 25, "Git 저장소에서 데이터 가져오는 중... (25%)")
        
        # 50% 지점 메시지
        await self.report_progress("데이터 수집", 50, "Git 저장소에서 데이터 가져오는 중... (50%)")
        
        # 75% 지점 메시지
        await self.report_progress("데이터 수집", 75, "Git 저장소에서 데이터 가져오는 중... (75%)")
        
        # 템플릿 파일 검색 실행
        files = await self._find_template_files()
        
        # 완료 메시지
        await self.report_progress("데이터 수집", 95, f"데이터 수집 완료: {len(files)}개 파일")
        
        return files

    async def parse_data(self, raw_data: Any) -> List[Dict[str, Any]]:
        """데이터 파싱 (BaseCrawlerService 추상 메소드 구현)"""
        # 기존 _process_templates 메소드 재사용
        return await self._process_templates(raw_data)

    async def process_data(self, cve_data: dict) -> bool:
        """파싱된 CVE 데이터를 처리하고 데이터베이스에 저장"""
        try:
            from ..services.cve_service import CVEService
            cve_service = CVEService()
            
            # 업데이트 결과 추적용
            self.updated_cves = []
            total_count = len(cve_data.get('items', []))
            
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
                    existing_cve = await cve_service.find_cve_by_id(cve_id)
                    
                    if existing_cve:
                        # 기존 CVE의 해시 확인
                        existing_hash = existing_cve.get('nuclei_hash', '')
                        
                        if not existing_hash:
                            self.log_info(f"CVE 변경 감지: {cve_id} (해시 없음, 해시 추가 업데이트)")
                            # 해시만 추가하는 업데이트
                            item['nuclei_hash'] = content_hash
                            await cve_service.update_cve(cve_id, {'nuclei_hash': content_hash})
                            
                        elif existing_hash != content_hash:
                            self.log_info(f"CVE 변경 감지: {cve_id} (해시 변경됨)")
                            # 전체 정보 업데이트
                            item['nuclei_hash'] = content_hash
                            await cve_service.update_cve(cve_id, item)
                            self.updated_cves.append(item)
                        else:
                            # 해시가 동일하면 변경 없음
                            self.log_debug(f"CVE 변경 없음: {cve_id}")
                    else:
                        # 새 CVE 추가 (해시 포함)
                        self.log_info(f"새 CVE 추가: {cve_id}")
                        item['nuclei_hash'] = content_hash
                        item['created_by'] = 'nuclei_crawler'  # 생성자 표시
                        await cve_service.create_cve(item)
                        self.updated_cves.append(item)
                        
                except Exception as e:
                    self.log_error(f"항목 처리 중 오류: {e.__class__.__name__}", e)
                    # 개별 항목 오류는 전체 프로세스를 중단하지 않음
                    continue
            
            return True
        except Exception as e:
            self.log_error(f"데이터 처리 중 오류: {str(e)}", e)
            return False

    def _extract_digest_hash(self, content: str) -> Optional[str]:
        """파일 내용에서 digest 해시값 추출"""
        lines = content.strip().split('\n')
        for line in reversed(lines):  # 파일 끝에서부터 검색
            line = line.strip()
            if line.startswith('# digest:'):
                # 형식: # digest: [해시값]:[다른 해시값]
                digest_str = line[len('# digest:'):].strip()
                # 전체 digest 문자열을 해시로 사용 (더 고유함)
                main_hash = digest_str
                return main_hash
        return None 