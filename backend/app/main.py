from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routes import cve, lock, comment, auth  # auth 라우터 추가

app = FastAPI(
    title="CVE Hub API",
    description="API for managing CVEs, PoCs, and Snort rules",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 환경에서는 모든 origin 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])  # auth 라우터 prefix 수정
app.include_router(cve.router, prefix="/api/cves", tags=["cves"])
app.include_router(lock.router, prefix="/api", tags=["lock"])
app.include_router(comment.router, prefix="/api/cves", tags=["comment"])

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.get("/")
async def root():
    return {"message": "Welcome to CVE Hub API"}
