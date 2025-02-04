import axios from 'axios';
import { getAccessToken, clearAuthStorage } from '../../utils/storage/tokenStorage';
import { camelToSnake, snakeToCamel } from '../../utils/caseConverter';
import { refreshToken as refreshAuthToken } from '../../services/authService';

const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const axiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
axiosInstance.interceptors.request.use(
  async (config) => {
    try {
      console.log('=== Request Interceptor Debug [Start] ===');
      console.log('1. Initial Request:', {
        url: config.url,
        method: config.method,
        headers: config.headers,
        timestamp: new Date().toISOString()
      });

      // 인증이 필요하지 않은 엔드포인트 체크 (로그인, 회원가입 등)
      const publicEndpoints = [
        '/auth/token',    // OAuth2 토큰 발급
        '/auth/login',    // 일반 로그인
        '/auth/signup',   // 회원가입
        '/auth/refresh',  // 토큰 갱신
        '/auth/verify',   // 이메일 인증
        '/auth/password/reset',  // 비밀번호 재설정
        '/auth/password/reset/verify',  // 비밀번호 재설정 인증
        '/health'         // 서버 상태 체크
      ];

      const isPublicEndpoint = publicEndpoints.some(endpoint => config.url.startsWith(endpoint));
      console.log('2. Endpoint Check:', {
        url: config.url,
        isPublic: isPublicEndpoint
      });

      if (!isPublicEndpoint) {
        console.log('3. Starting Auth Process');
        // 토큰이 있으면 헤더에 추가
        const token = getAccessToken();
        console.log('4. Token Check:', {
          exists: !!token,
          preview: token ? `${token.substring(0, 20)}...` : 'No token'
        });
        
        if (token) {
          try {
            console.log('5. Token Validation Start');
            const [headerPart, payloadPart] = token.split('.');
            const payload = JSON.parse(atob(payloadPart));
            const now = Math.floor(Date.now() / 1000);
            
            console.log('6. Token Details:', {
              exp: payload.exp,
              currentTime: now,
              timeUntilExp: payload.exp - now,
              tokenPayload: payload
            });
            
            // 토큰 만료 체크 (만료 10분 전부터 갱신 시도)
            if (payload.exp && (payload.exp - now < 600)) {
              console.log('7. Token Refresh Needed');
              try {
                console.log('8. Starting Token Refresh');
                const refreshResult = await refreshAuthToken();
                console.log('9. Refresh Result:', !!refreshResult);
                
                if (refreshResult) {
                  const newToken = getAccessToken();
                  if (newToken) {
                    config.headers.Authorization = `Bearer ${newToken}`;
                    console.log('10. New Token Set:', {
                      preview: `${newToken.substring(0, 20)}...`
                    });
                  } else {
                    console.error('11. New Token Missing After Refresh');
                    return Promise.reject(new Error('Token refresh failed'));
                  }
                }
              } catch (refreshError) {
                console.error('12. Token Refresh Failed:', refreshError);
                // 토큰 갱신 실패 시에도 기존 토큰으로 계속 시도
                config.headers.Authorization = `Bearer ${token}`;
                console.log('13. Using Existing Token:', {
                  preview: `${token.substring(0, 20)}...`
                });
                return config;
              }
            } else {
              console.log('14. Using Current Token');
              config.headers.Authorization = `Bearer ${token.trim()}`;
            }
          } catch (e) {
            console.error('15. Token Validation Error:', {
              error: e.message,
              stack: e.stack
            });
            // 토큰 검증 실패시에도 기존 토큰 사용 시도
            config.headers.Authorization = `Bearer ${token}`;
            console.log('16. Using Token Despite Validation Error');
            return config;
          }
        } else {
          console.log('17. No Token Available');
          return Promise.reject(new Error('Authentication required'));
        }
      } else {
        console.log('18. Skipping Auth (Public Endpoint)');
      }

      // 요청 데이터가 있고 form-urlencoded가 아닌 경우 스네이크 케이스로 변환
      if (config.data && config.headers['Content-Type'] !== 'application/x-www-form-urlencoded') {
        config.data = camelToSnake(config.data);
        console.log('Request Data (Converted):', config.data);
      }

      // 쿼리 파라미터가 있는 경우 스네이크 케이스로 변환
      if (config.params) {
        config.params = camelToSnake(config.params);
        console.log('Query Params (Converted):', config.params);
      }

      // Authorization 헤더가 제대로 설정되었는지 최종 확인
      if (!isPublicEndpoint && !config.headers.Authorization) {
        console.error('Authorization header is missing in the final config');
        return Promise.reject(new Error('Authorization header is missing'));
      }

      console.log('=== Final Request Config ===');
      console.log('URL:', config.url);
      console.log('Method:', config.method);
      console.log('Headers:', config.headers);
      console.log('Data:', config.data);
      console.log('Params:', config.params);
      console.log('Timestamp:', new Date().toISOString());

      return config;
    } catch (error) {
      console.error('=== Request Interceptor Critical Error ===');
      console.error('Error:', error);
      console.error('Stack:', error.stack);
      return Promise.reject(error);
    }
  },
  (error) => {
    console.error('Request Interceptor Error:', error);
    return Promise.reject(error);
  }
);

// Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    console.log('=== Response Success Debug ===');
    console.log('Response:', {
      url: response.config.url,
      status: response.status,
      timestamp: new Date().toISOString()
    });

    if (response.data) {
      response.data = snakeToCamel(response.data);
    }

    return response;
  },
  async (error) => {
    console.error('=== Response Error Debug ===');
    console.error('Error Config:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      timestamp: new Date().toISOString()
    });

    // 401 에러 처리 (인증 실패)
    if (error.response?.status === 401) {
      console.log('=== Auth Error Debug ===');
      const token = getAccessToken();
      
      console.log('Current Token:', {
        exists: !!token,
        preview: token ? `${token.substring(0, 20)}...` : 'No token'
      });

      // 토큰이 있는 경우 갱신 시도
      if (token) {
        try {
          console.log('Attempting final token refresh...');
          const refreshResult = await refreshAuthToken();
          if (refreshResult) {
            console.log('Final refresh successful, retrying request...');
            const originalRequest = error.config;
            const newToken = getAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axios(originalRequest);
          }
        } catch (refreshError) {
          console.error('Final refresh failed:', refreshError);
          // 로그아웃 처리하지 않고 에러만 반환
          return Promise.reject(error);
        }
      }
      
      // 토큰이 없는 경우도 로그아웃하지 않고 에러만 반환
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default axiosInstance; 