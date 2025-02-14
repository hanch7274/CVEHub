import asyncio
import sys
import os
import logging
from pathlib import Path

# 상위 디렉토리를 Python 경로에 추가
project_root = str(Path(__file__).parent.parent.parent)
sys.path.append(project_root)

# .env 파일 경로 설정을 위한 환경변수 추가
os.environ["ENV_FILE"] = os.path.join(project_root, ".env")

from app.services.crawler import NucleiCrawlerService
from app.core.config import get_settings
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.cve_model import CVEModel

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_all_cves():
    """모든 CVE에 대한 크롤링 테스트"""
    try:
        # MongoDB 연결 설정
        settings = get_settings()
        client = AsyncIOMotorClient(settings.MONGODB_URL)
        
        # Beanie 초기화
        await init_beanie(
            database=client[settings.DATABASE_NAME],
            document_models=[CVEModel]
        )

        crawler = NucleiCrawlerService()
        
        # 전체 크롤링 실행
        if await crawler.crawl():
            logger.info("Successfully completed crawling all CVEs")
        else:
            logger.error("Failed to complete crawling")

    except Exception as e:
        logger.error(f"Error in test_all_cves: {str(e)}")
    finally:
        # MongoDB 연결 종료
        client.close()

async def test_single_cve(cve_id: str):
    """단일 CVE에 대한 크롤링 테스트"""
    try:
        # MongoDB 연결 설정
        settings = get_settings()
        client = AsyncIOMotorClient(settings.MONGODB_URL)
        
        # Beanie 초기화
        await init_beanie(
            database=client[settings.DATABASE_NAME],
            document_models=[CVEModel]
        )

        crawler = NucleiCrawlerService()
        
        # 저장소 클론/풀
        if not await crawler.clone_or_pull_repo():
            logger.error("Failed to clone/pull repository")
            return

        # CVE ID로 YAML 파일 찾기
        cve_file = None
        for year_dir in Path(crawler.cves_path).iterdir():
            if year_dir.is_dir() and year_dir.name.isdigit():
                potential_file = year_dir / f"{cve_id}.yaml"
                if potential_file.exists():
                    cve_file = potential_file
                    break

        if not cve_file:
            logger.error(f"YAML file for {cve_id} not found")
            return

        # YAML 파일 파싱 및 처리
        logger.info(f"Processing {cve_file}")
        cve_data = await crawler.parse_yaml_file(str(cve_file))
        
        if cve_data:
            logger.info("Parsed CVE data:")
            logger.info(f"CVE ID: {cve_data.get('cve_id')}")
            logger.info(f"Title: {cve_data.get('title')}")
            logger.info(f"Description: {cve_data.get('description')}")
            logger.info(f"References: {cve_data.get('references')}")

            # DB에 저장
            success = await crawler.process_cve_data(cve_data)
            if success:
                logger.info("Successfully saved to database")
            else:
                logger.error("Failed to save to database")
        else:
            logger.error("Failed to parse YAML file")

    except Exception as e:
        logger.error(f"Error in test_single_cve: {str(e)}")
    finally:
        # MongoDB 연결 종료
        client.close()

def main():
    """메인 함수"""
    if len(sys.argv) == 1:
        # 인자가 없으면 전체 CVE 업데이트
        print("Updating all CVEs...")
        asyncio.run(test_all_cves())
    elif len(sys.argv) == 2:
        # CVE ID가 주어진 경우 해당 CVE만 업데이트
        cve_id = sys.argv[1]
        print(f"Updating single CVE: {cve_id}")
        asyncio.run(test_single_cve(cve_id))
    else:
        print("Usage:")
        print("  python test_crawler.py           # Update all CVEs")
        print("  python test_crawler.py <CVE-ID>  # Update single CVE")
        print("Example: python test_crawler.py CVE-2023-0334")
        sys.exit(1)

if __name__ == "__main__":
    main() 