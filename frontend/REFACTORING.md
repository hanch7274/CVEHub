# React Query 및 Socket.IO 리팩토링 가이드

본 문서는 React Query와 Socket.IO를 사용한 리팩토링 후 삭제 가능한 코드와 파일에 대한 가이드입니다.

## 리팩토링 완료 후 삭제 가능한 파일

### 1. WebSocket 관련 파일
- `src/services/socketio.js`
  - Socket.IO 서비스 클래스가 `SocketIOContext.jsx`로 통합됨
  - 모든 기능이 React 컨텍스트로 이동하여 더 이상 필요하지 않음

### 2. Redux 관련 코드

#### 서버 상태 관리 리듀서 및 액션
- `src/store/slices/cveSlice.js`에서 다음 부분:
  - API 통신 액션: `fetchCVEList`, `fetchCVEDetail`, `createCVE`, `updateCVE`, `deleteCVE` 등 
  - 서버 데이터 상태: `cves`, `cveDetail`, `loading`, `error` 등 관련 리듀서
  - 페이지네이션: `page`, `rowsPerPage` 등 서버 페이지네이션 관련 상태

#### Redux 셀렉터
- `src/store/selectors/cveSelectors.js`
  - 서버 데이터 관련 셀렉터 함수들

### 3. 컴포넌트 내 중복 코드

#### CVEList.jsx
- Redux 상태 관리와 관련된 코드:
  ```jsx
  const { cves, loading, error } = useSelector(...);
  const dispatch = useDispatch();
  // fetchCVEs, refreshCVEList 등 Redux 액션 디스패치 코드
  ```
- 직접 수행하는 데이터 로딩 로직:
  ```jsx
  useEffect(() => {
    dispatch(fetchCVEList(...));
  }, [...]);
  ```

#### CVEDetail.jsx
- Redux 상태와 관련된 코드:
  ```jsx
  const { cveDetail, loading, error } = useSelector(...);
  const dispatch = useDispatch();
  // fetchCVEDetail, updateCVE 등 액션 디스패치 코드
  ```
- WebSocket 직접 호출 코드 (이제 useCVEListUpdates 훅으로 대체)

### 4. 기존 WebSocket 관련 컨텍스트 및 훅

#### WebSocketContext.jsx
- 다음 함수와 로직:
  - `useCVEWebSocketUpdate`
  - `useCVESubscription`의 구현 (이제 SocketIOContext.jsx에 통합)
  - WebSocket 연결 및 메시지 처리 로직

## 점진적 마이그레이션 단계

### 1단계: 컴포넌트 마이그레이션 (현재)
- React Query와 Redux 병행 사용
- 새로운 컴포넌트는 React Query 사용
- 기존 컴포넌트는 점진적으로 마이그레이션

### 2단계: 코드 정리
- 모든 컴포넌트 마이그레이션 완료 후
- 불필요한 Redux 코드 삭제
- 불필요한 WebSocket 코드 삭제

### 3단계: 의존성 제거
- Redux의 서버 상태 관련 의존성 제거
- WebSocket 서비스 제거
- 필요 시 Redux를 클라이언트 상태 관리에만 제한 사용

## 코드 삭제 시 주의사항

1. **점진적으로 진행하세요**: 한 번에 모든 코드를 삭제하지 말고, 컴포넌트 별로 테스트하며 진행하세요.

2. **테스트 커버리지를 확인하세요**: 코드 삭제 전후로 테스트를 실행하여 기능이 올바르게 작동하는지 확인하세요.

3. **의존성을 조심하세요**: 삭제하려는 코드가 다른 부분에서 참조되고 있는지 확인하세요.

4. **버전 관리를 활용하세요**: 대규모 삭제 전에 깃 브랜치를 만들어 작업하세요.

5. **리팩토링 완료 확인**: 모든 컴포넌트가 React Query로 마이그레이션되었는지 확인 후 삭제를 진행하세요.

## 삭제 가능 여부 체크리스트

각 파일 삭제 전에 다음 사항을 확인하세요:

- [ ] React Query 기반 대체 기능이 구현되어 있는가?
- [ ] 모든 컴포넌트가 새 기능을 사용하도록 업데이트되었는가?
- [ ] 기존 코드에 대한 참조가 남아있지 않은가?
- [ ] 새 구현이 모든 기존 기능을 포함하는가?
- [ ] 테스트를 통해 기능이 정상 작동하는지 확인했는가? 