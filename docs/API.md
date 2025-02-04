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

#### 댓글 작성
- **POST** `/cves/{cve_id}/comments`
```json
{
  "content": "string",
  "parent_id": "string",
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
- **GET** `/notification`
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
- **GET** `/notification/unread-count`
- Response:
```json
{
  "count": 0
}
```

#### 알림 읽음 처리
- **PATCH** `/notification/{id}/read`
- Response: 업데이트된 알림 객체

#### 모든 알림 읽음 처리
- **PATCH** `/notification/read-all`
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
  - `session_id`: string (UUID v4 format)

#### 메시지 타입

1. **연결 관련 메시지**

- Connected (서버 → 클라이언트)
```json
{
  "type": "connected",
  "data": {
    "requires_ack": true,
    "session_id": "string",
    "timestamp": "string"
  }
}
```

- Connect ACK (클라이언트 → 서버)
```json
{
  "type": "connect_ack",
  "data": {
    "sessionId": "string",
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
    "sessionId": "string"
  }
}
```

- Pong (서버 → 클라이언트)
```json
{
  "type": "pong",
  "data": {
    "timestamp": "string",
    "sessionId": "string"
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
    "sessionId": "string",
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
  |                          |     (token과 session_id 포함)
  |                          |
  |<----- connected ---------|  2. 서버가 연결 성공 메시지 전송
  |                          |
  |------ connect_ack ------>|  3. 클라이언트가 ACK 전송
  |                          |
  |<----- connect_ack -------|  4. 서버가 ACK 응답
  |                          |     (이후 ping/pong 시작)
```

#### 연결 종료 과정
```
Client                      Server
  |                          |
  |-------- close --------->|  1. 종료 요청 메시지 전송
  |                          |
  |<-------- close ---------|  2. 서버가 종료 확인 응답
  |                          |
  |------ WebSocket.close -->|  3. WebSocket 연결 종료
  |                          |
```

#### 주의사항
1. 모든 메시지는 JSON 형식이어야 합니다.
2. 모든 메시지에는 `type`과 `data` 필드가 필수입니다.
3. `timestamp`는 ISO 8601 형식(UTC)이어야 합니다.
4. 연결이 끊어진 경우 클라이언트는 자동으로 재연결을 시도합니다 (최대 5회).
5. ping/pong 메시지는 15초 간격으로 전송됩니다.
6. 60초 동안 pong 응답이 없으면 연결이 종료됩니다.

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
