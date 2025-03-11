# CVEHub Frontend

## 소개

CVEHub는 CVE(Common Vulnerabilities and Exposures) 정보를 관리하고 탐색하기 위한 웹 애플리케이션입니다.

## 최근 업데이트: React Query와 Socket.IO 도입

CVEHub 프론트엔드에서는 상태 관리와 데이터 페칭 전략을 개선하기 위해 다음과 같은 변경이 이루어졌습니다:

### 1. React Query 도입
- 서버 데이터 관리를 위한 전문화된 라이브러리인 React Query 도입
- 캐싱, 데이터 동기화, 페이지네이션, 무한 스크롤 등 지원
- 코드 예시:
```jsx
// 데이터 쿼리 사용 예시
const { data, isLoading, isError, error, refetch } = useCVEListQuery({
  page: 0,
  rowsPerPage: 10,
  filters: { status: 'active' }
});

// 데이터 변경 사용 예시 
const deleteMutation = useDeleteCVEMutation();
deleteMutation.mutate(cveId);
```

### 2. Socket.IO 도입
- WebSocket 관리를 위한 Socket.IO 라이브러리 도입
- 실시간 업데이트 및 이벤트 기반 통신 지원
- 코드 예시:
```jsx
// 컴포넌트에서 소켓 사용
const { socket, connected } = useSocketIO();

// 이벤트 구독
useEffect(() => {
  if (!socket || !connected) return;
  
  socket.on('cve:updated', handleCVEUpdated);
  
  return () => {
    socket.off('cve:updated', handleCVEUpdated);
  };
}, [socket, connected]);
```

### 3. Redux에서 React Query로의 마이그레이션 전략
현재 프로젝트에서는 기존 Redux 코드와 새로운 React Query 코드가 공존하는 점진적 마이그레이션을 진행하고 있습니다:

- **1단계 (현재)**: React Query와 Redux 병행 사용
  - 새로운 기능: React Query 사용
  - 기존 기능: Redux와 React Query 동시 사용
  
- **2단계 (예정)**: 주요 컴포넌트 전환
  - CVEList, CVEDetail 등 핵심 컴포넌트 완전 전환
  - 서버 상태는 React Query, 클라이언트 상태는 Context API 또는 Redux로 분리
  
- **3단계 (예정)**: Redux 의존성 제거
  - 모든 서버 상태 관리를 React Query로 이관
  - Redux는 클라이언트 상태 관리에만 사용하거나 필요 없는 경우 제거

### 구현된 주요 컴포넌트 및 훅

1. **커스텀 훅**
   - `useCVEListQuery`: CVE 목록 데이터 관리
   - `useCVEListUpdates`: CVE 목록 실시간 업데이트
   - `useCVEMutation`: CVE 추가/수정/삭제 관리

2. **컨텍스트**
   - `SocketIOContext`: Socket.IO 클라이언트 관리
   - `WebSocketQueryBridge`: Socket.IO 이벤트와 React Query 연결

3. **리팩토링된 컴포넌트**
   - `CVEList`: React Query 기반 데이터 관리
   - `CVEDetail`: React Query와 Socket.IO 통합

## 기술 스택

- React
- Material UI
- Redux
- React Query
- Socket.IO
- Axios

## 설치 및 실행

```bash
# 종속성 설치
npm install

# 개발 모드 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 빌드 테스트
npm run preview
```

## 프로젝트 구조

```
frontend/
├── public/          # 정적 파일
├── src/
│   ├── api/         # API 호출 및 React Query 훅
│   ├── assets/      # 이미지, 폰트 등
│   ├── components/  # 재사용 가능한 컴포넌트
│   ├── contexts/    # React 컨텍스트 (Socket.IO 등)
│   ├── features/    # 기능별 컴포넌트
│   ├── layout/      # 레이아웃 컴포넌트
│   ├── services/    # 서비스 로직 (Socket.IO 등)
│   ├── store/       # Redux 스토어 및 리듀서
│   ├── utils/       # 유틸리티 함수
│   ├── App.jsx      # 메인 앱 컴포넌트
│   └── main.jsx     # 앱 진입점
└── README.md
```

## React Query 사용 가이드

### 기본 사용법

```jsx
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../api/queryKeys';

// 데이터 조회 예시
function MyComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEYS.CVE_LIST],
    queryFn: fetchCVEList,
    staleTime: 60000, // 1분
  });

  if (isLoading) return <div>로딩 중...</div>;
  if (error) return <div>에러: {error.message}</div>;

  return (
    <div>
      {data.map(cve => (
        <div key={cve.id}>{cve.title}</div>
      ))}
    </div>
  );
}
```

### 데이터 변경

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../api/queryKeys';

function EditComponent() {
  const queryClient = useQueryClient();
  
  const { mutate, isLoading } = useMutation({
    mutationFn: updateCVE,
    onSuccess: () => {
      // 성공 시 관련 쿼리 무효화
      queryClient.invalidateQueries([QUERY_KEYS.CVE_DETAIL, cveId]);
      queryClient.invalidateQueries([QUERY_KEYS.CVE_LIST]);
    },
  });
  
  const handleSubmit = (data) => {
    mutate(data);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* 폼 내용 */}
    </form>
  );
}
```

## Socket.IO 통합 가이드

### 기본 설정

Socket.IO는 `SocketIOContext.jsx`에서 초기화되고 관리됩니다. 이 컨텍스트는 다음 기능을 제공합니다:

- 자동 연결 및 재연결
- 인증 토큰 관리
- 연결 상태 관리
- 이벤트 구독 및 발행

### 컴포넌트에서 사용

```jsx
import { useSocketIO } from '../contexts/SocketIOContext';

function MyComponent() {
  const { isConnected, socketIOService } = useSocketIO();
  
  useEffect(() => {
    if (!isConnected) return;
    
    // 이벤트 리스너 등록
    const unsubscribe = socketIOService.on('my-event', handleEvent);
    
    return () => {
      // 정리
      unsubscribe();
    };
  }, [isConnected, socketIOService]);
  
  const handleEvent = (data) => {
    console.log('이벤트 수신:', data);
  };
  
  const sendEvent = () => {
    socketIOService.emit('some-event', { data: 'my-data' });
  };
  
  return (
    <div>
      <p>연결 상태: {isConnected ? '연결됨' : '연결 끊김'}</p>
      <button onClick={sendEvent}>이벤트 전송</button>
    </div>
  );
}
```

### CVE 구독 관리

CVE 상세 정보를 보거나 편집할 때 구독 기능을 사용할 수 있습니다:

```jsx
import { useCVESubscription } from '../contexts/SocketIOContext';

function CVEComponent({ cveId }) {
  const {
    isSubscribed,
    subscribers,
    subscribe,
    unsubscribe,
    isLoading
  } = useCVESubscription(cveId);
  
  return (
    <div>
      <h2>구독자: {subscribers.length}명</h2>
      
      <button 
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={isLoading}
      >
        {isSubscribed ? '구독 해제' : '구독'}
      </button>
      
      <ul>
        {subscribers.map(user => (
          <li key={user.id}>{user.displayName}</li>
        ))}
      </ul>
    </div>
  );
}
```

## WebSocketQueryBridge

`SocketIOQueryBridge` 컴포넌트는 Socket.IO 이벤트를 React Query 캐시 업데이트와 연결합니다. 이 컴포넌트는 `App.jsx`에 이미 포함되어 있으므로, 별도의 설정 없이 실시간 캐시 업데이트가 작동합니다.

주요 기능:
- CVE 생성/업데이트/삭제 시 관련 쿼리 자동 무효화
- 연결 끊김 시 자동 캐시 무효화
- 구독 상태 변경 시 구독자 정보 업데이트

## 여러 탭 간 동기화

React Query와 Socket.IO를 함께 사용하면 여러 브라우저 탭 간에 데이터가 자동으로 동기화됩니다:

1. 한 탭에서 데이터가 변경되면 Socket.IO 이벤트가 서버로 전송됩니다.
2. 서버는 이 이벤트를 모든 연결된 클라이언트에 브로드캐스트합니다.
3. 다른 탭의 `SocketIOQueryBridge`가 이 이벤트를 수신하고 캐시를 무효화합니다.
4. React Query가 무효화된 데이터를 자동으로 다시 조회합니다.

## 문제 해결

### 연결 문제

- Socket.IO 연결 문제가 발생하면 브라우저 콘솔에서 로그 확인
- 인증 토큰이 유효한지 확인
- 개발 서버와 백엔드 서버가 모두 실행 중인지 확인

### 캐시 문제

React Query DevTools(개발 모드에서 자동 활성화)를 사용하여 캐시 상태 확인:
- 쿼리 키가 올바른지 확인
- 데이터가 예상대로 캐시되는지 확인
- 필요한 경우 수동으로 쿼리 무효화하거나 리패치 시도

## 개발자 참고사항

1. 새로운 API 엔드포인트를 추가할 때는 `api/` 디렉토리에 적절한 훅을 구현하세요.
2. 쿼리 키는 `api/queryKeys.js`에 중앙 집중식으로 관리됩니다.
3. Socket.IO 이벤트는 `services/socketio.js`에 상수로 정의되어 있습니다.
4. 컴포넌트의 React Query 로직은 관련 커스텀 훅(예: `useCVEQuery.js`)으로 추상화하는 것이 좋습니다.
