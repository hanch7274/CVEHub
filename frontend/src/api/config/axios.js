import axios from 'axios';
import { getAccessToken, clearAuthStorage } from '../../utils/storage/tokenStorage';
import { camelToSnake, snakeToCamel } from '../../utils/caseConverter';
import { refreshToken as refreshAuthToken } from '../../services/authService';
import { formatInTimeZone } from 'date-fns-tz';
import { getAPITimestamp, formatToKST, DATE_FORMATS } from '../../utils/dateUtils';
import { API_BASE_URL } from '../../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      console.log('=== Request Interceptor Debug [Start] ===');
      console.log('1. Initial Request:', {
        url: config.url,
        method: config.method,
        headers: config.headers,
        timestamp: formatToKST(new Date(), DATE_FORMATS.DISPLAY.DEFAULT)
      });

      // 인증이 필요하지 않은 엔드포인트 체크 (로그인, 회원가입 등)
      const publicEndpoints = [
        '/auth/token',
        '/auth/login',
        '/auth/signup',
        '/auth/refresh',
        '/auth/verify',
        '/auth/password/reset',
        '/auth/password/reset/verify',
        '/health'
      ];

      const isPublicEndpoint = publicEndpoints.some(endpoint => config.url.startsWith(endpoint));
      console.log('2. Endpoint Check:', {
        url: config.url,
        isPublic: isPublicEndpoint
      });

      if (!isPublicEndpoint) {
        console.log('3. Starting Auth Process');
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
            
            // 토큰 만료 체크 (만료 5분 전부터 갱신 시도)
            if (payload.exp && (payload.exp - now < 300)) {
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
                    clearAuthStorage();
                    window.location.href = '/login';
                    return Promise.reject(new Error('Token refresh failed'));
                  }
                }
              } catch (refreshError) {
                console.error('12. Token Refresh Failed:', refreshError);
                if (refreshError.response?.status === 401) {
                  clearAuthStorage();
                  window.location.href = '/login';
                  return Promise.reject(refreshError);
                }
                config.headers.Authorization = `Bearer ${token}`;
                console.log('13. Using Existing Token:', {
                  preview: `${token.substring(0, 20)}...`
                });
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
            clearAuthStorage();
            window.location.href = '/login';
            return Promise.reject(e);
          }
        } else {
          console.log('17. No Token Available');
          clearAuthStorage();
          window.location.href = '/login';
          return Promise.reject(new Error('Authentication required'));
        }
      } else {
        console.log('18. Skipping Auth (Public Endpoint)');
      }

      // 데이터 변환: 요청 데이터와 쿼리 파라미터를 스네이크 케이스로 변환
      if (config.data && config.headers['Content-Type'] !== 'application/x-www-form-urlencoded') {
        console.log('[Axios] Before conversion:', config.data);
        config.data = camelToSnake(config.data);
        console.log('[Axios] After conversion:', config.data);
      }
      if (config.params) {
        config.params = camelToSnake(config.params);
        console.log('Query Params (Converted):', config.params);
      }

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
      console.log('Timestamp:', formatToKST(new Date(), DATE_FORMATS.DISPLAY.DEFAULT));

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
api.interceptors.response.use(
  (response) => {
    console.log('=== Response Success Debug ===');
    console.log('Response:', {
      url: response.config.url,
      status: response.status,
      timestamp: formatToKST(new Date(), DATE_FORMATS.DISPLAY.DEFAULT)
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
      timestamp: formatToKST(new Date(), DATE_FORMATS.DISPLAY.DEFAULT)
    });

    // 401 에러 처리 (인증 실패)
    if (error.response?.status === 401) {
      console.log('=== Auth Error Debug ===');
      if (error.config.url.includes('/auth/token')) {
        console.log('Login attempt failed, skipping token refresh');
        clearAuthStorage();
        return Promise.reject(error);
      }

      const token = getAccessToken();
      console.log('Current Token:', {
        exists: !!token,
        preview: token ? `${token.substring(0, 20)}...` : 'No token'
      });

      if (token && !error.config.url.includes('/auth/refresh')) {
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
          clearAuthStorage();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        clearAuthStorage();
        if (!error.config.url.includes('/auth/token')) {
          window.location.href = '/login';
        }
      }
    }
    
    // --- 에러 응답 포맷 확장: 에러 코드와 세부 메시지를 포함한 객체로 래핑 ---
    const formattedError = {
      code: error.response?.status || 500,
      message: error.response?.data?.detail || error.message || "Unknown error",
    };
    return Promise.reject(formattedError);
  }
);

// camelCase를 snake_case로 변환하는 함수
function camelToSnakeCase(data) {
  if (Array.isArray(data)) {
    return data.map(item => camelToSnakeCase(item));
  } else if (data !== null && typeof data === 'object') {
    return Object.keys(data).reduce((acc, key) => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      acc[snakeKey] = camelToSnakeCase(data[key]);
      return acc;
    }, {});
  }
  return data;
}

export default api;
