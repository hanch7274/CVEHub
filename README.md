# CVE Hub

CVE Hub는 CVE(Common Vulnerabilities and Exposures) 정보를 관리하고 공유하기 위한 웹 애플리케이션입니다.

## 주요 기능

- CVE 정보 등록, 조회, 수정, 삭제
- 사용자 인증 및 권한 관리
- PoC(Proof of Concept) 및 Snort Rule 관리
- 실시간 협업을 위한 편집 잠금 기능

## 기술 스택

### Backend
- FastAPI
- MongoDB (with Motor & Beanie ODM)
- Python 3.11+

### Frontend
- React
- Material-UI
- Axios

## 시작하기

### 사전 요구사항
- Python 3.11+
- Node.js 18
- MongoDB

### 백엔드 설정
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

`.env` 파일을 생성하고 다음 내용을 추가합니다:
```
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=cvehub
SECRET_KEY=your-secret-key
```

서버 실행:
```bash
uvicorn app.main:app --reload
```

### 프론트엔드 설정
```bash
cd frontend
npm install
npm start
```

## API 문서
서버 실행 후 다음 URL에서 API 문서를 확인할 수 있습니다:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 라이선스
MIT License
