# CVEHub 아키텍처 문서

## 1. 시스템 개요

CVEHub는 CVE(Common Vulnerabilities and Exposures) 정보를 효율적으로 관리하고 실시간으로 공유하는 시스템입니다. 이 문서는 현재 구현된 아키텍처와 API 흐름을 정리하고, 특히 React Query와 Socket.IO 기반의 실시간 통신에 중점을 둡니다.

## 2. 전체 시스템 아키텍처

### 2.1 아키텍처 구조

```
CVEHub
│
├── backend/               # FastAPI 백엔드
│   └── app/
│       ├── api/           # API 엔드포인트
│       ├── core/          # 핵심 기능 (Socket.IO, 의존성)
│       ├── models/        # 데이터 모델
│       ├── repositories/  # 데이터 액세스 레이어
│       └── services/      # 비즈니스 로직
│
└── frontend/              # React 프론트엔드
    └── src/
        ├── api/           # API 클라이언트
        ├── contexts/      # React 컨텍스트
        ├── features/      # 기능별 컴포넌트
        ├── services/      # 서비스 레이어
        └── utils/         # 유틸리티 함수
```

### 2.2 데이터 흐름 다이어그램

```
[프론트엔드]                              [백엔드]
+-------------+                        +-------------+
|             |  1. HTTP 요청(React Query) |             |
| React UI    | -----------------------> | FastAPI     |
|             | <----------------------- | 엔드포인트   |
|             |  2. HTTP 응답            |             |
+-------------+                        +-------------+
       |                                      |
       | 3. 상태 변경 시 Socket.IO 이벤트      | 4. 데이터베이스 조작
       v                                      v
+-------------+                        +-------------+
| Socket.IO   | <----------------------> | Socket.IO   |
| 클라이언트   |  5. 실시간 양방향 통신      | 서버        |
+-------------+                        +-------------+
```

## 3. 백엔드 아키텍처

### 3.1 주요 컴포넌트

#### 3.1.1 FastAPI 애플리케이션 (main.py)

FastAPI를 사용하여 RESTful API 엔드포인트를 제공하고, Socket.IO 서버와 통합됩니다.

```python
# backend/app/main.py (간략화된 예시)
from fastapi import FastAPI
from .api.api import api_router
from .api.socketio_routes import router as socketio_router, sio_app

app = FastAPI()
app.include_router(api_router)
app.mount("/socket.io", socketio_router)
```

#### 3.1.2 Socket.IO 관리자 (socketio_manager.py)

Socket.IO 연결 및 이벤트를 관리하는 핵심 컴포넌트입니다.

```python
# backend/app/core/socketio_manager.py (간략화된 예시)
class SocketIOManager:
    def __init__(self):
        self.sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
        self.user_connections = {}
        self.cve_subscribers = {}
    
    async def broadcast_cve_update(self, cve_id, data, event_type=WSMessageType.CVE_UPDATED):
        """CVE 업데이트를 모든 구독자에게 브로드캐스트합니다."""
        # 구현 생략
    
    async def subscribe_cve(self, sid, data):
        """사용자를 특정 CVE의 구독자로 등록합니다."""
        # 구현 생략
```

#### 3.1.3 서비스 레이어 (cve_service.py)

비즈니스 로직을 처리하는 서비스 클래스입니다.

```python
# backend/app/services/cve_service.py (간략화된 예시)
class CVEService:
    async def create_cve(self, cve_data, user):
        """새 CVE 레코드를 생성합니다."""
        # 구현 생략
    
    async def update_cve(self, cve_id, update_data, user):
        """CVE 레코드를 업데이트하고 구독자에게 알립니다."""
        # 구현 생략
        await socketio_manager.broadcast_cve_update(cve_id, update_data)
```

### 3.2 의존성 주입 시스템

FastAPI의 의존성 주입 시스템을 활용하여 서비스 및 리포지토리를 제공합니다.

```python
# backend/app/core/dependencies.py
from fastapi import Depends
from ..services.cve_service import CVEService

def get_cve_service():
    return CVEService()

# 사용 예시 (API 라우터)
@router.get("/cves/{cve_id}")
async def get_cve(cve_id: str, cve_service: CVEService = Depends(get_cve_service)):
    return await cve_service.get_cve(cve_id)
```

## 4. 프론트엔드 아키텍처

### 4.1 주요 컴포넌트

#### 4.1.1 API 서비스 (cveService.js)

백엔드 API와 통신하는 서비스 레이어입니다.

```javascript
// frontend/src/api/services/cveService.js (간략화된 예시)
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export const getCVE = async (cveId) => {
  const response = await axios.get(`${API_ENDPOINTS.CVE}/${cveId}`);
  return response.data;
};

export const updateCVE = async (cveId, updateData) => {
  const response = await axios.patch(`${API_ENDPOINTS.CVE}/${cveId}`, updateData);
  return response.data;
};
```

#### 4.1.2 Socket.IO 서비스 (socketio.js)

실시간 통신을 위한 Socket.IO 클라이언트 래퍼입니다.

```javascript
// frontend/src/services/socketio/socketio.js (간략화된 예시)
import { io } from 'socket.io-client';
import { CONFIG } from '../../utils/config';

class SocketIOService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }
  
  connect() {
    // Socket.IO 연결 구현
  }
  
  subscribe(cveId) {
    if (this.connected && cveId) {
      this.socket.emit('subscribe_cve', { cve_id: cveId });
    }
  }
}

export const socketIOService = new SocketIOService();
```

#### 4.1.3 React Query 훅 (useCVEQuery.js)

데이터 페칭 및 캐싱을 위한 React Query 훅입니다.

```javascript
// frontend/src/api/hooks/useCVEQuery.js (간략화된 예시)
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getCVE, updateCVE } from '../services/cveService';

export const useCVEQuery = (cveId) => {
  return useQuery(['cve', cveId], () => getCVE(cveId), {
    staleTime: 60000, // 1분
    cacheTime: 300000 // 5분
  });
};

export const useCVEMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation(
    ({ cveId, data }) => updateCVE(cveId, data),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries(['cve', variables.cveId]);
      }
    }
  );
};
```

### 4.2 상태 관리 전략

#### 4.2.1 React Query를 사용한 서버 상태 관리

```javascript
// 컴포넌트 내 사용 예시
function CVEDetail({ cveId }) {
  const { data: cve, isLoading, error } = useCVEQuery(cveId);
  const mutation = useCVEMutation();
  
  const handleStatusUpdate = (newStatus) => {
    mutation.mutate({ 
      cveId, 
      data: { status: newStatus } 
    });
  };
  
  // 렌더링 로직
}
```

#### 4.2.2 Socket.IO 이벤트를 통한 실시간 업데이트

```javascript
// 컴포넌트 내 사용 예시
function CVEDetail({ cveId }) {
  const queryClient = useQueryClient();
  const { data: cve } = useCVEQuery(cveId);
  
  useEffect(() => {
    // CVE 구독 설정
    socketIOService.subscribe(cveId);
    
    // CVE 업데이트 이벤트 리스너
    const handleUpdate = (updateData) => {
      if (updateData.cveId === cveId) {
        queryClient.invalidateQueries(['cve', cveId]);
      }
    };
    
    socketIOService.on('cve_updated', handleUpdate);
    
    return () => {
      socketIOService.off('cve_updated', handleUpdate);
    };
  }, [cveId, queryClient]);
  
  // 렌더링 로직
}
```

## 5. API 구조 및 통신 흐름

### 5.1 RESTful API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|------------|-------|------|
| `/api/cves` | GET | CVE 목록 조회 |
| `/api/cves/{cve_id}` | GET | 특정 CVE 조회 |
| `/api/cves` | POST | 새 CVE 생성 |
| `/api/cves/{cve_id}` | PATCH | CVE 업데이트 |
| `/api/cves/{cve_id}` | DELETE | CVE 삭제 |
| `/api/users/me` | GET | 현재 사용자 정보 조회 |
| `/api/auth/token` | POST | 인증 토큰 발급 |

### 5.2 Socket.IO 이벤트

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `connect` | 클라이언트 → 서버 | 연결 수립 |
| `connect_ack` | 서버 → 클라이언트 | 연결 확인 |
| `subscribe_cve` | 클라이언트 → 서버 | CVE 구독 요청 |
| `cve_updated` | 서버 → 클라이언트 | CVE 업데이트 알림 |
| `notification` | 서버 → 클라이언트 | 일반 알림 메시지 |

### 5.3 통신 흐름 예시: CVE 업데이트

1. **사용자가 UI에서 CVE 상태 변경**:
   ```javascript
   mutation.mutate({ cveId: 'CVE-2023-1234', data: { status: 'confirmed' } });
   ```

2. **React Query가 서버에 PATCH 요청 전송**:
   ```
   PATCH /api/cves/CVE-2023-1234
   { "status": "confirmed" }
   ```

3. **백엔드에서 CVE 업데이트 처리**:
   ```python
   updated_cve = await cve_service.update_cve(cve_id, update_data, current_user)
   ```

4. **업데이트된 CVE 정보를 구독자에게 브로드캐스트**:
   ```python
   await socketio_manager.broadcast_cve_update(cve_id, updated_cve)
   ```

5. **Socket.IO가 구독 중인 모든 클라이언트에 이벤트 전송**:
   ```
   Event: cve_updated
   Data: { cveId: 'CVE-2023-1234', status: 'confirmed', ... }
   ```

6. **클라이언트에서 이벤트 수신 및 캐시 무효화**:
   ```javascript
   socketIOService.on('cve_updated', (data) => {
     queryClient.invalidateQueries(['cve', data.cveId]);
   });
   ```

7. **React Query가 자동으로 최신 데이터 페칭 및 UI 업데이트**:
   ```javascript
   // 캐시가 무효화되면 자동으로 재요청
   const { data: cve } = useCVEQuery(cveId);
   ```

## 6. 캐시 관리 전략

### 6.1 서버 측 캐시

MongoDB 쿼리 결과의 메모리 내 캐싱을 통해 성능을 최적화합니다.

### 6.2 클라이언트 측 캐시 (React Query)

```javascript
// queryClient 설정 (main.js)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1분 후 데이터 만료
      cacheTime: 5 * 60 * 1000, // 5분 동안 캐시 유지
      refetchOnWindowFocus: false, // 윈도우 포커스 시 자동 리페치 비활성화
      retry: 1, // 실패 시 1번 재시도
    },
  },
});
```

### 6.3 캐시 무효화 전략

Socket.IO 이벤트 수신 시 관련 쿼리 캐시를 무효화합니다.

```javascript
// 컴포넌트나 글로벌 리스너에서 사용
socketIOService.on('cve_updated', (data) => {
  // 해당 CVE의 캐시만 무효화
  queryClient.invalidateQueries(['cve', data.cveId]);
  
  // 또는 CVE 목록 쿼리도 함께 무효화
  queryClient.invalidateQueries('cves');
});
```

## 7. 인증 및 보안

### 7.1 JWT 기반 인증

```javascript
// frontend/src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

### 7.2 Socket.IO 인증

```javascript
// frontend/src/services/socketio/socketio.js
connect() {
  const token = localStorage.getItem('token');
  
  this.socket = io(CONFIG.SOCKET_URL, {
    auth: {
      token: token
    }
  });
}
```

## 8. 개선 방안

### 8.1 HTTP 메서드 사용의 일관성

백엔드와 프론트엔드 간의 HTTP 메서드 사용을 일관되게 유지합니다. 특히 PATCH 메서드를 사용하여 부분 업데이트를 수행합니다.

```javascript
// 일관된 PATCH 메서드 사용
export const updateCVE = async (cveId, updateData) => {
  const response = await axios.patch(`${API_ENDPOINTS.CVE}/${cveId}`, updateData);
  return response.data;
};
```

### 8.2 프론트엔드 코드 최적화

```javascript
// 최적화된 캐시 무효화 함수
export const invalidateCache = (queryClient, cveId = null) => {
  console.log(`[Cache] Invalidating cache for ${cveId || 'all CVEs'}`);
  
  if (cveId) {
    // 특정 CVE 캐시만 무효화
    queryClient.invalidateQueries(['cve', cveId]);
  } else {
    // 모든 CVE 관련 쿼리 무효화
    queryClient.invalidateQueries('cves');
  }
  
  // 캐시 통계 로깅 (디버깅용)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache] Current cache statistics:', queryClient.getQueryCache().getAll());
  }
};
```

### 8.3 CVE ID와 필드 이름 표준화

프론트엔드와 백엔드 간의 필드 이름 불일치 문제를 해결합니다.

```javascript
// frontend/src/utils/transformers.js
export const normalizeKeys = (data, direction = 'toBackend') => {
  if (!data || typeof data !== 'object') return data;
  
  const keyMap = {
    cveId: 'cve_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // 기타 필드 매핑
  };
  
  const result = {};
  
  if (direction === 'toBackend') {
    // 프론트엔드 → 백엔드 변환 (camelCase → snake_case)
    for (const [key, value] of Object.entries(data)) {
      const backendKey = keyMap[key] || key;
      result[backendKey] = normalizeKeys(value, direction);
    }
  } else {
    // 백엔드 → 프론트엔드 변환 (snake_case → camelCase)
    for (const [key, value] of Object.entries(data)) {
      const frontendKey = Object.entries(keyMap).find(([_, v]) => v === key)?.[0] || key;
      result[frontendKey] = normalizeKeys(value, direction);
    }
  }
  
  return result;
};
```

## 9. 결론

CVEHub 프로젝트는 FastAPI와 React를 기반으로 하며, React Query와 Socket.IO를 통해 효율적인 데이터 관리와 실시간 통신을 구현하고 있습니다. 이 문서에서 설명한 아키텍처와 통신 흐름을 이해하고 적용함으로써, 개발 팀은 일관된 방식으로 프로젝트를 확장하고 유지보수할 수 있습니다.
