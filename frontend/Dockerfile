FROM node:18-alpine

# 타임존 설정을 위한 tzdata 패키지 설치 및 타임존 설정
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

# npm 설정 최적화
RUN npm config set cache /npm-cache --global

WORKDIR /app

# package.json과 package-lock.json만 먼저 복사
COPY package*.json ./

# 의존성 설치 (빌드 캐시 활용)
RUN --mount=type=cache,target=/npm-cache npm install

# 나머지 소스 코드 복사
COPY . .

# 타입 체크 실행 (개발 환경에서만 필요시 주석 해제)
# RUN npm run tsc:check

# React 개발 서버 실행
ENV PORT=3000
CMD ["npm", "start"]
