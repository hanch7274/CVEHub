import os
import yaml
import git
import logging
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from ..models.cve_model import CVEModel
from ..core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

class NucleiCrawlerService:
    def __init__(self):
        self.repo_url = "https://github.com/projectdiscovery/nuclei-templates.git"
        self.repo_path = settings.REPO_PATH
        self.cves_path = os.path.join(self.repo_path, "http/cves")

    async def clone_or_pull_repo(self):
        """저장소 클론 또는 풀"""
        try:
            if not os.path.exists(self.repo_path):
                logger.info(f"Cloning repository to {self.repo_path}")
                git.Repo.clone_from(self.repo_url, self.repo_path)
            else:
                logger.info("Pulling latest changes")
                repo = git.Repo(self.repo_path)
                origin = repo.remotes.origin
                origin.pull()
            return True
        except Exception as e:
            logger.error(f"Error in clone_or_pull_repo: {str(e)}")
            return False

    async def parse_yaml_file(self, file_path: str) -> dict:
        """YAML 파일 파싱"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
                
            if not data:
                return None

            current_time = datetime.now(ZoneInfo("Asia/Seoul"))
            relative_path = os.path.relpath(file_path, self.repo_path)
            poc_url = f"https://github.com/projectdiscovery/nuclei-templates/blob/main/{relative_path}"

            # Reference 객체 생성
            references = []
            for ref in data.get('info', {}).get('reference', []):
                # NVD 링크인 경우 type을 'NVD'로 설정
                ref_type = 'NVD' if ref.startswith('https://nvd.nist.gov') else 'OTHER'
                references.append({
                    'url': ref,
                    'source': 'nuclei-templates',
                    'type': ref_type,
                    'added_by': 'nuclei-crawler'
                })
            
            # Nuclei PoC 링크를 Reference에 추가
            references.append({
                'url': poc_url,
                'source': 'nuclei-templates',
                'type': 'Exploit',
                'description': 'Nuclei Template PoC',
                'added_by': 'nuclei-crawler'
            })

            # PoC 객체 생성
            pocs = [{
                'source': 'Nuclei-Templates',
                'url': poc_url,
                'description': 'Nuclei-PoC',
                'date_added': current_time,
                'added_by': 'nuclei-crawler'
            }]

            return {
                'cve_id': data.get('id'),
                'title': data.get('info', {}).get('name'),
                'description': data.get('info', {}).get('description'),
                'references': references,
                'pocs': pocs,
                'published_date': current_time,
                'last_modified_date': current_time,
                'created_by': 'nuclei-crawler'
            }
        except Exception as e:
            logger.error(f"Error parsing {file_path}: {str(e)}")
            return None

    async def process_cve_data(self, cve_data: dict) -> bool:
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
                
                # last_modified_date만 업데이트
                cve.last_modified_date = cve_data['last_modified_date']

            await cve.save()
            return True
        except Exception as e:
            logger.error(f"Error processing CVE data: {str(e)}")
            return False

    async def crawl(self):
        """전체 크롤링 프로세스"""
        try:
            if not await self.clone_or_pull_repo():
                return False

            success_count = 0
            error_count = 0

            # 연도별 폴더 순회
            for year_dir in Path(self.cves_path).iterdir():
                if year_dir.is_dir() and year_dir.name.isdigit():
                    # YAML 파일 순회
                    for yaml_file in year_dir.glob("*.yaml"):
                        try:
                            cve_data = await self.parse_yaml_file(str(yaml_file))
                            if cve_data and await self.process_cve_data(cve_data):
                                success_count += 1
                            else:
                                error_count += 1
                        except Exception as e:
                            logger.error(f"Error processing {yaml_file}: {str(e)}")
                            error_count += 1

            logger.info(f"Crawling completed - Success: {success_count}, Errors: {error_count}")
            return True
        except Exception as e:
            logger.error(f"Error in crawl: {str(e)}")
            return False 