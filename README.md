# CVEHub 프로젝트 기술 문서

## 1. 개요 (Overview)

**프로젝트명:** CVEHub

**목적:** CVE(Common Vulnerabilities and Exposures) 정보를 효율적으로 관리, 추적, 공유하고 관련 데이터를 자동 수집하는 통합 웹 플랫폼입니다. 사용자는 CVE 검색, 상세 정보 확인, 신규 등록, 상태/심각도 업데이트, 댓글/PoC/Snort Rule/참조 정보 추가, 활동 이력 추적 등의 기능을 수행할 수 있습니다. 실시간 업데이트와 협업 기능을 통해 보안 취약점 관리를 지원합니다.

**주요 기능:**

*   **CVE 관리:** 목록 조회, 상세 보기, 생성, 수정(필드 단위 업데이트 포함), 삭제
*   **데이터 수집:** 자동화된 크롤러(Nuclei, Metasploit, EmergingThreats)를 통한 관련 정보(PoC, Snort Rules) 수집 및 업데이트
*   **협업 및 정보 공유:** CVE별 댓글 기능 (멘션 포함), 참조 링크, PoC 정보 공유
*   **실시간 동기화:** WebSocket(Socket.IO)을 통한 데이터 변경 사항 실시간 전파 (CVE 업데이트, 댓글, 알림 등)
*   **사용자 관리 및 인증:** JWT 기반 사용자 인증, 역할 기반 접근 제어(관리자 기능), 사용자 정보 관리
*   **활동 이력:** 사용자 및 시스템 활동 로그 추적 및 조회
*   **알림:** 사용자 멘션, CVE 업데이트 등 주요 이벤트에 대한 실시간 알림
*   **캐시 관리:** Redis 캐시 및 React Query 캐시 상태 시각화 및 관리 기능 (관리자용)

**기술 스택:**

*   **프론트엔드:** React.js (v18+), Material UI (MUI), React Query (@tanstack/react-query), Zustand, React Router, Axios, Socket.IO Client, TypeScript, date-fns, Notistack, Helmet-async
*   **백엔드:** Python (v3.9+), FastAPI, Beanie (MongoDB ODM), Motor (Async MongoDB Driver), Pydantic, python-socketio, APScheduler, Passlib (비밀번호 해싱), python-jose (JWT), Redis (aioredis/redis.asyncio), GitPython, PyYAML, Aiohttp
*   **데이터베이스:** MongoDB
*   **캐싱:** Redis
*   **번들링:** Webpack
*   **기타:** `humps` (케이스 변환), `lodash`

## 2. 시스템 아키텍처 (System Architecture)

CVEHub는 모놀리식 백엔드와 싱글 페이지 애플리케이션(SPA) 프론트엔드로 구성된 웹 서비스입니다.

```mermaid
graph LR
    subgraph "사용자 브라우저"
        A[프론트엔드 (React)]
    end

    subgraph "서버 인프라"
        B[웹 서버 (FastAPI)]
        C[데이터베이스 (MongoDB)]
        D[캐시 (Redis)]
        E[WebSocket 서버 (Socket.IO)]
        F[스케줄러 (APScheduler)]
        G[크롤러 프로세스]
    end

    A -- HTTP API 요청 --> B
    B -- 데이터 조회/수정 --> C
    B -- 캐시 조회/저장 --> D
    A -- WebSocket 연결 --> E
    E -- 실시간 이벤트 --> A
    B -- WebSocket 이벤트 발행 --> E
    F -- 크롤링 작업 예약/실행 --> G
    G -- 데이터 저장 --> B
    B -- 크롤러 상태 업데이트 --> E
```

*   **사용자 인터페이스 (프론트엔드):** React 기반 SPA로 사용자 상호작용 처리 및 데이터 시각화.
*   **API 서버 (백엔드):** FastAPI 기반 RESTful API 제공. 인증, CRUD 작업, 비즈니스 로직 처리.
*   **데이터 저장소 (MongoDB):** Beanie ODM을 통해 상호작용하며 애플리케이션 데이터 영구 저장.
*   **캐싱 (Redis):** API 응답 및 자주 사용되는 데이터 캐싱으로 성능 향상.
*   **실시간 통신 (WebSocket):** Socket.IO를 통해 클라이언트-서버 간 양방향 실시간 통신. 데이터 변경 알림, 구독 관리 등에 사용.
*   **백그라운드 작업 (APScheduler/Crawler):** 정기적으로 외부 소스(Nuclei, Metasploit 등)에서 데이터를 크롤링하여 DB 업데이트.

## 2.1. 스키마 중앙화 시스템 (Schema Centralization)

CVEHub는 백엔드와 프론트엔드 간의 데이터 구조 일관성을 유지하기 위해 스키마 중앙화 시스템을 구현했습니다. 이는 모델 변경 시 여러 파일을 수동으로 수정해야 하는 번거로움을 줄이고, 타입 안전성을 향상시키며, 개발 생산성을 높이는 데 기여합니다.

```mermaid
graph TD
    A[중앙 스키마 정의<br/>app/schemas/*.py] --> B[Pydantic 모델]
    B --> C[Beanie 문서 모델<br/>자동 생성]
    B --> D[OpenAPI 스키마]
    D --> E[TypeScript 인터페이스<br/>자동 생성]
    C --> F[MongoDB]
    E --> G[프론트엔드 타입<br/>interfaces.ts]
```

### 2.1.1. 주요 구성 요소

*   **중앙 스키마 파일:** `app/schemas/` 디렉토리에 정의된 Pydantic 모델들이 시스템의 중심이 됩니다. 이 모델들은 애플리케이션 전체에서 사용되는 데이터 구조를 정의합니다.

*   **자동 변환 도구:**
    *   **백엔드:** `app/tools/` 디렉토리에 있는 도구들이 Pydantic 모델을 Beanie 문서 모델로 자동 변환합니다.
    *   **프론트엔드:** `app/tools/typescript_generator.py`가 Pydantic 모델에서 TypeScript 인터페이스를 자동으로 생성합니다.

*   **생성된 모델 및 인터페이스:**
    *   **백엔드:** `app/cve/generated_models.py`에 Beanie ODM 모델이 자동 생성됩니다.
    *   **프론트엔드:** `frontend/src/features/cve/types/generated/cve.ts`에 TypeScript 인터페이스가 자동 생성됩니다.

### 2.1.2. 변환 과정

1. **Pydantic → Beanie:**
   * Pydantic 모델을 기반으로 MongoDB에서 사용할 Beanie 문서 모델을 자동 생성합니다.
   * 변환 시 필드 타입, 설명, 기본값 등의 메타데이터를 보존합니다.
   * `BaseDocument` 확장을 통해 MongoDB 문서 모델로 작동하도록 합니다.

2. **Pydantic → TypeScript:**
   * Jinja2 템플릿(`app/tools/templates/ts_interfaces.ts.jinja2`)을 사용하여 TypeScript 인터페이스를 생성합니다.
   * Python 타입을 TypeScript 타입으로 변환하는 필터를 적용합니다.
   * 생성된 인터페이스는 `Generated` 접두사를 가지며, 기존 코드와의 호환성을 유지합니다.

### 2.1.3. 사용 방법

*   **스키마 변경 시 업데이트:**
    ```bash
    python -m app.tools.generate_all
    ```
    이 명령어는 백엔드 모델과 프론트엔드 인터페이스를 모두 최신 스키마 정의에 맞게 업데이트합니다.

*   **프론트엔드 사용 패턴:**
    * 생성된 인터페이스(`GeneratedReference` 등)를 기존 인터페이스에서 확장하여 사용합니다.
    * 필요한 경우 `Omit<>` 유틸리티 타입을 통해 필드를 커스터마이징할 수 있습니다.
    ```typescript
    export interface Reference extends GeneratedReference {
      // 추가 필드 또는 오버라이드
      [key: string]: unknown; // 호환성을 위한 인덱스 시그니처
    }
    ```

*   **백엔드 사용 패턴:**
    * 생성된 모델(`CVEModel` 등)을 직접 가져와 사용합니다.
    * 스키마와 분리된 비즈니스 로직을 추가할 경우, 새로운 파일에 래퍼 클래스를 만들어 확장합니다.

### 2.1.4. 이점

*   **일관성:** 백엔드와 프론트엔드 간의 데이터 구조 일관성 보장
*   **생산성:** 모델 변경 시 타입을 수동으로 업데이트할 필요 없음
*   **타입 안전성:** TypeScript의 타입 체크를 통한 런타임 오류 감소
*   **유지보수성:** 스키마 정의가 중앙화되어 변경사항 추적 용이

## 3. 프론트엔드 상세 분석 (Frontend Details)

### 3.1. 구조 (`src/`)

*   **`App.jsx`:** 최상위 컴포넌트. 라우팅, 전역 컨텍스트 설정, Socket.IO 연결 관리, 전역 에러 핸들링 초기화.
*   **`core/socket/`:** Socket.IO 클라이언트 로직 집중.
    *   `services/socketService.ts`: 소켓 연결 관리, 이벤트 송수신 관리 싱글톤 서비스.
    *   `services/socketEventManager.ts`: 이벤트 등록, 발행, 케이스 변환 처리 담당.
    *   `services/socketMetrics.ts`: 연결 품질 및 메트릭 모니터링 담당.
    *   `hooks/useSocket.ts`: 컴포넌트에서 소켓 기능을 쉽게 사용할 수 있는 훅. 상태 관리, 이벤트 관리, 구독 처리 등.
    *   `state/socketStore.ts`: 소켓 상태 전역 관리 (Zustand)
    *   `bridge/WebSocketQueryBridge.tsx`: Socket.IO 이벤트를 React Query 캐시 업데이트로 연결.
*   **`features/`:** 주요 기능별 모듈화 (`auth/`, `cve/`, `notification/` 등).
*   **`shared/`:** 모듈 간 공유되는 코드 (API 설정, 공통 타입, 유틸리티, 공유 컨텍스트).
*   **`layout/`:** Header, Sidebar 등 레이아웃 컴포넌트.

### 3.2. 주요 컴포넌트 및 로직

*   **`App.jsx`:**
    *   **라우팅:** `/`, `/login`, `/signup`, `/cves`, `/cves/:cveId`, `/create-cve`, `/cache`, `/activities` 경로 정의. `PrivateRoute`, `AuthRoute`로 접근 제어.
    *   **소켓 관리:** `useEffect`를 활용하여 인증 상태, 페이지 경로, 네트워크 상태, 브라우저 가시성에 따라 `socketService`의 `connect`/`disconnect`/`handleAuthStateChange` 호출하며 **동적으로 소켓 연결 관리**.
    *   **전역 설정:** `QueryClientProvider`, `AuthProvider`, `ErrorProvider` 등 설정.
    *   **Lazy Loading:** `CVEDetail`, `CacheVisualization`, `ActivitiesPage` 지연 로딩.
*   **`CVEList.jsx`:**
    *   `useCVEList`, `useTotalCVECount`, `useCVEStats` 훅으로 데이터 조회.
    *   필터링(검색, 상태, 심각도), 정렬, 페이지네이션 기능 구현. `useState`로 필터 상태 관리.
    *   `useCVEListUpdates` 훅으로 실시간 목록 업데이트 구독.
    *   테이블(`CVETable`), 통계 섹션(`StatisticsSection`), 필터 바(`FilterBar`), 스켈레톤 UI(`CVETableSkeleton`), 에러/빈 상태 표시 컴포넌트 포함.
    *   CVE 항목 클릭 시 `CVEDetail` 모달 표시.
    *   CVE 생성(`CreateCVE`) 및 삭제 기능 연동.
*   **`CVEDetail.tsx`:**
    *   모달 형태 UI (`Dialog`).
    *   `useCVEDetail`, `useCVESubscription`, `useCVERefresh`, `useUpdateCVEField` 훅 사용.
    *   **실시간 구독:** 모달 열릴 때 `subscribe()`, 닫힐 때 `unsubscribe()` 호출하여 해당 CVE 정보 실시간 구독/해제 (`useCVESubscription`). 구독자 정보 표시 (`SubscriberCount`).
    *   **실시간 업데이트 처리:** `useSocket`의 `on('cve_updated')` 핸들러(`handleWebSocketUpdate`)에서 수신 데이터를 React Query 캐시에 직접 반영(`queryClient.setQueryData`)하거나 무효화(`invalidateQueries`). `lastProcessedUpdateIdRef`로 중복 업데이트 방지.
    *   **정보 표시 및 편집:** 헤더(`CVEDetailHeader`), 기본 정보 패널(`CVEDetailInfoPanel` - InlineEditText 사용), 탭(`CVEDetailTabs`)으로 구성.
    *   **탭 관리:** `CVEDetailTabs`에서 각 탭(PoC, Snort, References, Comments, History) 컴포넌트 렌더링. `GenericDataTab`을 재사용하여 PoC, Snort, References 구현. 탭별 데이터 개수(`tabCounts`) 관리 및 표시.
*   **`GenericDataTab.tsx`:**
    *   PoC, Snort Rules, References 탭의 공통 로직 구현 (목록 표시, 추가/수정/삭제 다이얼로그).
    *   `tabConfig` prop을 통해 각 탭의 특성(아이콘, 필드명, 유효성 검사 등) 주입받음.
    *   `useUpdateCVEField` 훅을 사용하여 데이터 변경 사항 백엔드에 저장.
*   **`CommentsTab.tsx`:**
    *   댓글 목록 표시 (계층 구조), 새 댓글/답글 작성, 수정, 삭제 기능.
    *   `useCommentMutations` 훅 사용.
    *   `MentionInput` 컴포넌트로 사용자 멘션 기능 구현 (`useSearchUsers` 훅으로 사용자 목록 조회).
    *   **실시간 댓글 업데이트:** `useSocket`의 `on` 메서드로 `COMMENT_ADDED`, `COMMENT_UPDATED`, `COMMENT_DELETED` 이벤트 구독 및 캐시 업데이트.

### 3.3. 소켓 서비스 아키텍처 (`core/socket/`)

*   **구조:** 다중 레이어 디자인으로 역할 분리
    *   **`SocketService`**: 소켓 연결/해제, 기본 인터페이스 제공, 상태 관리
    *   **`SocketEventManager`**: 이벤트 처리 로직, 케이스 변환, 구독 관리
    *   **`SocketMetrics`**: 연결 품질 모니터링, 핑/퐁 메트릭, 지연 시간 측정

*   **주요 기능:**
    *   **연결 관리:** 자동 재연결, 인증 토큰 갱신, 네트워크 상태 감지
    *   **이벤트 시스템:** RxJS Observable 기반 반응형 이벤트 스트림
    *   **케이스 변환:** 서버(snake_case)와 클라이언트(camelCase) 간 자동 변환
    *   **구독 관리:** `updateSubscription` 메서드로 CVE 구독/해제 통합 관리
    *   **React Query 연동:** 웹소켓 이벤트 기반 쿼리 캐시 자동 무효화

*   **클라이언트 사용 패턴:**
    ```typescript
    // 기본 사용법
    import { useSocket } from 'core/socket/hooks/useSocket';
    
    const { 
      subscribe, unsubscribe, emit, on, 
      connectionState, subscribeCVE, unsubscribeCVE 
    } = useSocket('event_name', callbackFn, [deps], options);
    
    // CVE 구독 예제
    subscribeCVE('CVE-2023-12345'); // socketService.updateSubscription 호출
    ```

*   **최적화 기법:**
    *   **참조 안정성:** useRef로 이벤트 핸들러 관리
    *   **중복 이벤트 방지:** 핸들러 맵으로 동일 이벤트 및 콜백 중복 등록 방지
    *   **제어된 재구독:** useEffect 의존성 최소화
    *   **리액트 훅 룰 준수:** 불필요한 의존성 방지

## 4. 백엔드 상세 분석 (Backend Details)

### 4.1. 구조 (`app/`)

*   **`main.py`:** FastAPI 앱 인스턴스 생성, 미들웨어(CORS, 로깅), 전역 예외 핸들러, API 라우터 등록, DB 및 Socket.IO 초기화 (`startup_event`).
*   **`api.py`:** 각 기능별 라우터(`auth`, `cve`, `comment` 등)를 통합하여 `/api/v1` (예상) 경로 아래에 마운트.
*   **`core/`:** 핵심 모듈.
    *   `config.py`: `Settings` 클래스 (환경 변수 로드).
    *   `dependencies.py`: 서비스, 리포지토리 등 의존성 주입 함수 (`Depends`, `lru_cache`).
    *   `cache.py`: Redis 캐싱 유틸리티.
    *   `scheduler.py`: `APScheduler` 기반 크롤러 스케줄링.
    *   `exceptions.py`, `error_handlers.py`: 커스텀 예외 및 처리 로직.
    *   `security.py`: 비밀번호 해싱.
*   **`common/`:** 공통 모듈.
    *   `models/base_models.py`: Pydantic `BaseSchema`, Beanie `BaseDocument` 등 기본 모델.
    *   `repositories/base.py`: `BaseRepository` (기본 CRUD).
    *   `utils/`: 날짜, 변경 감지 등 공통 유틸리티.
*   **`features/` (추정, 현재 구조는 `app/` 하위에 직접 배치):** 각 기능별 모듈 (모델, 리포지토리, 서비스, 라우터).

### 4.2. 주요 모듈 및 로직

*   **인증 (`auth/`):**
    *   **핵심:** `UserService` (`service.py`). 사용자 생성/조회/수정/삭제, 비밀번호 검증/해싱, JWT 액세스/리프레시 토큰 생성/검증/무효화 로직.
    *   **DB:** `User`, `RefreshToken` 모델 (`models.py`).
    *   **API:** `/token`(로그인), `/refresh`, `/logout`, `/signup`, `/me`, `/search`, `/` (사용자 목록) 엔드포인트 제공 (`router.py`). `oauth2_scheme` 및 `get_current_user` 의존성으로 토큰 기반 인증 수행.
*   **CVE 관리 (`cve/`):**
    *   **핵심:** `CVEService` (`service.py`). CVE CRUD 로직, 캐싱 처리 호출, **활동 로그 기록** (`ActivityService`, `track_cve_activity` 데코레이터 사용), 댓글/알림 서비스 연동.
    *   **DB:** `CVEModel` (댓글 등 임베디드), `Reference`, `PoC`, `SnortRule`, `ModificationHistory` 등 (`models.py`).
    *   **리포지토리:** `CVERepository` (`repository.py`). MongoDB 작업 캡슐화.
    *   **API:** `/cves/list`, `/cves/total-count`, `/cves/stats`, `/cves/{cve_id}` (GET, PATCH, DELETE) 엔드포인트 제공 (`router.py`).
*   **댓글 (`comment/`):**
    *   **핵심:** `CommentService` (`service.py`). 댓글 생성/수정/삭제 로직. **멘션 처리** (`process_mentions`) 및 알림 생성 로직 포함. 활동 로그 기록.
    *   **DB:** `Comment` 모델 (실제 저장은 CVE 문서 내).
    *   **리포지토리:** `CommentRepository` (`repository.py`). CVE 문서 내 `comments` 배열 조작.
    *   **API:** `/cves/{cve_id}/comments` (POST, GET), `/cves/{cve_id}/comments/{comment_id}` (PUT, DELETE), `/cves/{cve_id}/comments/count` 엔드포인트 제공 (`router.py`).
*   **Socket.IO (`socketio/`):**
    *   **핵심:** `SocketManager` (`manager.py`). Socket.IO 서버 설정, 이벤트 핸들러 등록 (`connect`, `disconnect`, `subscribe_cve`, `unsubscribe_cve`), 메시지 발송 유틸리티. `UserService`를 이용한 연결 시 **토큰 인증**.
    *   **상태 관리:** `SocketRepository` (`repository.py`). **메모리 기반**으로 실시간 연결(SID), 사용자, 세션, CVE 구독 정보 관리.
    *   **비즈니스 로직:** `SocketService` (`service.py`). 구독/해제 로직, 알림 생성/전송 연동.
    *   **API:** HTTP 엔드포인트 제공 (`router.py`) - 구독 정리, 상태 조회.
    *   **이벤트:** `WSMessageType` Enum (`models.py`)으로 이벤트 이름 표준화. 주요 이벤트: `CONNECT_ACK`, `NOTIFICATION`, `CVE_UPDATED`, `COMMENT_ADDED`, `SUBSCRIPTION_STATUS`, `CVE_SUBSCRIBERS_UPDATED`, `CACHE_INVALIDATED` 등.
*   **크롤러 (`crawler/`, `core/scheduler.py`):**
    *   **구조:** `BaseCrawlerService` -> 개별 크롤러 (`nuclei_crawler`, `metasploit_crawler`, `emerging_threats_crawler`) -> `CrawlerManager` -> `CrawlerService` -> `CrawlerScheduler`.
    *   **로직:** 각 크롤러는 `fetch_data`, `parse_data`, `process_data` 구현. `CVEService`를 통해 DB 업데이트. `report_progress`로 진행 상황 보고 (WebSocket).
    *   **스케줄링:** `APScheduler`가 `CrawlerScheduler`를 통해 정기적으로 크롤러 실행 (`_run_crawler_task`). `SystemConfig` DB 모델로 마지막 실행 시간 관리.
    *   **API:** 수동 실행, 상태 조회 등 (`router.py`).
*   **활동 이력 (`activity/`):**
    *   **핵심:** `ActivityService` (`service.py`). 활동 기록 생성(`create_activity`). 객체 변경 감지 유틸리티(`detect_object_changes`) 사용하여 자동 로그 생성(`track_object_changes`).
    *   **DB:** `UserActivity` 모델 (`models.py`).
    *   **리포지토리:** `ActivityRepository` (`repository.py`).
    *   **API:** 활동 목록 조회 (내 활동, 사용자별, 대상별, 전체) (`router.py`).

### 4.3. 데이터베이스 및 캐싱

*   **MongoDB:** Beanie ODM을 통해 비동기적으로 상호작용. CVE 문서에 관련 정보 임베딩. 인덱스를 활용한 조회 성능 최적화.
*   **Redis:** `core/cache.py`를 통해 캐싱 기능 제공. 주로 CVE 상세 정보 및 목록 캐싱에 사용. 캐시 키 프리픽스 및 TTL 관리. `invalidate_cve_caches` 함수로 업데이트 시 캐시 무효화 및 WebSocket 알림.

## 5. API 및 WebSocket 명세 (요약)

### 5.1. 주요 REST API 엔드포인트

| 경로                     | 메소드 | 설명                     | 인증     | 주요 요청/응답 모델                 |
| :----------------------- | :----- | :----------------------- | :------- | :-------------------------------- |
| `/auth/token`            | POST   | 로그인 (토큰 발급)       | 없음     | OAuth2PasswordRequestForm / Token |
| `/auth/refresh`          | POST   | 토큰 갱신                | 없음     | RefreshTokenRequest / Token       |
| `/auth/logout`           | POST   | 로그아웃 (토큰 무효화)   | 없음     | LogoutRequest / {message}         |
| `/auth/signup`           | POST   | 회원가입                 | 없음     | UserCreate / Token                |
| `/auth/me`               | GET    | 내 정보 조회             | 필요     | - / UserResponse                  |
| `/auth/me`               | PATCH  | 내 정보 수정             | 필요     | UserUpdate / UserResponse         |
| `/auth/me`               | DELETE | 내 계정 삭제             | 필요     | - / {message}                     |
| `/auth/search`           | GET    | 사용자 검색 (멘션용)     | 필요     | ?query= / List[dict]              |
| `/cves/list`             | GET    | CVE 목록 조회            | 필요     | ?page=&limit=&... / CVEListResponse |
| `/cves/total-count`      | GET    | 전체 CVE 개수 조회       | 필요     | - / {count}                       |
| `/cves/stats`            | GET    | CVE 통계 조회            | 필요     | - / Dict[str, int]                |
| `/cves/{cve_id}`         | GET    | CVE 상세 조회            | 필요     | - / CVEDetailResponse             |
| `/cves`                  | POST   | CVE 생성                 | 필요     | CreateCVERequest / CVEDetailResponse |
| `/cves/{cve_id}`         | PATCH  | CVE 수정                 | 필요     | PatchCVERequest / CVEDetailResponse |
| `/cves/{cve_id}`         | DELETE | CVE 삭제 (관리자)        | 관리자   | - / CVEOperationResponse          |
| `/cves/{cve_id}/comments` | POST   | 댓글 생성                | 필요     | CommentCreate / CommentResponse   |
| `/cves/{cve_id}/comments` | GET    | 댓글 목록 조회           | 필요     | - / List[CommentResponse]         |
| `/cves/{cve_id}/comments/{comment_id}` | PUT    | 댓글 수정                | 필요     | CommentUpdate / CommentResponse   |
| `/cves/{cve_id}/comments/{comment_id}` | DELETE | 댓글 삭제                | 필요     | ?permanent= / {message}           |
| `/notifications`         | GET    | 알림 목록 조회           | 필요     | ?skip=&limit=&... / PaginatedResponse[Notification] |
| `/notifications/unread/count` | GET | 읽지 않은 알림 수 조회 | 필요     | - / {count}                       |
| `/notifications/{id}/read` | PATCH | 알림 읽음 처리          | 필요     | - / Notification                  |
| `/notifications/mark-all-read` | PATCH | 모든 알림 읽음 처리    | 필요     | - / {count}                       |
| `/crawler/run/{type}`    | POST   | 크롤러 실행 (관리자)     | 관리자   | - / CrawlerResponse               |
| `/crawler/status`        | GET    | 크롤러 상태 조회         | 필요     | - / CrawlerStatusResponse         |
| `/cache/info`            | GET    | Redis 정보 조회          | 관리자   | - / Dict                          |
| `/cache/stats`           | GET    | Redis 통계 조회          | 관리자   | - / Dict                          |
| `/cache/keys`            | GET    | Redis 키 목록 조회       | 관리자   | ?prefix=&pattern= / {keys}        |
| `/cache/values`          | GET    | Redis 값 조회            | 관리자   | ?prefix=&pattern= / {values}      |
| `/cache/clear`           | DELETE | Redis 캐시 삭제          | 관리자   | ?prefix=&pattern= / {deleted}     |
| `/activities`            | GET    | 활동 목록 조회 (필터링)  | 필요     | ?username=&... / ActivityListResponse |
| `/activities/me`         | GET    | 내 활동 목록 조회        | 필요     | ?page=&limit= / ActivityListResponse |
| `/activities/users/{username}` | GET | 특정 사용자 활동 조회   | 필요     | ?page=&limit= / ActivityListResponse |
| `/activities/targets/{type}/{id}` | GET | 특정 대상 활동 조회    | 필요     | ?page=&limit= / ActivityListResponse |

### 5.2. 주요 WebSocket 이벤트 (Server -> Client)

*   **`CONNECT_ACK`:** 인증 성공 및 세션 정보 전달
*   **`CONNECTED`:** 인증 미포함 연결 성공 알림 (일반적으론 사용되지 않음)
*   **`NOTIFICATION`:** 새 알림 발생 알림 (알림 내용, 읽지 않은 수 포함)
*   **`CVE_CREATED`, `CVE_UPDATED`, `CVE_DELETED`:** CVE 변경 알림 (업데이트된 CVE 데이터 또는 ID 포함)
*   **`COMMENT_ADDED`, `COMMENT_UPDATED`, `COMMENT_DELETED`:** 댓글 변경 알림 (업데이트된 댓글 데이터 또는 ID, 관련 CVE 데이터 포함)
*   **`COMMENT_COUNT_UPDATE`:** 특정 CVE의 댓글 수 업데이트 알림
*   **`SUBSCRIPTION_STATUS`:** CVE 구독/해제 결과 알림 (성공 여부, 구독자 수 등 포함)
*   **`CVE_SUBSCRIBERS_UPDATED`:** 특정 CVE의 구독자 목록 변경 알림 (구독자 목록 포함)
*   **`CRAWLER_UPDATE_PROGRESS`:** 크롤러 진행 상황 알림 (단계, 진행률, 메시지 포함)
*   **`CACHE_INVALIDATED`:** 캐시 무효화 알림 (관련 CVE ID 정보 포함 가능)
*   **`ERROR`:** 서버 측 소켓 오류 알림

### 5.3. 주요 WebSocket 이벤트 (Client -> Server)

*   **`connect`:** 클라이언트 연결 시도 (인증 정보 포함 - `auth` 파라미터)
*   **`disconnect`:** 클라이언트 연결 해제
*   **`subscribe_cve`:** 특정 CVE 구독 요청 (`{ cve_id: "..." }`)
*   **`unsubscribe_cve`:** 특정 CVE 구독 해제 요청 (`{ cve_id: "..." }`)
*   **`ping`:** (클라이언트 구현 시) 서버 생존 확인

## 6. 설정 및 배포 (Configuration & Deployment)

*   **설정:** `app/core/config.py` 및 `.env` 파일을 통해 관리. DB 연결 정보, JWT 비밀키, CORS 설정, Redis URL 등이 주요 설정값.
*   **실행:** Uvicorn과 같은 ASGI 서버 필요. (예: `uvicorn app.main:app --host 0.0.0.0 --port 8000`)
*   **배포:** Dockerfile 및 docker-compose.yml을 사용하여 컨테이너화된 환경에 배포하는 것이 일반적. (제공된 소스에는 설정 파일 부재) MongoDB, Redis 인스턴스 별도 필요.

## 7. AI Agent 활용 가이드

이 문서는 AI Agent가 CVEHub 프로젝트를 이해하고 추가 개발/개선 작업을 수행하는 데 필요한 정보를 제공합니다.

*   **기능 추가:**
    *   새로운 API 엔드포인트 추가 시: 관련 모듈(`cve`, `auth` 등)의 `router.py`, `service.py`, `repository.py`, `models.py` 파일을 수정/추가하고, `api.py`에 라우터를 등록합니다. Pydantic 스키마를 사용하여 요청/응답 형식을 명확히 정의합니다.
    *   프론트엔드 UI 추가/수정 시: 해당 `features/**` 디렉토리 내 컴포넌트 수정, 필요시 React Query 훅 추가/수정.
    *   실시간 기능 추가 시: 백엔드 `socketio/manager.py`, `service.py`에 이벤트 핸들러 및 발송 로직 추가. 프론트엔드 `useSocket` 훅 또는 관련 훅에서 이벤트 구독/처리 로직 추가.
*   **버그 수정:**
    *   에러 로그(백엔드) 및 브라우저 콘솔 로그(프론트엔드) 확인.
    *   관련 모듈의 서비스, 리포지토리, 라우터(백엔드) 또는 컴포넌트, 훅(프론트엔드) 코드 분석.
    *   데이터 흐름 추적(API 호출, DB 쿼리, WebSocket 이벤트)을 통해 원인 파악.
*   **개선 작업:**
    *   문서의 "개선점 및 고려사항" 섹션 참고.
    *   **성능:** DB 쿼리 최적화(인덱스 활용, 프로젝션), 캐싱 전략 개선, 비동기 처리(FastAPI, asyncio), 프론트엔드 번들 최적화, 코드 스플리팅.
    *   **상태 관리:** 프론트엔드 상태 관리 라이브러리 통합 검토.
    *   **테스트:** 유닛/통합 테스트 코드 작성 (pytest, testing-library 등).
*   **주의사항:**
    *   프론트엔드(CamelCase)와 백엔드(Snake_case) 간 **케이스 변환** 로직(`axios.ts`, `caseConverter.ts`, 백엔드 Pydantic 설정)을 이해해야 합니다.
    *   **의존성 주입**(`core/dependencies.py`) 구조를 이해하고 서비스/리포지토리 사용 시 해당 함수를 통해 인스턴스를 가져와야 합니다.
    *   **실시간 동기화** 로직(WebSocket 이벤트, React Query 캐시 업데이트)을 고려하여 데이터 일관성을 유지해야 합니다.
    *   **인증/인가** 로직(`get_current_user`, `get_current_admin_user`)을 이해하고 API 접근 제어에 적용해야 합니다.

## 8. 최근 리팩토링 및 개선 사항

### 8.1. 소켓 서비스 리팩토링 (2025-04-11)

*   **핵심 변경:**
    *   **클래스 책임 분리:** `SocketService`, `SocketEventManager`, `SocketMetrics`로 분리하여 단일 책임 원칙 적용
    *   **API 단순화:** 구독 관련 기능을 `updateSubscription(cveId, isSubscribed)` 메서드로 통합
    *   **로컬 스토리지 의존성 제거:** React Query 캐시만으로 상태 관리하도록 변경
    *   **타입 안전성 강화:** 불필요한 `any` 타입 제거 및 인터페이스 개선
    *   **named export 표준화:** 모든 컴포넌트를 명명된 export로 통일
    *   **순환 참조 문제 해결:** 이벤트 버스 패턴 도입으로 컴포넌트 간 결합도 감소

*   **개선된 구독 패턴:**
    ```typescript
    // 이전: 별도 메서드 호출
    socketService.subscribeCVE(cveId);
    socketService.unsubscribeCVE(cveId);
    
    // 개선: 통합 메서드 사용
    socketService.updateSubscription(cveId, true);   // 구독
    socketService.updateSubscription(cveId, false);  // 구독 해제
    ```
    
*   **이벤트 버스 패턴 도입:**
    ```typescript
    // 이벤트 발행 예시
    socketEventBus.publish('socketService:connected', null);
    
    // 이벤트 구독 예시 
    socketEventBus.on('socketService:connected').subscribe(() => {
      this.isConnected = true;
      this.startConnectionQualityMonitoring();
    });
    ```

*   **최적화 성과:**
    *   코드 중복 감소
    *   메모리 효율성 향상 (로컬 스토리지 의존성 제거)
    *   유지보수성 개선 (명확한 역할 분리)
    *   성능 향상 (불필요한 이벤트 구독/해제 최소화)
    *   테스트 용이성 (각 컴포넌트 독립적 테스트 가능)

### 8.2. 소켓 서비스 아키텍처 개선 (2025-04-12)

*   **기존 방식의 문제점:**
    *   직접적인 참조 구조로 인한 순환 참조 문제
    *   높은 결합도로 인한 유지보수 어려움
    *   테스트 복잡성 증가

*   **파일별 역할 분담:**
    *   **socketEventBus.ts**: 컴포넌트 간 통신을 중재하는 이벤트 버스 구현
        - 발행-구독(pub-sub) 모델 적용
        - RxJS Observable 기반 비동기 이벤트 스트림 관리
        - 타입 안전성이 보장된 이벤트 시스템 제공
        
    *   **socketService.ts**: 소켓 연결 관리 담당
        - 연결 생성/해제, 재연결 전략, 인증 토큰 관리
        - 기본 인터페이스 제공 (on, emit, connectionState$ 등)
        
    *   **socketEventManager.ts**: 이벤트 처리 전담
        - 이벤트 등록, 발행, 케이스 변환
        - 스로틀링/디바운싱을 통한 최적화
        
    *   **socketMetrics.ts**: 연결 품질 모니터링 전담
        - 소켓 핑-퐁을 통한 지연시간 측정
        - 연결 상태 메트릭 수집 및 분석
        
*   **이벤트 기반 통신 흐름:**
    1. SocketService에서 연결 시: `socketEventBus.publish('socketService:connected', null)`
    2. SocketMetrics에서 구독: `socketEventBus.on('socketService:connected').subscribe()`
    3. 이벤트 버스를 통한 간접 통신으로 순환 참조 제거

```

### 8.3. 이벤트 버스 기반 구독 관리 개선 (2025-04-12)

*   **핵심 개선사항:**
    * **이벤트 버스 패턴 확장:** 구독 관련 로직에 이벤트 버스 패턴 적용 완료
    * **useCVESubscription 리팩토링:** 이벤트 버스 기반으로 구독 상태 관리 개선
    * **WebSocketQueryBridge 개선:** 직접 소켓 참조 제거 및 이벤트 버스 통합
    * **구독 이벤트 일관성 확보:** 모든 `SUBSCRIPTION_STATUS` 이벤트 처리 중앙화

*   **웹소켓 이벤트 흐름 아키텍처:**
    ```
    ┌────────────────┐      ┌───────────────┐      ┌───────────────────┐
    │                │      │               │      │                   │
    │  SocketService │──┬──▶│ socketEventBus│────▶│ SocketEventManager │
    │                │  │   │               │      │                   │
    └────────────────┘  │   └───────────────┘      └───────────────────┘
            │           │          ▲                         │
            │           │          │                         │
            ▼           │          │                         ▼
    ┌────────────────┐  │   ┌───────────────┐      ┌───────────────────┐
    │                │  │   │               │      │                   │
    │   WebSocket    │  └──▶│ SocketMetrics │      │ WebSocketQueryBridge│
    │  (Socket.IO)   │      │               │      │                   │
    └────────────────┘      └───────────────┘      └───────────────────┘
            ▲                                                │
            │                                                │
            ▼                                                ▼
    ┌────────────────┐                              ┌───────────────────┐
    │                │                              │                   │
    │  useSocket 훅  │                              │  React Query 캐시  │
    │                │                              │                   │
    └────────────────┘                              └───────────────────┘
            ▲                                                ▲
            │                                                │
            └────────────────┬───────────────────────────────┘
                             │
                     ┌───────────────┐
                     │               │
                     │  UI 컴포넌트   │
                     │               │
                     └───────────────┘
    ```

*   **구독 처리 흐름:**
    1. **이벤트 발생:** 컴포넌트에서 구독 요청 시작 (`useCVESubscription.subscribe()` 호출)
    2. **서비스 요청:** `socketService.updateSubscription(cveId, true)` 호출
    3. **WebSocket 전송:** `socket.emit('subscribe_cve', { cve_id: cveId })`
    4. **서버 응답:** 서버에서 `subscription_status` 이벤트 전송
    5. **이벤트 버스 전파:** `socketEventBus.on<SubscriptionStatusEvent>(SUBSCRIPTION_EVENTS.SUBSCRIPTION_STATUS)`을 통해 구독자들에게 상태 변경 알림
    6. **상태 업데이트:** 구독 컴포넌트에서 상태 업데이트 및 UI 반영
    7. **캐시 갱신:** `queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, cveId] })`

*   **`useCVESubscription` 훅 사용법:**
    ```typescript
    // 훅 사용
    const { 
      isSubscribed,   // 현재 구독 상태
      isLoading,      // 구독 요청 처리 중 여부
      error,          // 오류 정보
      subscribe,      // 구독 요청 함수
      unsubscribe,    // 구독 취소 함수
      getSubscribers  // 구독자 목록 접근 함수
    } = useCVESubscription(cveId);
    
    // 구독 관리
    const handleSubscribe = () => {
      if (!isSubscribed) subscribe();
      else unsubscribe();
    };
    
    // 구독자 목록 표시
    const subscribers = getSubscribers();
    ```

*   **WebSocketQueryBridge의 역할:**
    * WebSocket 이벤트와 React Query 캐시를 연결하는 브릿지 컴포넌트
    * 이벤트에 따른 쿼리 무효화 매핑 관리
    * 구독 상태 변경 시 관련 쿼리 자동 갱신
    * RxJS Subscription을 사용한 메모리 누수 방지

*   **이벤트 버스 패턴의 장점:**
    * **결합도 감소:** 컴포넌트 간 직접 참조 제거
    * **테스트 용이성:** 컴포넌트 독립적 테스트 가능
    * **디버깅 편의성:** 이벤트 흐름 추적 용이
    * **확장성 향상:** 새로운 리스너 쉽게 추가 가능
    * **메모리 관리 개선:** RxJS Subscription을 통한 리소스 정리

*   **주요 기술 적용:**
    * **RxJS:** Observable 기반 이벤트 스트림 관리
    * **타입스크립트:** 인터페이스를 통한 이벤트 데이터 타입 강화
    * **React Query:** 서버 상태 관리 및 캐시 무효화 자동화
    * **Socket.IO:** 실시간 양방향 통신 지원

이번 리팩토링을 통해 구독 관리 로직의 결합도를 낮추고, 타입 안전성과 코드 유지보수성을 대폭 향상시켰습니다. 이벤트 버스 패턴을 통해 애플리케이션 전체에 일관된 소켓 이벤트 처리 방식을 제공합니다.
