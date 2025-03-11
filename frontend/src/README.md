# Frontend 개발 가이드

## React Query 도입 가이드

### 1. 개요

프로젝트의 데이터 로딩 및 상태 관리를 위해 Redux에서 React Query로 점진적으로 마이그레이션을 진행 중입니다. 이 문서는 새로운 컴포넌트 개발 및 기존 컴포넌트 수정 시 React Query를 활용하는 방법을 설명합니다.

### 2. React Query 사용 목적

- **데이터 페칭 로직 단순화**: 복잡한 로딩/에러 상태 자동 관리
- **캐싱 전략 향상**: 자동 실패 시 재시도, 캐시 TTL, 선언적 무효화
- **서버 상태와 클라이언트 상태 분리**: 관심사 분리를 통한 코드 유지보수성 향상
- **웹소켓 연동**: 실시간 업데이트와 캐시 무효화 자동화

### 3. 기본 사용법

#### 3.1 쿼리 사용하기 (GET 요청)

```jsx
import { useCVEDetail } from '../api/hooks/useCVEQuery';

const MyComponent = ({ cveId }) => {
  const {
    data,                // 조회된 데이터
    isLoading,           // 로딩 상태
    isError,             // 에러 상태
    error,               // 에러 객체
    refetch              // 수동으로 다시 조회하는 함수
  } = useCVEDetail(cveId, {
    enabled: !!cveId     // 쿼리 활성화 조건
  });
  
  if (isLoading) return <Loading />;
  if (isError) return <Error message={error.message} />;
  
  return <div>{data.title}</div>;
};
```

#### 3.2 뮤테이션 사용하기 (POST, PUT, DELETE 요청)

```jsx
import { useCVEUpdate } from '../api/hooks/useCVEQuery';

const EditComponent = ({ cveId }) => {
  const { mutate, isLoading } = useCVEUpdate();
  
  const handleSubmit = (data) => {
    mutate({ cveId, data }, {
      onSuccess: (result) => {
        // 성공 시 처리
      },
      onError: (error) => {
        // 실패 시 처리
      }
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* 폼 내용 */}
      <button type="submit" disabled={isLoading}>저장</button>
    </form>
  );
};
```

#### 3.3 WebSocket 이벤트와 연동하기

WebSocketContext와 React Query는 자동으로 연동되어 있습니다. WebSocket 이벤트가 발생하면 관련 쿼리가 자동으로 무효화됩니다.

```jsx
import { useWebSocketContext } from '../contexts/WebSocketContext';

const SubscribedComponent = ({ cveId }) => {
  const { isConnected } = useWebSocketContext();
  
  // WebSocket 연결 상태에 따른 UI 표시
  return (
    <div>
      {isConnected ? '실시간 업데이트 활성화' : '오프라인 모드'}
    </div>
  );
};
```

### 4. 마이그레이션 가이드

#### 4.1 단계별 마이그레이션

1. 새로운 기능은 React Query로 개발
2. 기존 Redux 로직은 점진적으로 React Query로 교체
3. 기존 컴포넌트 리팩토링 시 Redux 의존성 제거

#### 4.2 마이그레이션 예시 (CVEDetail 컴포넌트)

기존 코드:
```jsx
const CVEDetail = ({ cveId }) => {
  const dispatch = useDispatch();
  const cve = useSelector(selectCVEDetail);
  const loading = useSelector(selectCVELoading);
  const error = useSelector(selectCVEError);
  
  useEffect(() => {
    if (cveId) {
      dispatch(fetchCVEDetail(cveId));
    }
  }, [cveId, dispatch]);
  
  // 렌더링 로직...
};
```

React Query로 변환:
```jsx
const CVEDetail = ({ cveId }) => {
  const {
    data: cve,
    isLoading: loading,
    isError,
    error,
    refetch
  } = useCVEDetail(cveId, {
    enabled: !!cveId
  });
  
  // 렌더링 로직...
};
```

### 5. 주요 Custom Hooks

#### 5.1 CVE 관련 Hook

- `useCVEList`: CVE 목록 조회
- `useCVEDetail`: CVE 상세 정보 조회
- `useCVERefresh`: CVE 데이터 강제 새로고침
- `useCVEUpdate`: CVE 정보 업데이트
- `useCVEFieldUpdate`: CVE 특정 필드 업데이트

#### 5.2 WebSocket 관련 Hook

- `useWebSocketContext`: WebSocket 연결 상태 및 기능 제공
- `useSubscription`: 특정 엔티티(CVE 등) 구독 관리
- `useCVEWebSocketUpdate`: WebSocket을 통한 CVE 업데이트 관리

### 6. 개발 도구

React Query DevTools을 사용하여 쿼리 상태를 시각적으로 확인할 수 있습니다. 개발 모드에서는 자동으로 하단에 표시됩니다.

### 7. 추가 리소스

- [TanStack Query 공식 문서](https://tanstack.com/query/latest/docs/react/overview)
- [React Query로 서버 상태 관리하기](https://tkdodo.eu/blog/practical-react-query)
- [React Query와 TypeScript](https://tkdodo.eu/blog/react-query-and-type-script)

### 8. 진행 상황

- [x] React Query 설정 및 기본 인프라 구축
- [x] CVE 관련 API 훅 구현
- [x] WebSocket 통합 구현
- [x] CVEDetail 컴포넌트 마이그레이션
- [ ] CVEList 컴포넌트 마이그레이션
- [ ] 기타 컴포넌트 마이그레이션 