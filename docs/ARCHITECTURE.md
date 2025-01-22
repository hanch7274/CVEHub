# CVEHub 프로젝트 아키텍처 문서

## 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [기술 스택](#기술-스택)
3. [프로젝트 구조](#프로젝트-구조)
4. [백엔드 아키텍처](#백엔드-아키텍처)
5. [프론트엔드 아키텍처](#프론트엔드-아키텍처)
6. [데이터베이스 모델](#데이터베이스-모델)
7. [API 엔드포인트](#api-엔드포인트)
8. [인증 시스템](#인증-시스템)
9. [알림 시스템](#알림-시스템)

## 프로젝트 개요

CVEHub는 CVE(Common Vulnerabilities and Exposures) 정보를 관리하고 공유하는 플랫폼입니다. 사용자들은 CVE 정보를 조회하고, 댓글을 통해 의견을 공유하며, 멘션 기능을 통해 다른 사용자와 소통할 수 있습니다.

## 기술 스택

### 백엔드
- Python 3.8+
- FastAPI
- MongoDB (with Beanie ODM)
- PyJWT (인증)
- Python-jose (JWT)
- Passlib (비밀번호 해싱)

### 프론트엔드
- React 18
- Material-UI (MUI)
- Redux Toolkit
- Axios
- React Router DOM

### 인프라
- Docker
- Docker Compose

## 프로젝트 구조

```
CVEHub/
├── backend/
│   ├── app/
│   │   ├── auth/          # 인증 관련 모듈
│   │   ├── core/          # 핵심 설정 및 유틸리티
│   │   ├── models/        # 데이터베이스 모델
│   │   ├── routes/        # API 라우트
│   │   ├── database.py    # 데이터베이스 설정
│   │   └── main.py        # 애플리케이션 진입점
│   └── requirements.txt    # Python 의존성
├── frontend/
│   ├── src/
│   │   ├── api/          # API 클라이언트
│   │   ├── components/   # React 컴포넌트
│   │   ├── contexts/     # React Context
│   │   ├── store/        # Redux 스토어
│   │   ├── utils/        # 유틸리티 함수
│   │   └── App.jsx       # 애플리케이션 진입점
│   └── package.json      # Node.js 의존성
└── docker-compose.yml    # 도커 구성
```

## 백엔드 아키텍처

### 핵심 모듈

1. **데이터베이스 (database.py)**
   - MongoDB 연결 관리
   - Beanie ODM 초기화
   - 모델 초기화 및 인덱스 생성

2. **인증 시스템 (auth/)**
   - JWT 기반 인증
   - 비밀번호 해싱/검증
   - 접근 제어 및 권한 관리

3. **모델 (models/)**
   - CVE 모델: CVE 정보 저장
   - User 모델: 사용자 정보 관리
   - Comment 모델: 댓글 시스템
   - Notification 모델: 알림 시스템

4. **라우트 (routes/)**
   - CVE 관리 API
   - 사용자 관리 API
   - 댓글 시스템 API
   - 알림 시스템 API

### API 엔드포인트

#### 사용자 관리
- POST /users/register: 사용자 등록
- POST /users/login: 로그인
- GET /users/me: 현재 사용자 정보
- PUT /users/me: 사용자 정보 수정

#### CVE 관리
- GET /cves: CVE 목록 조회
- GET /cves/{cve_id}: 특정 CVE 조회
- POST /cves: CVE 등록
- PUT /cves/{cve_id}: CVE 수정
- DELETE /cves/{cve_id}: CVE 삭제

#### 댓글 시스템
- GET /cves/{cve_id}/comments: 댓글 목록 조회
- POST /cves/{cve_id}/comments: 댓글 작성
- PUT /cves/{cve_id}/comments/{comment_id}: 댓글 수정
- DELETE /cves/{cve_id}/comments/{comment_id}: 댓글 삭제

#### 알림 시스템
- GET /notifications: 알림 목록 조회
- PUT /notifications/{notification_id}/read: 알림 읽음 처리
- DELETE /notifications/{notification_id}: 알림 삭제

## 프론트엔드 아키텍처

### 핵심 컴포넌트

1. **레이아웃 컴포넌트**
   - AppBar: 상단 네비게이션 바
   - Sidebar: 사이드 메뉴
   - NotificationBell: 알림 표시

2. **CVE 관련 컴포넌트**
   - CVEList: CVE 목록 표시
   - CVEDetail: CVE 상세 정보
   - CVEForm: CVE 등록/수정 폼

3. **댓글 컴포넌트**
   - CommentList: 댓글 목록
   - CommentForm: 댓글 작성 폼
   - CommentItem: 개별 댓글 표시

4. **알림 컴포넌트**
   - NotificationList: 알림 목록
   - NotificationItem: 개별 알림 표시

### 상태 관리

Redux Toolkit을 사용하여 다음 상태들을 관리:

1. **인증 상태**
   - 로그인 상태
   - 사용자 정보
   - JWT 토큰

2. **CVE 상태**
   - CVE 목록
   - 선택된 CVE
   - 필터링/정렬 상태

3. **알림 상태**
   - 알림 목록
   - 읽지 않은 알림 수

### API 통신

- axios 인스턴스를 사용하여 API 통신
- 인터셉터를 통한 자동 케이스 변환 (camelCase ↔ snake_case)
- 토큰 자동 갱신
- 에러 처리 통합

## 데이터베이스 모델

### CVE 모델
```python
class CVEModel(Document):
    cve_id: str                    # CVE ID (primary key)
    title: Optional[str]           # CVE 제목
    description: Optional[str]     # CVE 설명
    status: str                    # CVE 상태
    published_date: datetime       # 발행일
    created_at: datetime           # 생성일
    comments: List[Comment]        # 댓글 목록
    pocs: List[PoC]               # PoC 목록
    snort_rules: List[SnortRule]  # Snort 규칙
    references: List[Reference]    # 참조 링크
```

### 댓글 모델
```python
class Comment(BaseModel):
    id: str                       # 댓글 ID (YYYYMMDDHHmmSSfff)
    content: str                  # 댓글 내용
    username: str                 # 작성자
    parent_id: Optional[str]      # 부모 댓글 ID
    depth: int                    # 댓글 깊이
    is_deleted: bool             # 삭제 여부
    created_at: datetime         # 생성일
    updated_at: Optional[datetime] # 수정일
    mentions: List[str]          # 멘션된 사용자 목록
```

### 알림 모델
```python
class Notification(Document):
    recipient_id: PydanticObjectId  # 수신자 ID
    sender_id: PydanticObjectId     # 발신자 ID
    sender_username: Optional[str]   # 발신자 이름
    cve_id: str                     # 관련 CVE ID
    comment_id: PydanticObjectId    # 관련 댓글 ID
    comment_content: Optional[str]   # 댓글 내용
    content: str                    # 알림 내용
    is_read: bool                   # 읽음 여부
    created_at: datetime            # 생성일
```

## 인증 시스템

### JWT 기반 인증

1. **토큰 구조**
   - Access Token: 30분 유효
   - Refresh Token: 7일 유효

2. **인증 흐름**
   - 로그인 → Access Token + Refresh Token 발급
   - API 요청 시 Access Token 사용
   - Access Token 만료 시 Refresh Token으로 자동 갱신

3. **보안 기능**
   - 비밀번호 해싱 (Passlib)
   - CORS 설정
   - Rate Limiting

## 알림 시스템

### WebSocket 연결 관리

1. **ConnectionManager**
   - 사용자별 WebSocket 연결 관리
   - 멀티 세션 지원 (여러 브라우저/탭에서 동시 접속)
   - 자동 재연결 및 ping/pong을 통한 연결 유지
   - 실패한 세션 자동 정리

2. **메시지 처리**
   - 알림 메시지: 멘션, 댓글 등의 알림
   - 댓글 업데이트: 실시간 댓글 수 동기화
   - 토스트 메시지: 사용자 액션에 대한 피드백

### 알림 생성 트리거

1. **멘션 기반 알림**
   - 댓글에서 @username 형식으로 멘션
   - 자동으로 멘션된 사용자에게 알림 생성
   - WebSocket을 통한 실시간 알림 전송

2. **알림 표시**
   - 읽지 않은 알림 강조 표시 (빨간색 배지)
   - 알림 클릭 시 해당 CVE/댓글로 이동
   - 시간순 정렬 (최신순)
   - 토스트 메시지로 즉각적인 피드백

### 성능 최적화

1. **WebSocket 연결**
   - 사용자 활동 기반 ping 간격 조정
   - 비활성 상태에서 ping 간격 증가
   - 연결 실패 시 자동 재연결

2. **데이터베이스 인덱싱**
   - recipient_id + created_at 복합 인덱스
   - 알림 조회 성능 최적화

3. **페이지네이션**
   - 알림 목록 페이지 단위 로딩
   - 무한 스크롤 구현

## 개발 가이드라인

### 코드 스타일

1. **백엔드**
   - PEP 8 준수
   - Type Hints 사용
   - 문서화 문자열 필수

2. **프론트엔드**
   - ESLint + Prettier 사용
   - 컴포넌트 단위 개발
   - PropTypes 정의

### 명명 규칙

1. **백엔드**
   - 변수/함수: snake_case
   - 클래스: PascalCase
   - 상수: UPPER_CASE

2. **프론트엔드**
   - 변수/함수: camelCase
   - 컴포넌트: PascalCase
   - 상수: UPPER_CASE

### API 통신 규칙

1. **요청/응답 형식**
   - 백엔드: snake_case
   - 프론트엔드: camelCase
   - 자동 변환 시스템 구현

2. **에러 처리**
   - HTTP 상태 코드 적절히 사용
   - 상세 에러 메시지 포함
   - 프론트엔드에서 통합 처리

## 배포 가이드

### 도커 기반 배포

1. **컨테이너 구성**
   - Frontend Container
   - Backend Container
   - MongoDB Container

2. **환경 변수**
   - .env 파일로 관리
   - 민감 정보 분리

3. **배포 명령어**
```bash
# 개발 환경
docker-compose up -d

# 프로덕션 환경
docker-compose -f docker-compose.prod.yml up -d
```
