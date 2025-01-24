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

## 엔드포인트

### 인증 (Auth)

#### 로그인
- **POST** `/auth/token`
- Content-Type: `application/x-www-form-urlencoded`
```json
{
  "username": "string",
  "password": "string"
}
```
- Response:
```json
{
  "access_token": "string",
  "token_type": "bearer"
}
```

#### 회원가입
- **POST** `/auth/register`
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "is_admin": false
}
```

#### 현재 사용자 정보
- **GET** `/auth/me`
- Response:
```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "is_admin": false
}
```

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
  - `session_id`: string

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
