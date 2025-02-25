# CVEHub

CVEHub는 CVE(Common Vulnerabilities and Exposures) 정보를 관리하고 공유하기 위한 실시간 협업 플랫폼입니다.

## 주요 기능

- CVE 정보 관리 (등록, 조회, 수정, 삭제)
- 실시간 협업 기능 (댓글 시스템, 사용자 멘션)
- WebSocket 기반 실시간 알림 시스템
- JWT 기반 사용자 인증

## 기술 스택

### Backend
- Python 3.8+
- FastAPI
- MongoDB (with Beanie ODM)
- WebSocket
- JWT Authentication

### Frontend
- React 18
- Material-UI
- Redux Toolkit
- Axios
- WebSocket

### Infrastructure
- Docker
- Docker Compose

## 프로젝트 구조

프로젝트는 기능 기반 아키텍처를 따르며, 각 기능은 독립적인 모듈로 구성됩니다.

### Frontend 구조

```
frontend/src/
├── features/           # 기능별 모듈
│   ├── auth/          # 인증 관련 컴포넌트
│   ├── cve/           # CVE 관리 컴포넌트
│   ├── comment/       # 댓글 시스템 컴포넌트
│   └── notification/  # 알림 시스템 컴포넌트
├── layout/            # 레이아웃 컴포넌트
├── common/            # 공통 컴포넌트
└── services/         # API 서비스 레이어
```

## 개발 가이드라인

1. **기능 개발**
   - 새로운 기능은 `features/` 디렉토리 내에 독립적인 모듈로 개발
   - 각 기능은 자체 컴포넌트, 훅, 로직을 포함

2. **컴포넌트 개발**
   - 재사용 가능한 컴포넌트는 `common/` 디렉토리에 위치
   - 레이아웃 관련 컴포넌트는 `layout/` 디렉토리에 위치

3. **상태 관리**
   - Redux는 전역 상태 관리에만 사용
   - 컴포넌트 로컬 상태는 React hooks 사용

4. **API 통신**
   - API 호출은 `services/` 디렉토리의 서비스를 통해 수행
   - WebSocket 통신은 커스텀 훅을 통해 관리

## 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/yourusername/CVEHub.git

# 프로젝트 디렉토리로 이동
cd CVEHub

# Docker를 사용하여 실행
docker-compose up -d
```

## 문서

- [API 문서](docs/API.md)
- [아키텍처 문서](docs/ARCHITECTURE.md)

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.
