# CVEHub API 문서

## 목차
1. [인증 API](#인증-api)
2. [CVE API](#cve-api)
3. [댓글 API](#댓글-api)
4. [알림 API](#알림-api)
5. [사용자 API](#사용자-api)
6. [WebSocket API](#websocket-api)

## 공통 사항

### 기본 URL
```
http://localhost:8000
```

### 인증
- Bearer Token 인증 사용
- 헤더에 `Authorization: Bearer {token}` 포함

### 응답 형식
```json
{
    "status": "success" | "error",
    "data": {}, // 성공 시 데이터
    "message": "string" // 오류 시 메시지
}
```

### 페이지네이션 응답
```json
{
    "status": "success",
    "data": {
        "items": [],
        "total": 0,
        "page": 1,
        "size": 10,
        "pages": 1
    }
}
```

## 인증 API

### 로그인
```
POST /users/login
```

요청 본문:
```json
{
    "username": "string",
    "password": "string"
}
```

응답:
```json
{
    "status": "success",
    "data": {
        "access_token": "string",
        "refresh_token": "string",
        "token_type": "bearer"
    }
}
```

### 토큰 갱신
```
POST /users/refresh
```

요청 헤더:
```
Authorization: Bearer {refresh_token}
```

응답:
```json
{
    "status": "success",
    "data": {
        "access_token": "string"
    }
}
```

## CVE API

### CVE 목록 조회
```
GET /cves
```

쿼리 파라미터:
- page: 페이지 번호 (기본값: 1)
- size: 페이지 크기 (기본값: 10)
- search: 검색어
- status: CVE 상태
- sort: 정렬 기준 (published_date, -published_date)

응답:
```json
{
    "status": "success",
    "data": {
        "items": [
            {
                "cve_id": "string",
                "title": "string",
                "description": "string",
                "status": "string",
                "published_date": "datetime",
                "created_at": "datetime",
                "comments": [],
                "pocs": [],
                "snort_rules": [],
                "references": []
            }
        ],
        "total": 0,
        "page": 1,
        "size": 10,
        "pages": 1
    }
}
```

### CVE 상세 조회
```
GET /cves/{cve_id}
```

응답:
```json
{
    "status": "success",
    "data": {
        "cve_id": "string",
        "title": "string",
        "description": "string",
        "status": "string",
        "published_date": "datetime",
        "created_at": "datetime",
        "comments": [
            {
                "id": "string",
                "content": "string",
                "username": "string",
                "parent_id": "string",
                "depth": 0,
                "is_deleted": false,
                "created_at": "datetime",
                "updated_at": "datetime",
                "mentions": []
            }
        ],
        "pocs": [],
        "snort_rules": [],
        "references": []
    }
}
```

## 댓글 API

### 댓글 작성
```
POST /cves/{cve_id}/comments
```

요청 본문:
```json
{
    "content": "string",
    "parent_id": "string" // 답글인 경우
}
```

응답:
```json
{
    "status": "success",
    "data": {
        "id": "string",
        "content": "string",
        "username": "string",
        "parent_id": "string",
        "depth": 0,
        "is_deleted": false,
        "created_at": "datetime",
        "mentions": []
    }
}
```

### 댓글 수정
```
PUT /cves/{cve_id}/comments/{comment_id}
```

요청 본문:
```json
{
    "content": "string"
}
```

### 댓글 삭제
```
DELETE /cves/{cve_id}/comments/{comment_id}
```

## 알림 API

### 알림 목록 조회
```
GET /notifications
```

쿼리 파라미터:
- page: 페이지 번호 (기본값: 1)
- size: 페이지 크기 (기본값: 10)

응답:
```json
{
    "status": "success",
    "data": {
        "items": [
            {
                "id": "string",
                "recipient_id": "string",
                "sender_id": "string",
                "sender_username": "string",
                "cve_id": "string",
                "comment_id": "string",
                "comment_content": "string",
                "content": "string",
                "is_read": false,
                "created_at": "datetime"
            }
        ],
        "total": 0,
        "page": 1,
        "size": 10,
        "pages": 1
    }
}
```

### 알림 읽음 처리
```
PUT /notifications/{notification_id}/read
```

응답:
```json
{
    "status": "success",
    "data": {
        "id": "string",
        "is_read": true
    }
}
```

### 알림 삭제
```
DELETE /notifications/{notification_id}
```

## 사용자 API

### 사용자 등록
```
POST /users/register
```

요청 본문:
```json
{
    "username": "string",
    "password": "string",
    "email": "string"
}
```

### 현재 사용자 정보 조회
```
GET /users/me
```

응답:
```json
{
    "status": "success",
    "data": {
        "id": "string",
        "username": "string",
        "email": "string",
        "created_at": "datetime"
    }
}
```

### 사용자 정보 수정
```
PUT /users/me
```

요청 본문:
```json
{
    "email": "string",
    "password": "string" // 선택적
}
```

## WebSocket API

### WebSocket 연결
```
GET /ws/{user_id}
```

쿼리 파라미터:
- token: JWT 액세스 토큰
- session_id: 세션 식별자

### WebSocket 메시지 형식

#### 1. 알림 메시지
```json
{
    "type": "notification",
    "data": {
        "notification": {
            "id": "string",
            "recipient_id": "string",
            "sender_id": "string",
            "sender_username": "string",
            "cve_id": "string",
            "comment_id": "string",
            "comment_content": "string",
            "content": "string",
            "is_read": false,
            "created_at": "datetime"
        },
        "unreadCount": 0,
        "toast": {
            "message": "string",
            "severity": "info"
        }
    }
}
```

#### 2. 댓글 업데이트 메시지
```json
{
    "type": "comment_update",
    "data": {
        "cveId": "string",
        "activeCommentCount": 0
    },
    "timestamp": "datetime"
}
```

#### 3. Ping/Pong 메시지
```json
// Ping 메시지
{
    "type": "ping",
    "data": {
        "lastActivity": "datetime"
    }
}

// Pong 메시지
{
    "type": "pong",
    "data": {
        "timestamp": "datetime",
        "session_id": "string"
    }
}
```
