# 웹소켓 메시지 처리 분석

## 개요

이 문서는 CVEHub 애플리케이션에서 웹소켓 메시지 처리 방식, 특히 크롤러 업데이트 진행 상황을 실시간으로 UI에 반영하는 과정을 분석합니다.

## 아키텍처 개요

CVEHub의 웹소켓 통신은 다음과 같은 구조로 이루어집니다:

```
[백엔드 크롤러 서비스] → [SocketIOManager] → [웹소켓 연결] → [프론트엔드 웹소켓 훅] → [UI 컴포넌트]
```

## 주요 컴포넌트

### 백엔드

1. **BaseCrawlerService** (`backend/app/services/crawler_base.py`)
   - 모든 크롤러의 기본 클래스
   - `report_progress` 메서드: 크롤러 진행 상황을 웹소켓을 통해 보고

2. **NucleiCrawlerService** (`backend/app/services/crawlers/nuclei_crawler.py`)
   - BaseCrawlerService를 상속받아 Nuclei 템플릿 크롤링 구현
   - `report_progress` 메서드를 오버라이드하여 추가 로깅 제공

3. **SocketIOManager** (`backend/app/core/socketio_manager.py`)
   - 웹소켓 연결 및 메시지 전송 관리
   - `emit`, `emit_to_user` 메서드: 웹소켓 메시지 전송

4. **WebSocketMessageUtils** (`backend/app/core/ws_message_utils.py`)
   - 표준화된 웹소켓 메시지 생성 유틸리티
   - 백엔드에서 일관된 메시지 구조를 보장

### 프론트엔드

1. **useWebSocketHook** (`frontend/src/api/hooks/useWebSocketHook.js`)
   - 웹소켓 이벤트 구독 및 처리를 위한 커스텀 훅
   - 이벤트 리스너 등록 및 해제 관리
   - 메시지 전송 기능 제공

2. **SocketIOService** (`frontend/src/services/socketio/socketio.js`)
   - 웹소켓 연결 관리 및 이벤트 처리
   - 케이스 변환 처리 (camelCase ↔ snake_case)
   - 이벤트 로깅 및 모니터링
   - 연결 상태 관리 및 재연결 처리

3. **MessageProcessor** (`frontend/src/services/socketio/messageProcessor.js`)
   - 웹소켓 메시지 정규화 및 유효성 검사
   - 다양한 메시지 구조 처리

4. **CrawlerUpdateButton** (`frontend/src/features/cve/components/CrawlerUpdateButton.jsx`)
   - 크롤러 실행 및 진행 상황 표시 UI 컴포넌트
   - 웹소켓 메시지를 수신하여 UI 업데이트
   - 안정적인 소켓 연결 및 리스너 관리

## 메시지 흐름

### 1. 백엔드에서 진행 상황 보고

```python
# NucleiCrawlerService에서 진행 상황 보고
await self.report_progress("데이터 수집", 40, "데이터 수집 중...(40%)")
```

### 2. 웹소켓 메시지 전송 (개선된 플랫 구조)

```python
# BaseCrawlerService에서 웹소켓 메시지 구성 (단순화된 플랫 구조)
message_data = {
    "type": "crawler_update_progress",
    "crawler": self.crawler_id,
    "stage": ui_stage,
    "percent": percent,
    "message": message,
    "timestamp": datetime.now().isoformat(),
    "isRunning": not (ui_stage == "완료" or ui_stage == "오류")
}

# SocketIOManager를 통해 메시지 전송
await socketio_manager.emit(WSMessageType.CRAWLER_UPDATE_PROGRESS, message_data)
```

### 3. 프론트엔드에서 메시지 수신 및 처리

```javascript
// CrawlerUpdateButton에서 웹소켓 연결 및 리스너 설정
useEffect(() => {
  console.log('%c 🔌 웹소켓 연결 및 이벤트 구독 설정 시작', 'background: #4caf50; color: white;');
  
  let unsubscribe = null;
  let socketCheckInterval = null;
  let connectListener = null;
  
  try {
    // 웹소켓 연결 확인 및 연결 시도
    const isConnected = socketIOService.isSocketConnected();
    
    // 연결되어 있지 않은 경우 연결 이벤트 리스너 설정
    if (!isConnected) {
      // 연결 이벤트 리스너 설정
      connectListener = socketIOService.addEventListener('connect', () => {
        console.log('%c 🔌 웹소켓 연결 성공, 리스너 설정 시작', 'background: #4caf50; color: white;');
        
        // 연결 성공 시 리스너 설정
        if (unsubscribe === null) {
          unsubscribe = _setupWebSocketListener();
        }
      });
      
      // 연결 시도
      socketIOService.connect();
    } else {
      // 이미 연결되어 있는 경우 바로 리스너 설정
      unsubscribe = _setupWebSocketListener();
    }
    
    // 소켓이 활성화되었는지 주기적으로 체크
    socketCheckInterval = setInterval(() => {
      // 리스너 상태 확인 및 필요시 재설정
      if (socketIOService?.isSocketConnected() && 
          (!socketIOService._eventListeners[SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS] || 
           socketIOService._eventListeners[SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS].length === 0)) {
        
        // 리스너 재설정
        if (unsubscribe) unsubscribe();
        unsubscribe = _setupWebSocketListener();
      }
    }, 5000);
    
  } catch (error) {
    console.error('웹소켓 이벤트 구독 설정 중 오류', error);
  }
  
  // 컴포넌트 언마운트 시 리소스 정리
  return () => {
    if (socketCheckInterval) clearInterval(socketCheckInterval);
    if (connectListener) connectListener();
    if (unsubscribe) unsubscribe();
  };
}, []);
```

### 4. 메시지 처리 및 UI 업데이트

```javascript
// 웹소켓 리스너 설정 함수
function _setupWebSocketListener() {
  // 연결 확인
  if (!socketIOService.isSocketConnected()) {
    console.warn('웹소켓이 연결되지 않았습니다. 연결 후 다시 시도합니다.');
    return null;
  }
  
  // 웹소켓 이벤트 구독
  return socketIOService.addEventListener(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, (data) => {
    console.log('크롤러 업데이트 이벤트 수신', data);
    
    // 웹소켓 데이터 처리
    const processed = processWebSocketData(
      data, 
      setActiveStep, 
      setProgress, 
      setIsRunning, 
      setHasError, 
      setLastUpdate, 
      setLastWebSocketUpdate, 
      handleCrawlerComplete
    );
  });
}
```

## 데이터 변환 처리

프론트엔드와 백엔드 간의 일관된 데이터 통신을 위해 자동 케이스 변환 시스템이 구현되어 있습니다:

### 1. 프론트엔드 → 백엔드 요청
- SocketIOService의 `_wrappedEmit` 메서드에서 camelCase를 snake_case로 변환
```javascript
// camelCase에서 snake_case로 변환
const convertedData = camelToSnake(data, { excludeFields: EXCLUDED_FIELDS });
```

### 2. 백엔드 → 프론트엔드 응답
- SocketIOService에서 수신된 데이터를 snake_case에서 camelCase로 변환
```javascript
// snake_case에서 camelCase로 변환
const convertedData = snakeToCamel(data, { 
  isTopLevel: true, 
  excludeFields: EXCLUDED_FIELDS 
});
```

## 최근 개선사항 (2025년 3월)

### 1. 메시지 구조 단순화
- 백엔드에서 중첩된 구조를 평탄화하여 프론트엔드 처리 단순화
- 메시지 스키마 표준화 및 명확한 문서화

```javascript
// 이전: 중첩된 구조
{
  type: "crawler_update_progress",
  data: {
    data: {
      stage: "데이터 수집",
      percent: 40,
      ...
    }
  }
}

// 개선: 평탄화된 구조
{
  type: "crawler_update_progress",
  stage: "데이터 수집",
  percent: 40,
  ...
}
```

### 2. 크롤러 상태 처리 개선
- CrawlerUpdateButton 컴포넌트의 WebSocket 데이터 처리 로직 개선
- CRAWLER_STAGES 상수를 활용한 표준화된 상태 매칭 시스템 도입
- 상태 판별 로직 일관화:
  ```javascript
  const completedValues = CRAWLER_STAGES.find(stage => stage.key === 'completed')?.backendValues || [];
  const isCompleted = stageValue ? 
    completedValues.includes(stageValue) || 
    completedValues.some(value => stageValue.includes(value)) : 
    false;
  ```
- 정확한 일치 및 부분 일치를 모두 검사하여 유연성 확보

### 3. 오류 상태 일관성 개선
- 오류 상태 감지를 위한 표준화된 로직 도입:
  ```javascript
  const errorValues = CRAWLER_STAGES.find(stage => stage.key === 'error')?.backendValues || [];
  const isError = stageValue ? 
    errorValues.includes(stageValue) || 
    errorValues.some(value => stageValue.includes(value)) : 
    false;
  ```
- setHasError 상태 업데이트 로직 통합 및 중복 제거

### 4. 성능 및 가독성 개선
- processWebSocketData 함수에 JSDoc 스타일 주석 추가로 문서화 강화
- 데이터 구조 유효성 검증 로직 강화
- 중첩된 데이터 구조 자동 감지 및 정규화

### 5. 메모리 관리 개선
- 이벤트 리스너 등록 및 해제 로직 개선
- 컴포넌트 언마운트 시 리소스 정리 철저화

## 웹소켓 이벤트 처리 패턴

최근 개선된 이벤트 처리 패턴은 다음과 같습니다:

```javascript
// 웹소켓 이벤트 핸들러 정의
const handleCrawlerUpdateEvent = useCallback((data) => {
  logger.info('CrawlerUpdateButton', '크롤러 업데이트 이벤트 수신', {
    eventType: SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS,
    stage: data?.stage,
    percent: data?.percent
  });
  
  // 웹소켓 데이터 처리 (중앙화된 로직)
  processWebSocketData(
    data, 
    setActiveStep, 
    setProgress, 
    setIsRunning, 
    setHasError, 
    setLastUpdate, 
    setLastWebSocketUpdate, 
    handleCrawlerComplete
  );
}, [handleCrawlerComplete]);

// useWebSocketHook을 사용한 이벤트 구독
useWebSocketHook(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, handleCrawlerUpdateEvent, {
  optimisticUpdate: false
});
```

이 접근 방식은 기존의 복잡한 이벤트 구독 및 처리 로직을 간소화하고, 중앙화된 데이터 처리 함수를 통해 코드 중복을 최소화합니다.

## 모범 사례 가이드라인

### 1. 안정적인 웹소켓 리스너 설정
- 소켓 연결이 완전히 설정된 후 리스너 등록
- 연결 이벤트(`connect`)를 구독하여 연결 완료 시점 파악
- 리스너 설정 해제 함수 항상 저장 및 컴포넌트 언마운트 시 호출

```javascript
// 연결 이벤트 리스너 및 정리 함수 관리
const connectListener = socketIOService.addEventListener('connect', () => {
  // 연결 성공 후 리스너 설정
});

// 컴포넌트 정리 함수에서 해제
return () => {
  if (connectListener) connectListener();
};
```

### 2. 메시지 구조 설계 원칙
- 간결하고 평탄한 구조 유지
- 필요한 정보만 포함하여 데이터 크기 최소화
- 타입 정보 명확히 표현 (타입 상수 사용)
- 타임스탬프 항상 포함하여 시간적 문맥 제공

### 3. 로깅 전략
- 개발 환경에서는 상세 로깅, 프로덕션에서는 중요 이벤트만 로깅
- 구조화된 로그 포맷 사용 (JSON)
- 컨텍스트 정보(연결 ID, 타임스탬프, 이벤트 타입 등) 포함
- 민감한 정보 마스킹 처리

### 4. 오류 처리 및 복구
- 일시적 연결 문제는 자동 재연결 시도
- 영구적 오류는 명확한 사용자 피드백 제공
- 연결 재시도 횟수 제한 및 지수 백오프 적용
- 중요 메시지는 오프라인 큐에 저장 후 연결 복구 시 전송

## 트러블슈팅 가이드

### 1. 웹소켓 연결 문제
- **증상**: 콘솔에 "웹소켓 연결 오류" 로그 발생, UI에 실시간 업데이트 없음
- **확인**: 네트워크 탭에서 웹소켓 연결 상태 확인
- **해결**: 
  - 백엔드 서버 실행 상태 확인
  - CORS 설정 확인
  - 토큰 만료 여부 확인

### 2. 이벤트 수신 문제
- **증상**: 웹소켓은 연결되었으나 이벤트가 수신되지 않음
- **확인**: 
  - 백엔드 로그에서 emit 호출 확인
  - 프론트엔드 이벤트 리스너 등록 확인
- **해결**:
  - 이벤트 이름 오타 확인
  - 리스너가 올바른 시점에 등록되었는지 확인
  - 소켓 서비스 초기화 상태 확인

### 3. 리스너 등록 타이밍 문제
- **증상**: "소켓 서비스 초기화되지 않음" 오류 발생
- **해결**:
  - `isSocketConnected()` 호출로 연결 상태 확인 후 리스너 등록
  - 연결 이벤트 리스너를 설정하여 연결 완료 후 구독
  - 주기적인 연결 상태 확인 및 필요시 리스너 재설정
