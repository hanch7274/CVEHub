# CVEHub 아키텍처 문서

## 웹소켓 시스템 아키텍처

### 1. 개요

CVEHub는 실시간 업데이트와 사용자 간 협업을 위해 WebSocket 통신을 사용합니다. 이 시스템은 다음과 같은 주요 목표를 가집니다:

- 실시간 CVE 데이터 업데이트 제공
- 동시 편집 시 충돌 방지
- 사용자 활동 상태 공유
- 알림 실시간 전송
- 세션 관리 및 연결 상태 모니터링

### 2. 프론트엔드 웹소켓 구현

#### 2.1 계층 구조

```
frontend/src/services/websocket/
├── core/
│   └── WebSocketCore.js      # 웹소켓 연결 핵심 클래스
├── utils/
│   └── configUtils.js        # 설정 및 상수
├── hooks/                   
│   ├── WebSocketHooks.js     # React 훅
│   └── useSubscription.js    # 구독 관리 훅
├── eventSystem.js            # 이벤트 발행/구독 시스템
├── index.js                  # 통합 API 제공
└── README.md                 # 문서
```

#### 2.2 주요 클래스 및 모듈

##### WebSocketCore 클래스 (core/WebSocketCore.js)
- **역할**: 기본 웹소켓 연결 관리, 메시지 송수신, 재연결 처리
- **공개 메서드**:
  - `checkConnectionState()`: 연결 상태 확인 (기본 연결 상태 확인 메서드)
  - `getConnectionState()`: 전체 연결 상태 객체 반환 (권장)
  - `checkConnection()`: 호환성 유지용 메서드, `checkConnectionState()`로 대체됨
  - `isReady()`: 웹소켓 준비 상태 확인 (호환성 메서드)
  - `connect()`: 연결 시작
  - `disconnect(cleanDisconnect)`: 연결 종료. cleanDisconnect가 true면 정상 종료 코드 전송
  - `reconnect()`: 재연결 시도
  - `send(type, data)`: 타입과 데이터로 구성된 메시지 전송
  - `sendPing()`: 핑 메시지 전송 (연결 유지 확인용)
  - `on(event, callback)`: 이벤트 구독 (eventSystem.subscribe() 사용)
  - `off(event, callback)`: 이벤트 구독 해제 (호환성 유지, 권장하지 않음)
  - `addHandler(type, handler)`: 특정 메시지 타입 핸들러 등록 (핸들러 제거 함수 반환)
  - `removeHandler(type, handler)`: 메시지 타입 핸들러 제거
- **내부 메서드**:
  - `_setupHandlers()`: 웹소켓 기본 이벤트 핸들러 설정
  - `_setupConnectionTimeout()`: 연결 시간 초과 설정
  - `_setupConnectionCheckTimer()`: 연결 상태 정기 확인 타이머 설정
  - `_checkConnectionStatus()`: 연결 상태 확인 및 필요시 핑 전송
  - `_setupUnloadListener()`: 페이지 언로드 시 정상 종료 처리
  - `_handleOpen(event)`: 연결 열림 이벤트 처리
  - `_handleMessage(messageEvent)`: 메시지 수신 처리 (통합된 메시지 처리 로직)
  - `_parseMessage(messageEvent)`: 웹소켓 메시지 파싱 및 유효성 검증
  - `_callTypeHandlers(type, data)`: 메시지 타입에 등록된 핸들러 호출
  - `_handleSystemMessage(type, data)`: 시스템 메시지 처리 (핑/퐁/연결확인 등)
  - `_handleClose(closeEvent)`: 연결 종료 이벤트 처리
  - `_handleError(error)`: 오류 처리
  - `_handleConnectAck(data)`: 연결 확인 메시지 처리
  - `_handleMultipleConnections(userConnections)`: 다중 사용자 연결 처리
  - `_sendInitialSessionInfo()`: 초기 세션 정보 전송
  - `_convertToCamelCase(data)`: 스네이크 케이스를 카멜 케이스로 변환
  - `_emitEvent(event, data)`: eventSystem을 통한 이벤트 발생
  - `_getSessionId()`: 세션 ID 가져오기
  - `_calculateReconnectDelay()`: 재연결 지연 시간 계산 (지수 백오프)
  - `_cleanup()`: 연결 관련 자원 정리
  - `_log(message, data)`: 중앙 로깅 서비스를 통한 디버그 로깅
- **속성(getter/setter)**:
  - `get isConnected`: 연결 상태 확인(속성)
  - `set isConnected(value)`: 연결 상태 설정(속성)
  - `get isReady`: 준비 상태 속성
  - `set isReady(value)`: 준비 상태 설정(속성)

##### 이벤트 시스템 (eventSystem.js)
- **역할**: 중앙화된 이벤트 발행/구독 기능 제공
- **주요 메서드**:
  - `subscribe(eventType, callback, identifier)`: 이벤트 구독 (구독 취소 함수 반환)
  - `unsubscribe(eventType, handlerId)`: 구독 해제
  - `emit(eventType, data)`: 이벤트 발생
  - `_notifyLegacyHandlers(eventType, data)`: 기존 레거시 핸들러 호출
  - `addLegacyHandler(handler)`: 레거시 핸들러 추가
  - `removeLegacyHandler(handler)`: 레거시 핸들러 제거
  - `getSubscriberCount(eventType)`: 이벤트 타입별 구독자 수 반환
  - `getEventStats()`: 이벤트 구독 통계 반환
  - `clearAll()`: 모든 이벤트 및 핸들러 정리

##### 웹소켓 서비스 (index.js)
- **역할**: 외부에 노출되는 간소화된 API 제공 (파사드 패턴)
- **주요 메서드**:
  - `connect()`: 연결 시작
  - `disconnect(cleanDisconnect)`: 연결 종료
  - `reconnect()`: 재연결
  - `isConnected()`: 연결 상태 확인
  - `checkConnection()`: 연결 상태 확인 (호환성 메서드)
  - `getConnectionState()`: 전체 연결 상태 객체 반환 (권장)
  - `send(type, data)`: 메시지 전송
  - `ping()`: 핑 메시지 전송
  - `on(event, callback)`: 이벤트 구독 (구독 취소 함수 반환)
  - `off(event, callback)`: 구독 해제 (권장하지 않음)
  - `addHandler(type, handler)`: 메시지 타입 핸들러 등록
  - `removeHandler(type, handler)`: 메시지 타입 핸들러 제거
  - `subscribe(resourceId, resourceType)`: 리소스 구독
  - `unsubscribe(resourceId, resourceType)`: 구독 해제
  - `setCacheInvalidation(enabled)`: 캐시 무효화 설정
  - `getStats()`: 현재 WebSocket 상태 통계 반환
  - `setLogLevel(level)`: 로그 레벨 설정
  - `enableLogging(enabled)`: 로깅 활성화/비활성화
  - `getRecentLogs(count)`: 최근 로그 가져오기
- **속성(getter)**:
  - `state`: 현재 연결 상태 
  - `isReady`: 준비 상태

##### WebSocketContext (contexts/WebSocketContext.jsx)
- **역할**: React 컴포넌트 트리 전체에 WebSocket 상태 제공
- **최적화 구현**:
  - 상태와 액션을 별도 컨텍스트로 분리: `WebSocketStateContext`와 `WebSocketActionsContext`
  - `useReducer`를 사용한 중앙화된 상태 관리
  - 상태 변경 이벤트에 대한 액션 처리
- **주요 컴포넌트**:
  - `WebSocketProvider`: WebSocket 상태를 제공하는 컨텍스트 프로바이더
  - 훅 함수:
    - `useWebSocketState()`: 상태만 필요한 컴포넌트용
    - `useWebSocketActions()`: 액션만 필요한 컴포넌트용
    - `useWebSocketContext()`: 상태와 액션 모두 필요한 컴포넌트용 (호환성 유지)
- **상태 리듀서 액션 타입**:
  - `CONNECTED`: 연결됨 상태
  - `DISCONNECTED`: 연결 끊김 상태
  - `CONNECTING`: 연결 중 상태
  - `ERROR`: 오류 상태
  - `SET_READY`: 준비 완료 상태 설정
  - `SET_NOTIFICATION`: 알림 키 설정
  - `CLEAR_NOTIFICATION`: 알림 키 제거
- **메모이제이션 구현**:
  - 상태 객체 메모이제이션
  - 액션 함수 메모이제이션 
  - 이벤트 핸들러 메모이제이션

##### React Hooks (hooks/WebSocketHooks.js)
- **역할**: React 컴포넌트에서 웹소켓 사용 편의성 및 성능 최적화 제공
- **최적화 구현**:
  - `useCallback`으로 콜백 함수 메모이제이션
  - `useMemo`로 반환 객체 메모이제이션
  - `useRef`로 콜백 참조 안정성 유지
- **주요 훅**:
  - `useWebSocketMessage(eventType, callback, filterFn)`: 특정 이벤트 타입 메시지 구독
    - 필터 함수를 `useRef`로 관리하여 불필요한 재구독 방지
  - `useCVEWebSocketUpdate(cveId, options)`: CVE 업데이트 구독 및 관리
    - `handleCVEUpdate` 및 `handleSubscriptionChange` 메모이제이션
    - 구독 함수(`subscribe`, `unsubscribe`, `sendUpdate`) 메모이제이션
    - 반환 객체를 `useMemo`로 최적화
    - 반환: `{isSubscribed, subscribers, subscribe, unsubscribe, sendUpdate}`
  - `useWebSocketConnection()`: 연결 상태 관리
    - 이벤트 핸들러(`handleConnected`, `handleDisconnected` 등) 메모이제이션
    - 연결 함수(`connect`, `disconnect`, `reconnect`) 메모이제이션
    - 반환 객체 메모이제이션
    - 반환: `{isConnected, isReady, connectionState, connect, disconnect, reconnect}`
  - `useCrawlerProgress(onProgressUpdate)`: 크롤러 진행 상태 구독
    - 크롤러 업데이트 핸들러 메모이제이션
    - 크롤러 제어 함수 메모이제이션
    - 반환 객체 메모이제이션
    - 반환: `{isRunning, progress, stage, message, lastUpdate, startCrawler, stopCrawler}`

##### 구독 관리 훅 (hooks/useSubscription.js)
- **역할**: 리소스 구독/구독 해제 및 구독자 정보 관리
- **주요 기능**:
  - `useSubscription(resourceId, resourceType)`: 리소스 구독 관리 훅
    - 반환: `{isSubscribed, subscribers, subscribe, unsubscribe}`
  - 자동 구독 및 구독 상태 관리
  - 구독자 목록 관리
  - 컴포넌트 언마운트 시 구독 정리

### 3. 백엔드 웹소켓 구현

#### 3.1 주요 컴포넌트

##### ConnectionManager 클래스 (backend/app/core/websocket.py)
- **역할**: 연결 관리, 메시지 라우팅, 세션 관리
- **주요 메서드**:
  - `connect(websocket, user_id)`: 새 연결 처리
  - `disconnect(user_id, websocket)`: 연결 종료 처리
  - `send_json(websocket, message)`: JSON 메시지 전송
  - `broadcast(message, exclude_user)`: 모든 사용자에게 메시지 브로드캐스트
  - `handle_message(websocket, user_id, message)`: 메시지 처리
  - `subscribe_cve(user_id, cve_id)`: CVE 구독
  - `unsubscribe_cve(user_id, cve_id)`: CVE 구독 해제
  - `broadcast_to_cve(cve_id, message_type, data)`: CVE 구독자에게 메시지 전송

##### WebSocket 엔드포인트 (backend/app/api/websocket.py)
- **역할**: HTTP 요청을 WebSocket 연결로 업그레이드
- **주요 엔드포인트**:
  - `/ws`: 인증된 사용자를 위한 기본 WebSocket 엔드포인트
  - `/ws/crawler`: 크롤러 상태 모니터링을 위한 엔드포인트

### 4. 메시지 타입 및 이벤트

#### 4.1 메시지 타입 (WSMessageType)

```python
# 백엔드 메시지 타입 열거형 (backend/app/core/websocket.py)
class WSMessageType(str, Enum):
    CONNECTED = "connected"
    CONNECT_ACK = "connect_ack"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    NOTIFICATION = "notification"
    NOTIFICATION_READ = "notification_read"
    ALL_NOTIFICATIONS_READ = "all_notifications_read"
    CVE_CREATED = "cve_created"
    CVE_UPDATED = "cve_updated"
    CVE_DELETED = "cve_deleted"
    # ... 기타 타입
```

#### 4.2 프론트엔드 이벤트 타입 (configUtils.js)

```javascript
// 프론트엔드 이벤트 타입 (frontend/src/services/websocket/utils/configUtils.js)
export const WS_EVENT = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    CONNECT_ACK: 'connect_ack',
    ERROR: 'error',
    PING: 'ping',
    PONG: 'pong',
    MESSAGE: 'message',
    SESSION_INFO: 'session_info',
    CLEANUP_CONNECTIONS: 'cleanup_connections',
    CVE_UPDATED: 'cve_updated',
    NOTIFICATION: 'notification',
    CRAWLER_UPDATE_PROGRESS: 'crawler_update_progress'
};
```

### 5. 통신 과정 및 메시지 흐름

#### 5.1 연결 수립 과정

1. **프론트엔드 연결 요청**:
   ```javascript
   webSocketService.connect();
   ```

2. **백엔드 연결 수락**:
   ```python
   await manager.connect(websocket, user_id)
   ```

3. **연결 확인 메시지 전송** (백엔드 → 프론트엔드):
   ```python
   connect_ack_message = {
       "type": "connect_ack",
       "data": {
           "user_id": user_id,
           "timestamp": datetime.now(),
           "connection_info": connection_info,
           "message": "서버 연결이 성공적으로 수락되었습니다."
       }
   }
   await websocket.send_json(connect_ack_message)
   ```

4. **프론트엔드 확인 처리**:
   ```javascript
   _handleConnectAck(data) {
     this._connectAckProcessed = true;
     this._emitEvent(WS_EVENT.CONNECT_ACK, data);
   }
   ```

5. **세션 정보 전송** (프론트엔드 → 백엔드):
   ```javascript
   this.send(WS_EVENT.SESSION_INFO, {
     sessionId,
     userAgent: navigator.userAgent,
     platform: navigator.platform,
     path: window.location.pathname,
     timestamp: Date.now()
   });
   ```

#### 5.2 구독 메커니즘

1. **CVE 구독 요청** (프론트엔드 → 백엔드):
   ```javascript
   webSocketService.subscribe(cveId, 'cve');
   ```

2. **백엔드 구독 처리**:
   ```python
   async def subscribe_cve(self, user_id, cve_id, session_id=None)
   ```

3. **구독 확인 메시지** (백엔드 → 프론트엔드):
   ```python
   await self.broadcast_to_cve(cve_id, "subscription", {
       "cve_id": cve_id,
       "action": "subscribe",
       "user_id": user_id,
       "timestamp": datetime.now(),
       "subscribers": subscribers
   })
   ```

4. **구독 상태 업데이트** (프론트엔드):
   ```javascript
   useSubscription(cveId) -> setIsSubscribed(true)
   ```

#### 5.3 CVE 업데이트 흐름

1. **CVE 수정** (프론트엔드):
   ```javascript
   sendUpdate(cveId, 'status', 'confirmed')
   ```

2. **백엔드 처리 및 브로드캐스트**:
   ```python
   await update_cve_field(cve_id, field, value)
   await self.broadcast_to_cve(cve_id, "cve_updated", update_data)
   ```

3. **다른 클라이언트 업데이트 수신**:
   ```javascript
   useCVEWebSocketUpdate(cveId, {
     onUpdate: (data) => updateUI(data)
   })
   ```

### 6. 세션 관리 및 다중 연결 처리

#### 6.1 세션 식별

- 프론트엔드: `sessionStorage`에 고유 `sessionId` 저장
- 백엔드: `user_connections` 및 `user_session_map`으로 세션 추적

#### 6.2 다중 연결 처리

같은 사용자의 여러 연결(여러 탭/브라우저)을 처리하는 방법:

1. **다중 연결 감지** (백엔드):
   ```python
   user_connections = len(self.user_connections.get(user_id, []))
   ```

2. **다중 연결 정보 전송** (백엔드 → 프론트엔드):
   ```python
   connect_ack_message = {
       "type": "connect_ack",
       "data": {
           "user_connections": user_connections,
           # ...
       }
   }
   ```

3. **프론트엔드 처리**:
   ```javascript
   _handleMultipleConnections(userConnections) {
     this.send(WS_EVENT.CLEANUP_CONNECTIONS, {
       sessionId,
       timestamp: Date.now()
     });
   }
   ```

4. **백엔드 정리 처리**:
   ```python
   async def handle_cleanup_connections(self, websocket, user_id, data):
       # 불필요한 연결 정리
   ```

### 7. 오류 처리 및 재연결 메커니즘

#### 7.1 연결 끊김 감지

- **프론트엔드**: `WebSocket.onclose` 이벤트
- **백엔드**: 비동기 작업 예외 처리

#### 7.2 재연결 전략

```javascript
// 지수 백오프 재연결 알고리즘
calculateReconnectDelay(attempts, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(maxDelay, baseDelay * Math.pow(1.5, attempts - 1));
  return Math.floor(delay * (0.8 + Math.random() * 0.4)); // 지터 추가
}

// 재연결 실행
reconnect() {
  // 재연결 시도 횟수 초과 체크
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    console.error(`최대 재연결 시도 횟수(${this.maxReconnectAttempts}) 초과`);
    return false;
  }
  
  // 재연결 지연 시간 계산
  const delay = this._calculateReconnectDelay();
  this.reconnectAttempts += 1;
  
  // 재연결 시도
  this._emitEvent(WS_EVENT.RECONNECTING, { 
    attempts: this.reconnectAttempts, 
    delay, 
    timestamp: Date.now() 
  });
  
  this.reconnectTimeout = setTimeout(() => {
    this.connect();
  }, delay);
  
  return true;
}
```

#### 7.3 핑/퐁(Ping/Pong) 메커니즘

```javascript
// 연결 상태 체크 및 핑 전송
_checkConnectionStatus() {
  const timeSinceLastMessage = Date.now() - this.lastMessageTime;
  
  if (isConnected && timeSinceLastMessage > WS_CONFIG.PING_INTERVAL) {
    this.sendPing();
  }
}

// 핑 전송
sendPing() {
  this.send(WS_EVENT.PING, { timestamp: Date.now() });
}
```

### 8. 케이스 변환 (스네이크 케이스 ↔ 카멜 케이스)

백엔드에서는 스네이크 케이스를, 프론트엔드에서는 카멜 케이스를 사용하여 속성명 변환 처리:

```javascript
// 스네이크 케이스 → 카멜 케이스 변환
_convertToCamelCase(data) {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => this._convertToCamelCase(item));
  }
  
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = this._convertToCamelCase(value);
  }
  
  return result;
}
```

### 9. 개발 시 주의사항 및 모범 사례

#### 9.1 중요 주의사항

1. **함수와 속성 이름 충돌 방지**:
   - 같은 이름의 메서드와 getter/setter를 정의하지 마세요.
   - 예: `isConnected()` 메서드와 `get/set isConnected` 속성 충돌 문제

2. **이벤트 구독 메모리 누수 방지**:
   - React 컴포넌트에서 `useEffect` 정리 함수에서 항상 구독을 해제하세요.
   ```javascript
   useEffect(() => {
     const unsubscribe = webSocketService.on('event', handler);
     return () => unsubscribe();
   }, []);
   ```

3. **네트워크 오류 처리**:
   - 항상 모든 웹소켓 작업을 try-catch로 감싸세요.
   - 예상치 못한 연결 종료에 대비한 오류 처리 코드를 구현하세요.

4. **재연결 관리**:
   - 무한 재연결 시도를 방지하기 위해 최대 시도 횟수를 설정하세요.
   - 지수 백오프 알고리즘을 사용하여 서버 부하를 줄이세요.

#### 9.2 모범 사례

1. **React 훅 사용**:
   - 컴포넌트에서 직접 웹소켓 서비스 호출 대신 제공된 훅을 사용하세요.
   ```javascript
   // 권장:
   const { isConnected } = useWebSocketConnection();
   
   // 지양:
   const [connected, setConnected] = useState(webSocketService.isConnected());
   ```

2. **메시지 검증**:
   - 백엔드와 프론트엔드 모두에서 메시지 스키마를 검증하세요.
   - 유효하지 않은 메시지를 적절히 처리하세요.

3. **상태 동기화**:
   - 연결 상태 변경 시 Redux 스토어와 같은 중앙 상태를 업데이트하세요.
   ```javascript
   useEffect(() => {
     if (isConnected) {
       dispatch(wsConnected());
     } else {
       dispatch(wsDisconnected());
     }
   }, [isConnected, dispatch]);
   ```

4. **구독 관리**:
   - 컴포넌트가 마운트될 때 구독하고 언마운트될 때 구독을 해제하세요.
   - 중복 구독을 방지하기 위해 isSubscribed 상태를 확인하세요.

5. **디버깅 지원**:
   - 개발 환경에서 유용한 로깅을 활성화하세요.
   - 문제 해결을 위한 웹소켓 검사 도구를 사용하세요.
   ```javascript
   // 개발 환경에서만:
   window._webSocketService = webSocketService;
   ``` 

### 10. 코드 중복 및 최적화 방안

#### 10.1 식별된 중복 코드
코드 분석 결과, 다음과 같은 중복/유사 기능이 식별되었습니다:

1. **연결 상태 확인 메서드 중복**:
   - `WebSocketCore.js`: `checkConnection()`, `get isConnected()`, `isReady()`, `get isReady()`
   - `index.js`: `isConnected()`, `checkConnection()`

2. **이벤트 구독 메커니즘 중복**:
   - `WebSocketCore._emitEvent()` vs `eventSystem.emit()`
   - `WebSocketCore.on()` vs `eventSystem.subscribe()`

3. **타입 핸들러 관리 중복**:
   - `WebSocketCore._callTypeHandlers()` vs `WebSocketCore._handleSpecialMessageTypes()`
   - `WebSocketCore.addHandler()` vs `eventSystem.addLegacyHandler()`

4. **로깅 중복**:
   - 여러 컴포넌트에 디버그 로깅 분산
   - `WebSocketCore._log()`, 콘솔 직접 호출 등

5. **WebSocketContext와 훅의 상태 관리 중복**:
   - `WebSocketContext`와 `useWebSocketConnection()` 모두 연결 상태 추적

#### 10.2 구현된 최적화 방안

##### 1. 연결 상태 관리 통합 (✅ 구현 완료)
- `checkConnectionState()` 메서드를 기본 연결 상태 확인 메서드로 통합
- `getConnectionState()` 메서드를 통해 모든 상태 정보 제공
- 메서드와 속성 이름 명확히 구분하여 충돌 방지

##### 2. 이벤트 시스템 통합 (✅ 구현 완료)
- WebSocketCore에서 eventSystem을 직접 참조하고 사용
- `on()` 메서드는 `eventSystem.subscribe()`를 래핑
- `_emitEvent()` 메서드는 `eventSystem.emit()`을 사용
- 구독 취소 함수를 항상 반환하여 메모리 관리 개선

##### 3. 메시지 핸들러 통합 (✅ 구현 완료)
- 전략 패턴을 사용하여 메시지 처리 로직 통합
- `_handleMessage` -> `_parseMessage` -> `_callTypeHandlers` -> `_handleSystemMessage` 패턴 구현
- 핸들러 추가/제거 메서드 개선
- 메시지 파싱과 처리 분리로 책임 명확화

##### 4. 중앙화된 로깅 시스템 (✅ 구현 완료)
- `loggingService.js`로 로깅 기능 중앙화
- 모듈별 로깅, 로그 레벨 제어, 로그 내역 관리 등 기능 제공
- 로그 추적 및 디버깅 용이성 개선

##### 5. Context API 최적화 (✅ 구현 완료)
- 상태와 액션을 별도 컨텍스트로 분리
- `WebSocketStateContext`: 상태만 포함 (isConnected, isReady, connectionStatus 등)
- `WebSocketActionsContext`: 액션만 포함 (connect, disconnect, sendMessage 등)
- `useReducer`를 사용한 상태 관리 중앙화
- 세 가지 수준의 훅 제공:
  - `useWebSocketState()`: 상태만 필요한 컴포넌트용
  - `useWebSocketActions()`: 액션만 필요한 컴포넌트용
  - `useWebSocketContext()`: 두 가지 모두 필요한 컴포넌트용 (호환성 유지)

##### 6. React 훅 성능 최적화 (✅ 구현 완료)
- `useMemo`, `useCallback`, `useRef`를 활용한 성능 최적화
- 이벤트 핸들러 메모이제이션으로 불필요한 함수 재생성 방지
- 반환 객체 메모이제이션으로 불필요한 리렌더링 감소
- 의존성 배열 최적화로 효율적인 이펙트 실행
- 콜백 함수 참조를 `useRef`로 관리하여 안정성 확보

#### 10.3 기타 최적화 방안

1. **애플리케이션 성능 최적화**:
   - 컴포넌트 메모이제이션 확대 적용
   ```jsx
   // 컴포넌트 자체 메모이제이션
   const WebSocketStatus = React.memo(function WebSocketStatus() {
     const { connectionState } = useWebSocketState();
     return <div>상태: {connectionState}</div>;
   });
   ```

2. **코드 분할 개선**:
   - 비즈니스 로직(연결 관리)과 UI 로직(알림) 분리
   - 관심사 분리 원칙 적용

3. **타입 안전성 향상**:
   - TypeScript 도입으로 타입 안전성 확보
   - 메시지 타입 및 이벤트 타입 상수화

4. **서버-클라이언트 통신 규약 문서화**:
   - 모든 메시지 타입 및 데이터 형식을 문서화
   - API 스키마 정의 및 자동 검증 시스템 구축

5. **테스트 용이성 향상**:
   - 의존성 주입 패턴 적용
   - 모의 WebSocket 구현체(Mock)를 통한 단위 테스트 지원

### 11. 주요 최적화 구현 예시

#### 11.1 WebSocketCore와 eventSystem 통합

```javascript
// WebSocketCore.js
class WebSocketCore {
  constructor() {
    // ...
    this.eventSystem = eventSystem;
  }
  
  // eventSystem 사용한 이벤트 발생
  _emitEvent(event, data) {
    this.eventSystem.emit(event, data);
  }
  
  // eventSystem을 사용한 이벤트 구독
  on(event, callback) {
    if (!event || typeof callback !== 'function') {
      logger.warn('WebSocketCore', '잘못된 이벤트 구독 요청', { event, hasCallback: !!callback });
      return () => {};
    }
    
    return this.eventSystem.subscribe(event, callback, `core_${Date.now()}`);
  }
}
```

#### 11.2 메시지 핸들러 통합

```javascript
// WebSocketCore.js
// 통합된 메시지 처리 로직
_handleMessage(messageEvent) {
  try {
    // 마지막 메시지 수신 시간 업데이트
    this.lastMessageTime = Date.now();
    
    // 메시지 파싱
    const { type, data } = this._parseMessage(messageEvent);
    
    if (!type) {
      logger.warn('WebSocketCore', '알 수 없는 메시지 형식', messageEvent.data);
      return;
    }
    
    // 데이터 카멜케이스 변환
    const camelData = this._convertToCamelCase(data);
    
    // 메시지 타입별 이벤트 발생
    this._emitEvent(type, camelData);
    
    // 일반 메시지 이벤트 발생 (모든 메시지)
    this._emitEvent(WS_EVENT.MESSAGE, { type, data: camelData });
    
    // 메시지 타입별 핸들러 호출
    this._callTypeHandlers(type, camelData);
    
    // 메시지 처리 기록
    this._lastProcessedMessages.set(type, {
      timestamp: Date.now(),
      data: camelData
    });
  } catch (error) {
    logger.error('WebSocketCore', '메시지 처리 중 오류', error);
  }
}
```

#### 11.3 Context API 상태와 액션 분리

```jsx
// WebSocketContext.jsx

// 상태와 액션을 분리하여 컨텍스트 생성
const WebSocketStateContext = createContext(null);
const WebSocketActionsContext = createContext(null);

// 리듀서 기반 상태 관리
function webSocketReducer(state, action) {
  switch (action.type) {
    case WS_CONTEXT_ACTIONS.CONNECTED:
      return {
        ...state,
        isConnected: true,
        isReady: true,
        connectionStatus: 'connected',
        lastActivity: Date.now(),
        error: null
      };
    // ... 기타 액션 처리
  }
}

// 프로바이더 컴포넌트
export const WebSocketProvider = ({ children }) => {
  const [state, dispatch] = useReducer(webSocketReducer, initialState);
  
  // 액션 객체 메모이제이션
  const actions = useMemo(() => ({
    connect,
    disconnect,
    reconnect,
    sendMessage
  }), [connect, disconnect, reconnect, sendMessage]);
  
  // 상태 객체 메모이제이션
  const memoizedState = useMemo(() => ({
    isConnected: state.isConnected,
    isReady: state.isReady,
    connectionStatus: state.connectionStatus,
    error: state.error,
    lastActivity: state.lastActivity
  }), [state.isConnected, state.isReady, state.connectionStatus, 
       state.error, state.lastActivity]);
  
  return (
    <WebSocketStateContext.Provider value={memoizedState}>
      <WebSocketActionsContext.Provider value={actions}>
        {children}
      </WebSocketActionsContext.Provider>
    </WebSocketStateContext.Provider>
  );
};
```

#### 11.4 React 훅 최적화

```javascript
// WebSocketHooks.js
export const useCVEWebSocketUpdate = (cveId, options = {}) => {
  // ... 상태 및 참조 설정
  
  // 이벤트 핸들러 메모이제이션
  const handleCVEUpdate = useCallback((data) => {
    // ... 업데이트 처리 로직
  }, [cveId, dispatch]);
  
  // ... 이벤트 구독 설정
  
  // 반환 객체 메모이제이션
  return useMemo(() => ({
    isSubscribed,
    subscribers,
    subscribe,
    unsubscribe,
    sendUpdate
  }), [isSubscribed, subscribers, subscribe, unsubscribe, sendUpdate]);
};