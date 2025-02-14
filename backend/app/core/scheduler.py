from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from ..services.crawler import NucleiCrawlerService
import logging

logger = logging.getLogger(__name__)

def setup_scheduler():
    scheduler = AsyncIOScheduler()
    
    # 6시간마다 크롤링 실행
    scheduler.add_job(
        NucleiCrawlerService().crawl,
        trigger=IntervalTrigger(hours=6),
        id='nuclei_crawler',
        name='Nuclei Templates Crawler',
        replace_existing=True
    )
    
    return scheduler 