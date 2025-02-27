// axios 인스턴스 설정
const instance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  timeout: 120000,  // 타임아웃을 120초(2분)로 늘림
  headers: {
    'Content-Type': 'application/json'
  }
}); 