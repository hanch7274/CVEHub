# CVEHub

CVEHub는 CVE(Common Vulnerabilities and Exposures) 정보를 효과적으로 관리하고 공유하기 위한 실시간 협업 플랫폼입니다.

## 주요 기능

### 1. CVE 정보 관리
- CVE 정보 등록, 조회, 수정, 삭제
- 상세한 CVE 정보 제공 (제목, 설명, 상태, 발행일 등)
- PoC 및 Snort 규칙 관리
- 참조 링크 관리

### 2. 실시간 협업 기능
- 댓글 시스템을 통한 의견 공유
- 멘션 기능을 통한 사용자 태그 (@username)
- 실시간 알림 시스템
- 댓글 수 실시간 업데이트

### 3. 알림 시스템
- WebSocket 기반 실시간 알림
- 멘션 및 댓글 알림
- 읽음/안읽음 상태 관리
- 토스트 메시지를 통한 즉각적인 피드백

### 4. 사용자 관리
- JWT 기반 인증
- 사용자 프로필 관리
- 멀티 세션 지원 (여러 브라우저/탭 동시 접속)

## 기술 스택

### Backend
- Python 3.8+
- FastAPI
- MongoDB (with Beanie ODM)
- WebSocket
- JWT Authentication

### Frontend
- React 18
- Material-UI (MUI)
- Redux Toolkit
- WebSocket
- Axios

### Infrastructure
- Docker
- Docker Compose

## 시작하기

### 요구사항
- Docker
- Docker Compose

### 설치 및 실행

1. 저장소 클론
```bash
git clone https://github.com/yourusername/CVEHub.git
cd CVEHub
```

2. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일을 적절히 수정
```

3. 도커 컨테이너 실행
```bash
docker-compose up -d
```

4. 접속
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/docs

## 주요 특징

### 실시간 업데이트
- WebSocket을 통한 실시간 알림
- 댓글 수 실시간 동기화
- 사용자 활동 기반 연결 최적화

### 성능 최적화
- 효율적인 WebSocket 연결 관리
- 데이터베이스 인덱싱
- 페이지네이션 구현

### 개발자 친화적
- 명확한 API 문서
- 일관된 코드 스타일
- 체계적인 프로젝트 구조

## 프로젝트 구조

```
CVEHub/
├── backend/              # FastAPI 백엔드
├── frontend/             # React 프론트엔드
├── docs/                 # 문서
└── docker-compose.yml    # 도커 설정
```

## 문서

자세한 내용은 다음 문서를 참조하세요:
- [API 문서](docs/API.md)
- [아키텍처 문서](docs/ARCHITECTURE.md)

## 라이선스

이 프로젝트는 MIT 라이선스 하에 있습니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.
