FROM node:18-alpine

# 타임존 설정을 위한 tzdata 패키지 설치 및 타임존 설정
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

WORKDIR /app

# package.json과 package-lock.json만 먼저 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 나머지 소스 코드 복사
COPY . .

# React 개발 서버 실행
ENV PORT=3000
CMD ["npm", "start"]
