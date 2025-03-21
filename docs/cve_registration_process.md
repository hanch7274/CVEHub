# CVE 등록 프로세스 문서

## 개요

이 문서는 CVEHub 시스템에서 CVE(Common Vulnerabilities and Exposures) 데이터 등록 과정을 설명합니다. CVE 데이터는 두 가지 방식으로 시스템에 등록될 수 있습니다:

1. **수동 등록**: 사용자가 UI를 통해 직접 CVE 정보를 입력하여 등록
2. **자동 크롤링**: 외부 소스에서 크롤러가 자동으로 CVE 정보를 수집하여 등록

이 문서는 최근 리팩토링된 구조를 바탕으로 각 등록 과정의 흐름과 관련 컴포넌트를 설명합니다.

## 공통 아키텍처 개선사항

최근 개선된 아키텍처의 핵심은 CVE 데이터 처리의 중앙화 및 표준화입니다:

- **CVEService**: CVE 데이터 처리를 담당하는 중앙 서비스
- **BaseCrawlerService**: 모든 크롤러의 공통 기능을 제공하는 기본 클래스
- **표준화된 시간 처리**: `get_utc_now()` 함수를 통한 일관된 UTC 시간 처리

## 1. 수동 CVE 등록 프로세스

### 프로세스 흐름

1. 사용자가 웹 UI에서 CVE 정보 입력 (제목, 설명, 심각도 등)
2. 프론트엔드에서 API 엔드포인트로 데이터 전송
3. API 라우터에서 요청 유효성 검증
4. CVEService를 통해 데이터베이스에 CVE 정보 저장
5. 등록 결과를 사용자에게 반환

### 관련 컴포넌트

- **프론트엔드**: React 컴포넌트를 통한 사용자 인터페이스 제공
- **API 라우터**: `cve_router.py`의 `create_cve` 엔드포인트
- **서비스 레이어**: `CVEService.create_cve` 메서드
- **모델**: `CVEModel`, `CreateCVERequest` Pydantic 모델

### 코드 흐름

```
사용자 입력 → API 엔드포인트(/api/cves) 
→ Router.create_cve() → CVEService.create_cve() 
→ CVE 유효성 검증 → 데이터베이스 저장 → 결과 반환
```

## 2. 자동 크롤링을 통한 CVE 등록 프로세스

### 프로세스 흐름

1. 스케줄러 또는 사용자 요청으로 크롤러 실행
2. 크롤러가 외부 소스에서 CVE 데이터 수집
3. 수집된 데이터를 파싱하고 전처리
4. BaseCrawlerService의 update_cve 메서드를 통해 데이터 저장
5. CVEService를 활용하여 기존 CVE 업데이트 또는 새 CVE 생성
6. 처리 결과 로깅 및 사용자에게 알림

### 관련 컴포넌트

- **BaseCrawlerService**: 모든 크롤러의 기본 기능 제공
- **개별 크롤러**: `NucleiCrawlerService`, `EmergingThreatsCrawlerService` 등
- **CVEService**: CVE 데이터 관리
- **유틸리티**: `cve_utils.py`의 helper 함수들
- **모델**: `CVEModel`, `PatchCVERequest` 등
- **UI 컴포넌트**: `CrawlerUpdateButton` 컴포넌트를 통한 크롤러 진행 상황 실시간 표시

### 핵심 개선사항

#### 리팩토링 전
- 각 크롤러마다 CVE 생성/업데이트 로직 중복
- 시간 처리 방식 불일치
- 코드 중복으로 인한 유지보수 어려움
- 크롤러 상태 표시 로직 불일치 및 하드코딩된 값 사용

#### 리팩토링 후
- `BaseCrawlerService.update_cve` 메서드로 중앙화
- `CVEService`를 통한 일관된 데이터 처리
- `get_utc_now()` 함수로 표준화된 시간 처리
- 크롤러별 특화 로직과 공통 로직 분리

### 크롤러 코드 흐름

```
크롤러 실행 → fetch_data() → parse_data() 
→ BaseCrawlerService.update_cve() → CVEService.create_cve() 또는 CVEService.update_cve() 
→ 데이터베이스 저장 → 결과 보고 → 웹소켓 메시지 전송 → 프론트엔드 실시간 업데이트
```

## 3. WebSocket 연결 및 통신 프로세스

### 개요

CVEHub 시스템은 Socket.IO를 사용하여 실시간 업데이트와 알림을 지원합니다. 특히 CVE 데이터 변경 및 크롤러 진행 상황을 실시간으로 클라이언트에 전달하는 데 사용됩니다.

### 연결 프로세스

1. 클라이언트(프론트엔드)가 Socket.IO 클라이언트를 통해 서버에 연결 요청
2. 토큰 기반 인증을 통한 사용자 확인
3. 연결 수립 후 이벤트 구독 및 통신 시작

### 주요 이벤트 유형

- **CVE_UPDATED**: CVE 데이터가 업데이트되었을 때 발생
- **CVE_CREATED**: 새로운 CVE가 생성되었을 때 발생
- **CRAWLER_UPDATE_PROGRESS**: 크롤러 진행 상황 업데이트 시 발생
- **NOTIFICATION**: 일반 알림 메시지 전송 시 발생

### 관련 컴포넌트

- **SocketIOManager**: WebSocket 연결 및 이벤트 관리
- **socketio_routes.py**: Socket.IO 라우트 및 이벤트 핸들러
- **BaseCrawlerService.report_progress**: 크롤러 진행 상황 보고
- **CVEService**: CVE 업데이트 후 이벤트 발행
- **CrawlerUpdateButton**: 크롤러 진행 상황을 UI에 실시간으로 표시하는 핵심 컴포넌트

### 구독 모델

1. 클라이언트가 특정 CVE ID에 구독 요청
2. 서버가 해당 사용자를 구독자 목록에 추가
3. CVE 데이터 변경 시 구독 중인 모든 클라이언트에 통지

### WebSocket 코드 흐름

```
클라이언트 연결 → 인증 → CVE 구독 요청 → 구독 정보 저장
→ CVE 데이터 변경 → broadcast_cve_update() → 클라이언트에 알림
→ 클라이언트 UI 업데이트
```

### 크롤러 상태 업데이트 개선 사항 (2025년 3월)

1. **상태 정의 표준화**: 
   - `CRAWLER_STAGES` 상수를 도입하여 모든 크롤러 상태를 중앙에서 관리
   - 각 상태에 대한 라벨, 아이콘, 색상 등 UI 표현 요소 통합

2. **웹소켓 데이터 처리 강화**: 
   - `processWebSocketData` 함수를 통한 데이터 처리 로직 중앙화
   - 중첩된 데이터 구조를 자동으로 감지하고 정규화하는 로직 추가

3. **상태 매칭 시스템 개선**: 
   - 백엔드에서 전달되는 다양한 형태의 상태값을 프론트엔드 상태로 정확히 매핑
   - 정확한 일치 및 부분 일치를 모두 지원하여 유연성 확보
   ```javascript
   const completedValues = CRAWLER_STAGES.find(stage => stage.key === 'completed')?.backendValues || [];
   const isCompleted = stageValue ? 
     completedValues.includes(stageValue) || 
     completedValues.some(value => stageValue.includes(value)) : 
     false;
   ```

4. **오류 상태 처리 개선**: 
   - 오류 상태 감지 및 처리 로직 표준화
   - 사용자에게 명확한 오류 피드백 제공

5. **데이터 일관성 보장**: 
   - 폴링과 웹소켓 메커니즘을 결합하여 데이터 수신 신뢰성 확보
   - 네트워크 불안정 상황에서도 안정적인 상태 업데이트 제공

이러한 개선을 통해 크롤러 진행 상황이 더 안정적이고 일관되게 사용자 인터페이스에 반영됩니다.

## 4. 주요 컴포넌트 상세 설명

### BaseCrawlerService

크롤러의 기본 클래스로, 모든 크롤러가 상속받아 사용합니다.

**주요 기능**:
- `update_cve`: CVE 생성/업데이트 표준 메서드
- 웹소켓을 통한 진행 상황 보고
- 로깅 및 오류 처리

### CVEService

CVE 데이터 관리를 담당하는 중앙 서비스입니다.

**주요 기능**:
- `create_cve`: 새 CVE 생성
- `update_cve`: 기존 CVE 업데이트
- `get_cve`: ID로 CVE 검색

### SocketIOManager

WebSocket 연결 및 실시간 통신을 관리하는 서비스입니다.

**주요 기능**:
- 사용자 연결 관리
- CVE 구독 및 알림 전송
- 크롤러 진행 상황 브로드캐스트

### 유틸리티 함수들

CVE 데이터 처리를 위한 유틸리티 함수들입니다.

**주요 함수**:
- `create_reference`: 참조 URL 생성
- `create_basic_cve_data`: 기본 CVE 데이터 구조 생성
- `get_utc_now`: 일관된 UTC 시간 생성

## 5. 결론 및 이점

개선된 아키텍처는 다음과 같은 이점을 제공합니다:

1. **코드 중복 감소**: 공통 로직 중앙화로 코드 중복 최소화
2. **유지보수성 향상**: 변경 필요 시 한 곳만 수정하면 됨
3. **일관성 보장**: 동일한 메서드와 시간 처리 방식 사용
4. **확장성 개선**: 새로운 크롤러 추가가 용이
5. **실시간 업데이트**: WebSocket을 통한 효율적인 실시간 데이터 전달
6. **버그 감소**: 표준화된 접근 방식으로 오류 가능성 감소

이러한 개선은 시스템의 안정성을 높이고, 개발자의 생산성을 향상시키며, 향후 기능 확장에 유연하게 대응할 수 있는 기반을 마련합니다.
