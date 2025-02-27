import os
import git
import re
import logging
from pathlib import Path
from .crawler_base import BaseCrawlerService
from ..models.cve_model import CVEModel
from ..core.config import get_settings

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
        
        self.repo_path = os.path.join(base_dir, "metasploit-framework")
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
            reference_pattern = r"['\"']References['\"']\s*=>\s*\[(.*?)\]"
            reference_section = re.search(reference_pattern, content, re.DOTALL)
            
            references = []
            if reference_section:
                ref_text = reference_section.group(1)
                url_matches = re.findall(r"['\"'](https?://[^'\"']+)['\"']", ref_text)
                
                for url in url_matches:
                    ref_type = 'NVD' if 'nvd.nist.gov' in url else 'OTHER'
                    references.append({
                        'url': url,
                        'source': 'metasploit-framework',
                        'type': ref_type,
                        'added_by': self.crawler_name
                    })
            
            # Metasploit 모듈 URL 생성
            relative_path = os.path.relpath(file_path, self.repo_path)
            module_url = f"https://github.com/rapid7/metasploit-framework/blob/master/{relative_path}"
            
            # PoC 정보 생성
            current_time = self.get_current_time()
            
            # Metasploit 모듈 URL을 Reference에 추가
            references.append({
                'url': module_url,
                'source': 'metasploit-framework',
                'type': 'Exploit',
                'description': 'Metasploit Module',
                'added_by': self.crawler_name
            })
            
            # PoC 객체 생성
            pocs = [{
                'source': 'Metasploit-Framework',
                'url': module_url,
                'description': f'Metasploit: {name}',
                'date_added': current_time,
                'added_by': self.crawler_name
            }]
            
            return {
                'cve_id': cve_id,
                'title': name,
                'description': description,
                'references': references,
                'pocs': pocs,
                'published_date': current_time,
                'last_modified_date': current_time,
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
                cve = CVEModel(
                    cve_id=cve_data['cve_id'],
                    title=cve_data['title'],
                    description=cve_data['description'],
                    references=cve_data['references'],
                    pocs=cve_data['pocs'],
                    published_date=cve_data['published_date'],
                    last_modified_date=cve_data['last_modified_date'],
                    created_by=cve_data['created_by']
                )
            else:
                # 기존 CVE의 경우 PoC와 Reference만 업데이트
                # 기존 Reference에 없는 새로운 Reference만 추가
                existing_ref_urls = [ref.url for ref in cve.references]
                for new_ref in cve_data['references']:
                    if new_ref['url'] not in existing_ref_urls:
                        cve.references.append(new_ref)
                        
                # 기존 PoC에 없는 새로운 PoC만 추가
                existing_poc_urls = [poc.url for poc in cve.pocs]
                for new_poc in cve_data['pocs']:
                    if new_poc['url'] not in existing_poc_urls:
                        cve.pocs.append(new_poc)
                        
                # last_modified_date 업데이트
                cve.last_modified_date = cve_data['last_modified_date']
                
            await cve.save()
            return True
        except Exception as e:
            self.log_error("Error processing CVE data", e)
            return False
            
    async def crawl(self) -> bool:
        """전체 크롤링 프로세스"""
        try:
            if not await self.fetch_data():
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
            return True
        except Exception as e:
            self.log_error("Error in crawl", e)
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