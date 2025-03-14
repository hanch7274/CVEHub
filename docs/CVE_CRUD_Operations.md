# CVE CRUD 작업 문서

이 문서는 CVEHub 애플리케이션에서 CVE(Common Vulnerabilities and Exposures) 데이터를 관리하기 위한 CRUD(Create, Read, Update, Delete) 작업에 대한 가이드입니다.

## 목차

1. [개요](#개요)
2. [파일 구조](#파일-구조)
3. [API 엔드포인트](#api-엔드포인트)
4. [쿼리 함수 (Read)](#쿼리-함수-read)
5. [뮤테이션 함수 (Create, Update, Delete)](#뮤테이션-함수-create-update-delete)
6. [웹소켓 실시간 업데이트](#웹소켓-실시간-업데이트)
7. [사용 예시](#사용-예시)
8. [오류 처리](#오류-처리)
9. [모범 사례](#모범-사례)

## 개요

CVEHub 애플리케이션은 CVE 데이터를 관리하기 위해 React Query를 사용하여 서버와 통신합니다. 코드는 다음과 같이 구성되어 있습니다:

- **쿼리 함수**: `useCVEQuery.js`에 정의된 데이터 조회(Read) 작업
- **뮤테이션 함수**: `useCVEMutation.js`에 정의된 데이터 생성, 수정, 삭제(Create, Update, Delete) 작업
- **서비스 함수**: `cveService.js`에 정의된 실제 API 호출 함수

## 파일 구조

```
frontend/src/api/
├── hooks/
│   ├── useCVEQuery.js     # CVE 데이터 조회 관련 훅
│   └── useCVEMutation.js  # CVE 데이터 변경 관련 훅
├── services/
│   └── cveService.js      # API 호출 함수
└── queryKeys.js           # React Query 캐시 키 정의
```

## API 엔드포인트

CVE 관련 API 엔드포인트는 다음과 같습니다:

| 작업 | 메서드 | 엔드포인트 | 설명 |
|------|--------|------------|------|
| 목록 조회 | GET | `/cves/list` | CVE 목록 조회 (필터링, 페이지네이션 지원) |
| 상세 조회 | GET | `/cves/{cveId}` | 특정 CVE 상세 정보 조회 |
| 생성 | POST | `/cves` | 새로운 CVE 생성 |
| 수정 | PUT | `/cves/{cveId}` | 특정 CVE 전체 정보 수정 |
| 필드 수정 | PATCH | `/cves/{cveId}/{fieldName}` | 특정 CVE의 특정 필드 수정 |
| 삭제 | DELETE | `/cves/{cveId}` | 특정 CVE 삭제 |

> **중요**: API 엔드포인트는 `/api` 접두사 없이 직접 경로를 사용합니다.

## 쿼리 함수 (Read)

`useCVEQuery.js` 파일에는 CVE 데이터 조회를 위한 다음 훅들이 정의되어 있습니다:

### 1. `useCVEList`

CVE 목록을 조회하는 훅입니다.

```javascript
const { data, isLoading, isError } = useCVEList({
  page: 1,
  rowsPerPage: 10,
  filters: {
    status: 'open',
    severity: 'high',
    search: 'keyword'
  }
});
```

### 2. `useCVEDetail`

특정 CVE의 상세 정보를 조회하는 훅입니다.

```javascript
const { data, isLoading, isError } = useCVEDetail(cveId);
```

### 3. `useCVEStats`

CVE 통계 정보를 조회하는 훅입니다.

```javascript
const { data, isLoading, isError } = useCVEStats();
```

### 4. `useCVERealtimeUpdates`

WebSocket을 통한 실시간 CVE 업데이트를 구독하는 훅입니다.

```javascript
useCVERealtimeUpdates();
```

## 뮤테이션 함수 (Create, Update, Delete)

`useCVEMutation.js` 파일에는 CVE 데이터 변경을 위한 다음 훅들이 정의되어 있습니다:

### 1. `useCreateCVE`

새로운 CVE를 생성하는 훅입니다.

```javascript
const { mutate, isLoading, isError } = useCreateCVE();

// 사용 예시
mutate({
  title: 'New Vulnerability',
  description: 'Description of the vulnerability',
  severity: 'high',
  status: 'open'
});
```

### 2. `useUpdateCVE`

CVE 전체 정보를 수정하는 훅입니다.

```javascript
const { mutate, isLoading, isError } = useUpdateCVE();

// 사용 예시
mutate({
  cveId: 'CVE-2023-1234',
  updateData: {
    title: 'Updated Title',
    description: 'Updated description',
    severity: 'critical'
  }
});
```

### 3. `useUpdateCVEField`

CVE의 특정 필드만 수정하는 훅입니다. 낙관적 업데이트를 지원합니다.

```javascript
const { mutate, isLoading, isError } = useUpdateCVEField();

// 사용 예시
mutate({
  cveId: 'CVE-2023-1234',
  fieldName: 'status',
  fieldValue: 'closed'
});
```

### 4. `useUpdateCVEStatus`

CVE 상태만 수정하는 전용 훅입니다.

```javascript
const { mutate, isLoading, isError } = useUpdateCVEStatus();

// 사용 예시
mutate({
  cveId: 'CVE-2023-1234',
  status: 'fixed'
});
```

### 5. `useDeleteCVE`

CVE를 삭제하는 훅입니다.

```javascript
const { mutate, isLoading, isError } = useDeleteCVE();

// 사용 예시
mutate('CVE-2023-1234');
```

## 웹소켓 실시간 업데이트

CVEHub는 WebSocket을 통해 실시간 CVE 업데이트를 지원합니다. 이를 위한 핸들러 함수가 `useCVEMutation.js`에 정의되어 있습니다:

```javascript
const handleRealtimeCVEUpdate = (queryClient) => (event) => {
  // 이벤트 처리 로직
};
```

이 함수는 다음 이벤트 타입을 처리합니다:

- `cve_created`: 새로운 CVE 생성 시
- `cve_updated`: CVE 정보 수정 시
- `cve_deleted`: CVE 삭제 시

## 사용 예시

### 컴포넌트에서 CVE 목록 조회 및 삭제

```javascript
import React, { useState } from 'react';
import { useCVEList } from '../api/hooks/useCVEQuery';
import { useDeleteCVE } from '../api/hooks/useCVEMutation';

const CVEListComponent = () => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const { data, isLoading } = useCVEList({ page, rowsPerPage });
  const deleteMutation = useDeleteCVE();
  
  const handleDelete = (cveId) => {
    if (window.confirm('정말로 이 CVE를 삭제하시겠습니까?')) {
      deleteMutation.mutate(cveId);
    }
  };
  
  if (isLoading) return <div>로딩 중...</div>;
  
  return (
    <div>
      <h1>CVE 목록</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>제목</th>
            <th>심각도</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map(cve => (
            <tr key={cve.id}>
              <td>{cve.id}</td>
              <td>{cve.title}</td>
              <td>{cve.severity}</td>
              <td>{cve.status}</td>
              <td>
                <button onClick={() => handleDelete(cve.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* 페이지네이션 컨트롤 */}
    </div>
  );
};

export default CVEListComponent;
```

### CVE 생성 폼

```javascript
import React, { useState } from 'react';
import { useCreateCVE } from '../api/hooks/useCVEMutation';

const CreateCVEForm = () => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium',
    status: 'open'
  });
  
  const createMutation = useCreateCVE();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData, {
      onSuccess: () => {
        // 폼 초기화
        setFormData({
          title: '',
          description: '',
          severity: 'medium',
          status: 'open'
        });
      }
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <h2>새 CVE 생성</h2>
      
      <div>
        <label>제목:</label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
        />
      </div>
      
      <div>
        <label>설명:</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          required
        />
      </div>
      
      <div>
        <label>심각도:</label>
        <select
          name="severity"
          value={formData.severity}
          onChange={handleChange}
        >
          <option value="low">낮음</option>
          <option value="medium">중간</option>
          <option value="high">높음</option>
          <option value="critical">치명적</option>
        </select>
      </div>
      
      <div>
        <label>상태:</label>
        <select
          name="status"
          value={formData.status}
          onChange={handleChange}
        >
          <option value="open">열림</option>
          <option value="in_progress">진행 중</option>
          <option value="fixed">수정됨</option>
          <option value="closed">닫힘</option>
        </select>
      </div>
      
      <button type="submit" disabled={createMutation.isLoading}>
        {createMutation.isLoading ? '생성 중...' : 'CVE 생성'}
      </button>
    </form>
  );
};

export default CreateCVEForm;
```

## 오류 처리

모든 쿼리 및 뮤테이션 함수는 오류 처리를 내장하고 있습니다. 오류가 발생하면 다음과 같이 처리됩니다:

1. 콘솔에 오류 로깅
2. 사용자에게 toast 알림 표시
3. 필요한 경우 이전 상태로 롤백 (낙관적 업데이트의 경우)

사용자 정의 오류 처리를 추가하려면 다음과 같이 옵션을 전달할 수 있습니다:

```javascript
const mutation = useUpdateCVE({
  onError: (error) => {
    // 사용자 정의 오류 처리
    console.error('사용자 정의 오류 처리:', error);
  }
});
```

## 모범 사례

### 1. 쿼리와 뮤테이션 분리

쿼리(조회) 함수와 뮤테이션(변경) 함수를 별도의 파일로 분리하여 관리합니다:

- `useCVEQuery.js`: 조회 관련 훅만 포함
- `useCVEMutation.js`: 변경 관련 훅만 포함

### 2. 적절한 캐시 무효화

데이터 변경 후에는 관련된 쿼리 캐시를 무효화하여 최신 데이터를 보여줍니다:

```javascript
// 목록 쿼리 무효화
queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });

// 특정 CVE 상세 쿼리 무효화
queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
```

### 3. 낙관적 업데이트 활용

사용자 경험을 향상시키기 위해 낙관적 업데이트를 활용합니다:

```javascript
// 낙관적 업데이트 예시
onMutate: async ({ cveId, fieldName, fieldValue }) => {
  // 이전 쿼리 취소
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
  
  // 이전 상태 저장
  const previousData = queryClient.getQueryData(QUERY_KEYS.CVE.detail(cveId));
  
  // 낙관적 업데이트 적용
  queryClient.setQueryData(
    QUERY_KEYS.CVE.detail(cveId),
    {
      ...previousData,
      [fieldName]: fieldValue
    }
  );
  
  return { previousData };
}
```

### 4. 로깅 활용

디버깅 및 문제 해결을 위해 적절한 로깅을 활용합니다:

```javascript
logger.info('useCreateCVE', '생성 요청', { data: cveData });
logger.error('useUpdateCVE', '업데이트 중 오류 발생', { error: error.message });
```

### 5. 사용자 피드백 제공

작업 결과에 대한 사용자 피드백을 제공합니다:

```javascript
toast.success('CVE가 성공적으로 생성되었습니다.');
toast.error(`CVE 삭제 중 오류가 발생했습니다: ${error.message}`);
```

---

이 문서는 CVEHub 애플리케이션의 CVE CRUD 작업에 대한 가이드입니다. 추가 질문이나 문제가 있으면 개발팀에 문의하세요.
