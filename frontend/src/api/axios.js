import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',  // cvehub-backend 대신 localhost 사용
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  withCredentials: true  // 세션 쿠키 전송을 위해 추가
});

export default api;
