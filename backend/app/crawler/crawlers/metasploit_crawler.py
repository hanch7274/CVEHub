import os
import git
import re
import logging
from pathlib import Path
from ..crawler_base import BaseCrawlerService
from app.cve.models import CVEModel
from ...core.config import get_settings
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
settings = get_settings()

class MetasploitCrawlerService(BaseCrawlerService):
    """
    Metasploit Framework 저장소에서 CVE 관련 PoC를 크롤링하는 서비스
    """
    def __init__(self):
        super().__init__(crawler_name="Metasploit-Crawler")
        self.repo_url = "https://github.com/rapid7/metasploit-framework.git"
        
        # BASE_DIR이 없는 경우 기본 경로 사용
        base_dir = getattr(settings, 'BASE_DIR', '/app/crawlers')
        
        # 절대 경로 보장
        if not os.path.isabs(base_dir):
            base_dir = os.path.abspath(base_dir)
            
        # 기본 디렉토리가 없으면 생성
        os.makedirs(base_dir, exist_ok=True)
        
        self.repo_path = os.path.join(settings.DATA_DIR, "metasploit-framework")
        self.modules_path = os.path.join(self.repo_path, "modules/exploits")
        
        # modules_path의 상위 디렉토리도 생성
        os.makedirs(os.path.dirname(self.modules_path), exist_ok=True)
        
        self.log_info(f"Metasploit 크롤러가 초기화되었습니다. 저장소 경로: {self.repo_path}")
    
    async def fetch_data(self) -> bool:
        """저장소 클론 또는 풀"""
        try:
            if not os.path.exists(self.repo_path):
                self.log_info(f"Metasploit 저장소를 {self.repo_path}에 클론합니다")
                git.Repo.clone_from(self.repo_url, self.repo_path, depth=1)  # shallow clone for faster download
            else:
                self.log_info("Metasploit 최신 변경사항을 가져옵니다")
                repo = git.Repo(self.repo_path)
                origin = repo.remotes.origin
                origin.pull()
            return True
        except Exception as e:
            self.log_error("데이터 가져오기 중 오류 발생", e)
            return False
    
    async def parse_data(self, file_path: str) -> dict:
        """Ruby 파일에서 CVE 정보 파싱"""
        try:
            # Ruby 파일 읽기
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # CVE ID 찾기 (예: CVE-2021-1234)
            cve_pattern = r'CVE-\d{4}-\d{1,7}'
            cve_matches = re.findall(cve_pattern, content)
            
            if not cve_matches:
                return None
                
            cve_id = cve_matches[0]  # 첫 번째 CVE ID 사용
            
            # 모듈 이름과 설명 찾기
            name_match = re.search(r"['\"']Name['\"']\s*=>\s*['\"']([^'\"']+)['\"']", content)
            desc_match = re.search(r"['\"']Description['\"']\s*=>\s*['\"']([^'\"']+)['\"']", content)
            
            name = name_match.group(1) if name_match else "Unknown Metasploit Module"
            description = desc_match.group(1) if desc_match else "No description available"
            
            # Reference URLs 찾기
            reference_pattern = r"['\"']Reference['\"']\s*=>\s*\[(.*?)\]"
            reference_section = re.search(reference_pattern, content, re.DOTALL)
            
            reference = []
            if reference_section:
                ref_text = reference_section.group(1)
                url_matches = re.findall(r"['\"'](https?://[^'\"']+)['\"']", ref_text)
                
                for url in url_matches:
                    ref_type = 'NVD' if 'nvd.nist.gov' in url else 'OTHER'
                    reference.append({
                        'url': url,
                        'source': 'metasploit-framework',
                        'type': ref_type,
                        'created_by': self.crawler_name
                    })
            
            # Metasploit 모듈 URL 생성
            relative_path = os.path.relpath(file_path, self.repo_path)
            module_url = f"https://github.com/rapid7/metasploit-framework/blob/master/{relative_path}"
            
            # PoC 정보 생성
            current_time = self.get_current_time()
            
            # Metasploit 모듈 URL을 Reference에 추가
            reference.append({
                'url': module_url,
                'source': 'metasploit-framework',
                'type': 'Exploit',
                'description': 'Metasploit Module',
                'created_by': self.crawler_name
            })
            
            # PoC 객체 생성
            poc = [{
                'source': 'Metasploit-Framework',
                'url': module_url,
                'description': f'Metasploit: {name}',
                'created_at': current_time,
                'created_by': self.crawler_name
            }]
            
            return {
                'cve_id': cve_id,
                'title': name,
                'description': description,
                'reference': reference,
                'poc': poc,
                'created_at': current_time,
                'last_modified_at': current_time,
                'created_by': self.crawler_name
            }
        except Exception as e:
            self.log_error(f"Error parsing {file_path}", e)
            return None
    
    async def process_data(self, cve_data: dict) -> bool:
        """CVE 데이터 처리 및 DB 저장"""
        try:
            if not cve_data or not cve_data.get('cve_id'):
                return False
                
            # 기존 CVE 검색
            cve = await CVEModel.find_one({'cve_id': cve_data['cve_id']})
            
            if not cve:
                # 새로운 CVE인 경우 전체 데이터 저장
                
                # 히스토리 정보 추가
                current_time = datetime.now(ZoneInfo("UTC"))
                changes = []
                
                # 기본 CVE 생성 정보
                changes.append({
                    "field": "cve",
                    "field_name": "CVE",
                    "action": "add",
                    "summary": "CVE 생성 (Metasploit-Crawler)"
                })
                
                # 제목 정보 기록
                if cve_data.get('title'):
                    changes.append({
                        "field": "title",
                        "field_name": "제목",
                        "action": "add",
                        "detail_type": "detailed",
                        "after": cve_data.get('title'),
                        "summary": "제목 추가됨"
                    })
                    
                # 설명 정보 기록
                if cve_data.get('description'):
                    changes.append({
                        "field": "description",
                        "field_name": "설명",
                        "action": "add",
                        "detail_type": "detailed",
                        "after": cve_data.get('description'),
                        "summary": "설명 추가됨"
                    })
                    
                # 상태 정보 기록
                changes.append({
                    "field": "status",
                    "field_name": "상태",
                    "action": "add",
                    "detail_type": "detailed",
                    "after": "신규등록",
                    "summary": "상태가 '신규등록'(으)로 설정됨"
                })
                
                # 참조 정보 기록
                if cve_data.get('reference') and len(cve_data.get('reference')) > 0:
                    changes.append({
                        "field": "reference",
                        "field_name": "Reference",
                        "action": "add",
                        "detail_type": "simple",
                        "summary": f"Reference {len(cve_data.get('reference'))}개 추가됨"
                    })
                    
                # PoC 정보 기록
                if cve_data.get('poc') and len(cve_data.get('poc')) > 0:
                    changes.append({
                        "field": "poc",
                        "field_name": "PoC",
                        "action": "add",
                        "detail_type": "simple",
                        "summary": f"PoC {len(cve_data.get('poc'))}개 추가됨"
                    })
                
                # modification_history 부분 제거 (activity로 대체 예정)
                
                cve = CVEModel(
                    cve_id=cve_data['cve_id'],
                    title=cve_data['title'],
                    description=cve_data['description'],
                    reference=cve_data['reference'],
                    poc=cve_data['poc'],
                    created_at=cve_data['created_at'],
                    last_modified_at=cve_data['last_modified_at'],
                    created_by="Metasploit-Crawler"
                )
            else:
                # 기존 CVE의 경우 PoC와 Reference만 업데이트
                # 기존 Reference에 없는 새로운 Reference만 추가
                existing_ref_urls = [ref.url for ref in cve.reference]
                for new_ref in cve_data['reference']:
                    if new_ref['url'] not in existing_ref_urls:
                        cve.reference.append(new_ref)
                        
                # 기존 PoC에 없는 새로운 PoC만 추가
                existing_poc_urls = [poc.url for poc in cve.poc]
                for new_poc in cve_data['poc']:
                    if new_poc['url'] not in existing_poc_urls:
                        cve.poc.append(new_poc)
                        
                # last_modified_at 업데이트
                cve.last_modified_at = cve_data['last_modified_at']
                
            await cve.save()
            return True
        except Exception as e:
            self.log_error("Error processing CVE data", e)
            return False
            
    async def crawl(self) -> bool:
        """전체 크롤링 프로세스"""
        try:
            # 초기 상태 메시지 (웹소켓 연결 필수)
            await self.report_progress("준비", 0, f"Metasploit 크롤링을 시작합니다", require_websocket=True)
            
            if not await self.fetch_data():
                await self.report_progress("오류", 0, "저장소 데이터를 가져오는데 실패했습니다", require_websocket=True)
                return False
                
            success_count = 0
            error_count = 0
            
            # Ruby 파일 순회
            for ruby_file in Path(self.modules_path).rglob("*.rb"):
                try:
                    cve_data = await self.parse_data(str(ruby_file))
                    if cve_data and await self.process_data(cve_data):
                        success_count += 1
                    elif cve_data:  # 파싱은 성공했지만 저장 실패
                        error_count += 1
                except Exception as e:
                    self.log_error(f"Error processing {ruby_file}", e)
                    error_count += 1
                    
            self.log_info(f"Metasploit crawling completed - Success: {success_count}, Errors: {error_count}")
            await self.report_progress("완료", 100, f"Metasploit 크롤링 완료 - 성공: {success_count}, 오류: {error_count}", require_websocket=True)
            
            return True
        except Exception as e:
            try:
                await self.report_progress("오류", 0, f"크롤링 중 오류 발생: {str(e)}", require_websocket=True)
            except:
                self.log_error(f"크롤러 오류 및 웹소켓 메시지 전송 실패: {str(e)}")
            return False
            
    async def crawl_single_cve(self, cve_id: str) -> bool:
        """단일 CVE 크롤링"""
        try:
            if not await self.fetch_data():
                self.log_error("Failed to fetch repository data")
                return False
                
            # 해당 CVE ID가 포함된 파일 검색
            cve_pattern = re.compile(re.escape(cve_id), re.IGNORECASE)
            success_count = 0
            
            for ruby_file in Path(self.modules_path).rglob("*.rb"):
                try:
                    with open(ruby_file, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        
                    if cve_pattern.search(content):
                        self.log_info(f"Found matching file: {ruby_file}")
                        cve_data = await self.parse_data(str(ruby_file))
                        if cve_data and await self.process_data(cve_data):
                            success_count += 1
                except Exception as e:
                    self.log_error(f"Error processing {ruby_file}", e)
            
            if success_count > 0:
                self.log_info(f"Successfully processed {success_count} modules for {cve_id}")
                return True
            else:
                self.log_error(f"No valid modules found for {cve_id}")
                return False
                
        except Exception as e:
            self.log_error(f"Error in crawl_single_cve for {cve_id}", e)
            return False 