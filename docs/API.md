# CVEHub API 문서

## 기본 정보
- Base URL: `http://localhost:8000`
- API 버전: v1
- Content-Type: `application/json`

## 인증
모든 API 요청은 Bearer 토큰 인증이 필요합니다.
```
Authorization: Bearer {access_token}
```

### 토큰 관리
1. **토큰 만료**
   - Access Token 만료 시간: 7일
   - 만료된 토큰으로 요청 시 401 Unauthorized 응답
   - 만료 시 재로그인 필요

2. **토큰 갱신**
   - 현재는 자동 갱신 기능 없음
   - 만료 전에 재로그인하여 새 토큰 발급 필요

3. **토큰 저장**
   - 클라이언트: LocalStorage에 저장
   - 키: `accessToken`
   - 리프레시 토큰 키: `refreshToken`

4. **토큰 검증 실패 시나리오**
   - 토큰 없음: 401 Unauthorized
   - 토큰 만료: 401 Unauthorized ("Token has expired")
   - 잘못된 토큰: 401 Unauthorized ("Could not validate credentials")

## 인증 API

### 로그인
```http
POST /auth/token
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=userpassword
```

#### 응답
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "id": "user_id",
    "username": "username",
    "email": "user@example.com"
  }
}
```

### 토큰 갱신
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJ..."
}
```

#### 응답
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### 로그아웃
```http
POST /auth/logout
Authorization: Bearer <access_token>
```

#### 응답
```json
{
  "message": "Successfully logged out"
}
```

### 현재 사용자 정보 조회
```http
GET /auth/me
Authorization: Bearer <access_token>
```

#### 응답
```json
{
  "id": "user_id",
  "username": "username",
  "email": "user@example.com"
}
```

## 에러 응답
### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 422 Unprocessable Entity
```json
{
  "detail": "Incorrect username or password"
}
```

## 엔드포인트

### CVE

#### CVE 목록 조회
- **GET** `/cve`
- Query Parameters:
  - `skip`: number (default: 0)
  - `limit`: number (default: 10)
  - `status`: string (optional)
- Response:
```json
{
  "items": [
    {
      "id": "string",
      "cve_id": "string",
      "title": "string",
      "description": "string",
      "status": "string",
      "published_date": "string",
      "references": [],
      "pocs": [],
      "snort_rules": [],
      "comments": []
    }
  ],
  "total": 0,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

#### CVE 검색
- **GET** `/cve/search/{query}`
- Query Parameters:
  - `skip`: number (default: 0)
  - `limit`: number (default: 10)
- Response: 동일한 형식의 CVE 목록

#### CVE 생성
- **POST** `/cve`
```json
{
  "cve_id": "string",
  "title": "string",
  "description": "string",
  "status": "string",
  "published_date": "string",
  "references": [],
  "pocs": [],
  "snort_rules": []
}
```

#### CVE 수정
- **PATCH** `/cve/{cve_id}`
```json
{
  "title": "string",
  "description": "string",
  "status": "string",
  "references": [],
  "pocs": [],
  "snort_rules": []
}
```

### 댓글 (Comments)

#### 댓글 목록 조회
- **GET** `/cves/{cve_id}/comments`
- Query Parameters:
  - `skip`: number (default: 0)
  - `limit`: number (default: 10)
- Response:
```json
{
  "items": [
    {
      "id": "string",
      "content": "string",
      "username": "string",
      "parent_id": "string",
      "depth": 0,
      "is_deleted": false,
      "created_at": "string",
      "updated_at": "string",
      "mentions": []
    }
  ],
  "total": 0,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

#### 댓글 수 조회
- **GET** `/cves/{cve_id}/comments/count`
- Response:
```json
{
  "total": 0,
  "active": 0
}
```

#### 댓글 작성 제한
- 최대 댓글 깊이: 10
- 초과 시 응답:
```json
{
  "detail": "Maximum comment depth (10) exceeded"
}
```

#### 댓글 작성
- **POST** `/cves/{cve_id}/comments`
```json
{
  "content": "string",
  "parent_id": "string",  // 대댓글인 경우
  "depth": number,        // 자동 계산됨 (0-9)
  "mentions": []
}
```

#### 댓글 수정
- **PATCH** `/cves/{cve_id}/comments/{comment_id}`
```json
{
  "content": "string",
  "mentions": []
}
```

#### 댓글 삭제
- **DELETE** `/cves/{cve_id}/comments/{comment_id}`
- Response: HTTP 204 No Content

### 알림 (Notification)

#### 알림 목록 조회
- **GET** `/notifications`
- Query Parameters:
  - `skip`: number (default: 0)
  - `limit`: number (default: 10)
- Response:
```json
{
  "items": [
    {
      "id": "string",
      "recipient_id": "string",
      "sender_id": "string",
      "content": "string",
      "is_read": false,
      "created_at": "string"
    }
  ],
  "total": 0
}
```

#### 읽지 않은 알림 개수
- **GET** `/notifications/unread-count`
- Response:
```json
{
  "count": 0
}
```

#### 알림 읽음 처리
- **PATCH** `/notifications/{id}/read`
- Response: 업데이트된 알림 객체

#### 모든 알림 읽음 처리
- **PATCH** `/notifications/read-all`
- Response:
```json
{
  "message": "All notifications marked as read"
}
```

### WebSocket

#### 연결
- **WS** `/ws`
- Query Parameters:
  - `token`: string (access_token)

#### 멀티 탭/브라우저 지원
- 동일한 사용자가 여러 탭이나 브라우저에서 동시에 연결 가능
- 각 연결은 독립적으로 관리됨
- 한 탭의 연결이 끊어져도 다른 탭의 연결은 유지됨
- 모든 연결에 동일한 메시지가 전송됨

#### 메시지 타입

1. **연결 관련 메시지**

- Connected (서버 → 클라이언트)
```json
{
  "type": "connected",
  "data": {
    "user_id": "string",
    "timestamp": "string"
  }
}
```

- Connect ACK (클라이언트 → 서버)
```json
{
  "type": "connect_ack",
  "data": {
    "timestamp": "string"
  }
}
```

2. **알림 메시지**

- 알림 수신 (서버 → 클라이언트)
```json
{
  "type": "notification",
  "data": {
    "id": "string",
    "content": "string",
    "sender_username": "string",
    "cve_id": "string",
    "comment_id": "string",
    "comment_content": "string",
    "created_at": "string"
  }
}
```

- 알림 읽음 처리 (클라이언트 → 서버)
```json
{
  "type": "notification_read",
  "data": {
    "notification_id": "string",
    "timestamp": "string"
  }
}
```

- 모든 알림 읽음 처리 (클라이언트 → 서버)
```json
{
  "type": "all_notifications_read",
  "data": {
    "timestamp": "string"
  }
}
```

3. **연결 유지 메시지**

- Ping (클라이언트 → 서버)
```json
{
  "type": "ping",
  "data": {
    "timestamp": "string",
  }
}
```

- Pong (서버 → 클라이언트)
```json
{
  "type": "pong",
  "data": {
    "timestamp": "string",
  }
}
```

4. **종료 메시지**

- Close (양방향)
```json
{
  "type": "close",
  "data": {
    "timestamp": "string",
    "reason": "string"
  }
}
```

#### 에러 메시지
```json
{
  "type": "error",
  "data": {
    "code": "number",
    "message": "string",
    "timestamp": "string"
  }
}
```

#### 에러 코드
- 4001: 인증 실패
- 4002: 잘못된 메시지 형식
- 4003: 내부 서버 오류

#### 연결 수립 과정
```
Client                      Server
  |                          |
  |------ WebSocket -------->|  1. 초기 WebSocket 연결 요청
  |                          |     (token 포함)
  |                          |
  |<----- connected ---------|  2. 서버가 연결 성공 메시지 전송
  |                          |
  |------ connect_ack ------>|  3. 클라이언트가 ACK 전송
  |                          |     (이후 ping/pong 시작)
```

#### 주의사항
1. 모든 메시지는 JSON 형식이어야 합니다.
2. 모든 메시지에는 `type`과 `data` 필드가 필수입니다.
3. `timestamp`는 ISO 8601 형식(UTC)이어야 합니다.
4. 연결이 끊어진 경우 클라이언트는 자동으로 재연결을 시도합니다 (최대 5회).
5. ping/pong 메시지는 30초 간격으로 전송됩니다.
6. 60초 동안 pong 응답이 없으면 해당 연결이 종료됩니다.
7. 동일한 사용자의 여러 연결이 허용되며, 각 연결은 독립적으로 관리됩니다.
8. 모든 알림과 업데이트는 사용자의 모든 활성 연결에 전송됩니다.

## 에러 응답
모든 API는 다음과 같은 형식의 에러 응답을 반환합니다:
```json
{
  "detail": "에러 메시지"
}
```

## 상태 코드
- 200: 성공
- 201: 생성 성공
- 400: 잘못된 요청
- 401: 인증 실패
- 403: 권한 없음
- 404: 리소스 없음
- 422: 유효성 검사 실패
- 500: 서버 오류

# API 규칙

## 케이스 변환 규칙

### 자동 변환
프로젝트에서는 axios 인터셉터를 통해 자동으로 케이스 변환이 이루어집니다:

1. **요청 시 (Request)**
   - 프론트엔드: 카멜 케이스 (예: `parentId`, `createdAt`)
   - 백엔드로 전송 시: 자동으로 스네이크 케이스로 변환 (예: `parent_id`, `created_at`)
   - 예외: `application/x-www-form-urlencoded` 타입의 요청

2. **응답 시 (Response)**
   - 백엔드: 스네이크 케이스 (예: `user_id`, `is_active`)
   - 프론트엔드 수신 시: 자동으로 카멜 케이스로 변환 (예: `userId`, `isActive`)

### 사용 방법
```javascript
// 올바른 사용 예시
const commentData = {
  content: "내용",
  parentId: "123",  // 자동으로 parent_id로 변환됨
  isDeleted: false  // 자동으로 is_deleted로 변환됨
};

await api.post('/comments', commentData);

// 잘못된 사용 예시 - 직접 스네이크 케이스 사용하지 않기
const wrongData = {
  content: "내용",
  parent_id: "123",  // ❌ 직접 스네이크 케이스 사용
  is_deleted: false  // ❌ 직접 스네이크 케이스 사용
};
```

### 주의사항
1. 프론트엔드 코드에서는 항상 카멜 케이스를 사용합니다.
2. 케이스 변환은 axios 인터셉터에서 자동으로 처리되므로, 직접 변환하지 않습니다.
3. form-urlencoded 형식의 요청(예: 로그인)은 자동 변환에서 제외됩니다.

## API 엔드포인트
...
