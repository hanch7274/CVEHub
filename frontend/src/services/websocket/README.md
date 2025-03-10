# 웹소켓 서비스 모듈

이 모듈은 React 애플리케이션에서 WebSocket 연결을 효율적으로 관리하기 위한 인터페이스를 제공합니다.

## 목차

- [구조](#구조)
- [핵심 기능](#핵심-기능)
- [사용법](#사용법)
- [연결 상태 및 이벤트](#연결-상태-및-이벤트)
- [훅 사용 가이드](#훅-사용-가이드)
- [문제 해결](#문제-해결)

## 구조

웹소켓 서비스는 다음과 같은 계층 구조로 구성되어 있습니다:

```
frontend/src/services/websocket/
├── core/
│   └── WebSocketCore.js      # 웹소켓 연결 핵심 클래스
├── utils/
│   └── configUtils.js        # 설정 및 상수
├── hooks/                   
│   └── WebSocketHooks.js     # React 훅
├── index.js                  # 공용 API
└── README.md                 # 문서
```

## 핵심 기능

- **단일 웹소켓 연결 관리**: 앱 전체에서 하나의 웹소켓 연결을 관리합니다.
- **자동 재연결**: 네트워크 중단 시 지수 백오프 알고리즘을 사용하여 자동으로 재연결을 시도합니다.
- **이벤트 기반 아키텍처**: 이벤트 발행/구독 패턴을 사용하여 데이터 흐름을 관리합니다.
- **리액트 통합**: React 컴포넌트와 쉽게 통합할 수 있는 훅을 제공합니다.
- **CVE 구독**: 특정 CVE 데이터 구독 및 실시간 업데이트 처리 기능이 있습니다.

## 사용법

### 웹소켓 서비스 직접 사용

```javascript
import webSocketService, { WS_EVENT } from '../services/websocket';

// 연결 시작
webSocketService.connect();

// 이벤트 구독
const unsubscribe = webSocketService.on(WS_EVENT.CONNECTED, () => {
  console.log('웹소켓이 연결되었습니다!');
});

// 메시지 전송
webSocketService.send('update_cve', { cveId: 'CVE-2023-1234', field: 'status', value: 'confirmed' });

// 구독 해제
unsubscribe();

// 연결 종료
webSocketService.disconnect();
```

### React 훅 사용

```jsx
import { useWebSocketConnection, useWebSocketMessage, useCVEWebSocketUpdate } from '../hooks/WebSocketHooks';

function MyComponent() {
  // 연결 상태 관리
  const { isConnected, isReady, reconnect } = useWebSocketConnection();
  
  // 메시지 구독
  useWebSocketMessage('notification', (data) => {
    console.log('알림 수신:', data);
  });
  
  // CVE 업데이트 구독
  const { isSubscribed, sendUpdate } = useCVEWebSocketUpdate('CVE-2023-1234', {
    onUpdate: (data) => console.log('CVE 업데이트:', data)
  });
  
  return (
    <div>
      <p>연결 상태: {isConnected ? '연결됨' : '연결 안됨'}</p>
      <button onClick={reconnect}>재연결</button>
      <button onClick={() => sendUpdate('status', 'in_progress')}>상태 업데이트</button>
    </div>
  );
}
```

## 연결 상태 및 이벤트

### 연결 상태

웹소켓 연결 상태는 다음 값 중 하나입니다:

- `disconnected`: 연결이 끊어진 상태
- `connecting`: 연결 중인 상태
- `connected`: 연결된 상태
- `error`: 오류 발생 상태

### 주요 이벤트

- `connected`: 연결 성공 시 발생
- `disconnected`: 연결 종료 시 발생
- `connect_ack`: 서버에서 연결 확인 응답을 받았을 때 발생
- `error`: 오류 발생 시 발생
- `message`: 모든 메시지 수신 시 발생
- `cve_updated`: CVE 업데이트 시 발생
- `subscription`: 구독 관련 이벤트 발생

## 훅 사용 가이드

### useWebSocketConnection

연결 상태를 관리하고 연결 관련 기능을 제공합니다.

```jsx
const { isConnected, isReady, connectionState, connect, disconnect, reconnect } = useWebSocketConnection();
```

### useWebSocketMessage

특정 이벤트 타입에 대한 메시지를 구독합니다.

```jsx
useWebSocketMessage('notification', (data) => {
  // 알림 메시지 처리
});
```

### useCVEWebSocketUpdate

특정 CVE ID에 대한 업데이트를 구독하고 관리합니다.

```jsx
const { isSubscribed, subscribers, sendUpdate } = useCVEWebSocketUpdate('CVE-2023-1234', {
  onUpdate: (data) => {
    // CVE 업데이트 처리
  },
  onSubscribersChange: (subscribers) => {
    // 구독자 정보 변경 처리
  }
});
```

## 문제 해결

### 연결 문제

- 인증 토큰 유효성 확인
- CORS 설정 확인
- 네트워크 연결 확인

### 메시지 수신 문제

- 구독 상태 확인
- 이벤트 타입 및 형식 확인
- 디버깅 모드 활성화: `window._webSocketService.getStats()`로 상태 확인

### 재연결 문제

- 최대 재연결 시도 횟수 확인
- 수동 재연결 시도: `webSocketService.reconnect()` 