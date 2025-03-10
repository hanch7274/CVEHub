import asyncio

class NucleiCrawler:
    async def crawl(self) -> bool:
        """전체 크롤링 프로세스"""
        try:
            # 초기 상태 메시지 (웹소켓 연결 필수)
            await self.report_progress("준비", 0, f"{self.crawler_id} 업데이트를 시작합니다.", require_websocket=True)
            
            # 데이터 가져오기
            templates = await self.fetch_data()
            if not templates:
                await self.report_progress("오류", 0, "템플릿 목록을 가져오는데 실패했습니다.", require_websocket=True)
                return False
                
            # 데이터 파싱
            cve_data = await self.parse_data(templates)
            if not cve_data or not cve_data.get('items'):
                await self.report_progress("오류", 0, "템플릿 파싱에 실패했거나 추출된 CVE가 없습니다.", require_websocket=True)
                return False
            await self.report_progress("데이터 처리", 70, f"{len(cve_data['items'])}개의 CVE 정보 파싱이 완료되었습니다.", require_websocket=True)
            # 메시지 전송 보장을 위한 지연
            await asyncio.sleep(0.5)
            
            # 데이터베이스 업데이트 단계
            await self.report_progress("데이터베이스 업데이트", 75, "데이터베이스에 CVE 정보를 업데이트하는 중입니다...", require_websocket=True)
            process_result = await self.process_data(cve_data)
            if not process_result:
                await self.report_progress("오류", 0, "데이터베이스에 CVE 정보를 업데이트하는데 실패했습니다.", require_websocket=True)
                return False
            await self.report_progress("성공", 100, "데이터베이스에 CVE 정보를 성공적으로 업데이트했습니다.", require_websocket=True)
            return True
        except Exception as e:
            await self.report_progress("오류", 0, f"크롤링 프로세스 중 오류가 발생했습니다: {e}", require_websocket=True)
            return False 