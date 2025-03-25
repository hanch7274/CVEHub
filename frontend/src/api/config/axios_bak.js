import axios from 'axios';
import { getAccessToken, clearAuthStorage } from '../../utils/storage/tokenStorage';
import { camelToSnake, snakeToCamel } from '../../utils/caseConverter';
import { refreshToken as refreshAuthToken } from '../../services/authService';
import { 
  prepareDataForAPI, 
  processApiDates
} from '../../utils/dateUtils';
import { 
  API_BASE_URL, 
  CASE_CONVERSION_CONFIG, 
  PUBLIC_ENDPOINTS,
  TOKEN_REFRESH_CONFIG
} from '../../config';

// 마지막 토큰 갱신 시간 추적
let lastTokenRefreshTime = 0;
let tokenRefreshRetryCount = 0;

// 간소화된 로깅 함수 - 개발 환경에서만 로그 출력
const logDebug = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30초 타임아웃
  headers: {
    'Content-Type': 'application/json'
  }
});

// 캐시 저장소
const cache = new Map();

// 변환에서 제외할 필드 목록 (config에서 가져옴)
const EXCLUDED_FIELDS = CASE_CONVERSION_CONFIG.EXCLUDED_FIELDS;

// 로그 출력에서 제외할 URL 패턴
const URL_NO_LOG_PATTERNS = [
  '/static/',
  '/assets/',
  '/images/',
  '/favicon.ico',
  '/manifest.json'
];

// 날짜 처리에서 제외할 URL 패턴
const URL_NO_DATE_PROCESS_PATTERNS = [
  '/auth/',
  '/static/',
  '/assets/',
  '/images/'
];

// 로깅 제외할 엔드포인트 목록
const EXCLUDED_LOG_ENDPOINTS = [
  '/notifications/unread/count',
  '/user/status'
];

// 날짜 필드 처리가 필요하지 않은 엔드포인트 목록
const DATE_PROCESSING_EXCLUDED_ENDPOINTS = [
  '/users/search',
  '/users/profile',
  '/auth/login',
  '/auth/register'
];

// URL 패턴에 따라 로그 출력 여부 결정
const isExcludedFromLogging = (url) => {
  if (!url) return true;
  return URL_NO_LOG_PATTERNS.some(pattern => url.includes(pattern));
};

// URL 패턴에 따라 날짜 처리 여부 결정
const shouldProcessDates = (url) => {
  if (!url) return false;
  return !URL_NO_DATE_PROCESS_PATTERNS.some(pattern => url.includes(pattern));
};

// Request Interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      // 전역 변수에 현재 API 요청 정보 저장 (caseConverter에서 URL 추적용)
      window._currentApiRequest = {
        url: config.url,
        method: config.method,
        timestamp: new Date().toISOString()
      };
      
      // 로깅 제외 대상 확인
      const shouldLog = !isExcludedFromLogging(config.url) && process.env.NODE_ENV === 'development';
      
      // 요청 시작 시간 기록 (성능 측정용)
      config.metadata = {
        requestTime: new Date()
      };

      // 인증이 필요하지 않은 엔드포인트 체크 (로그인, 회원가입 등)
      const isPublicEndpoint = PUBLIC_ENDPOINTS.some(endpoint => config.url.includes(endpoint));

      if (!isPublicEndpoint) {
        const token = getAccessToken();
        
        if (token) {
          try {
            const [headerPart, payloadPart] = token.split('.');
            const payload = JSON.parse(atob(payloadPart));
            const now = Math.floor(Date.now() / 1000);
            
            // skipAuthRefresh 플래그가 있는 경우 토큰 갱신 로직 건너뛰기
            if (config.skipAuthRefresh) {
              config.headers.Authorization = `Bearer ${token}`;
            }
            // 토큰 만료 체크 (만료 설정된 시간 전부터 갱신 시도)
            else if (payload.exp && (payload.exp - now < TOKEN_REFRESH_CONFIG.REFRESH_BEFORE_EXPIRY)) {
              try {
                // 토큰 갱신 중 플래그 설정 (중복 갱신 방지)
                if (window._tokenRefreshInProgress) {
                  config.headers.Authorization = `Bearer ${token}`;
                } 
                // 토큰 갱신 최소 간격 확인
                else if (Date.now() - lastTokenRefreshTime < TOKEN_REFRESH_CONFIG.MIN_REFRESH_INTERVAL) {
                  config.headers.Authorization = `Bearer ${token}`;
                }
                // 토큰 갱신 최대 재시도 횟수 확인
                else if (tokenRefreshRetryCount >= TOKEN_REFRESH_CONFIG.MAX_RETRY_COUNT) {
                  config.headers.Authorization = `Bearer ${token}`;
                  
                  // 일정 시간 후 재시도 카운트 초기화 (10분)
                  setTimeout(() => {
                    tokenRefreshRetryCount = 0;
                  }, 10 * 60 * 1000);
                } else {
                  window._tokenRefreshInProgress = true;
                  tokenRefreshRetryCount++;
                  
                  try {
                    const refreshResult = await refreshAuthToken();
                    
                    // 갱신 완료 후 플래그 해제 및 시간 기록
                    window._tokenRefreshInProgress = false;
                    lastTokenRefreshTime = Date.now();
                    tokenRefreshRetryCount = 0;
                    
                    // 새 토큰으로 요청 헤더 설정
                    if (refreshResult?.accessToken) {
                      config.headers.Authorization = `Bearer ${refreshResult.accessToken}`;
                    } else {
                      config.headers.Authorization = `Bearer ${token}`;
                    }
                  } catch (refreshError) {
                    // 토큰 갱신 실패 시 플래그 해제
                    window._tokenRefreshInProgress = false;
                    
                    // 갱신 실패 시 기존 토큰 사용
                    config.headers.Authorization = `Bearer ${token}`;
                    
                    // 개발 환경에서만 에러 로그
                    if (process.env.NODE_ENV === 'development') {
                      console.error('토큰 갱신 실패:', refreshError);
                    }
                  }
                }
              } catch (e) {
                // 토큰 갱신 과정 중 예외 발생 시 플래그 해제
                window._tokenRefreshInProgress = false;
                
                // 기존 토큰 사용
                config.headers.Authorization = `Bearer ${token}`;
                
                // 개발 환경에서만 에러 로그
                if (process.env.NODE_ENV === 'development') {
                  console.error('토큰 갱신 과정 중 오류:', e);
                }
              }
            } else {
              // 토큰이 유효하면 그대로 사용
              config.headers.Authorization = `Bearer ${token}`;
            }
          } catch (e) {
            // 토큰 검증 과정에서 오류 발생 시 기존 토큰 사용
            config.headers.Authorization = `Bearer ${token}`;
            
            // 개발 환경에서만 에러 로그
            if (process.env.NODE_ENV === 'development') {
              console.error('토큰 검증 오류:', e);
            }
          }
        }
      }
      
      // 요청 데이터가 있는 경우 (POST, PUT, PATCH 등)
      if (config.data && typeof config.data === 'object' && !config.skipTransform) {
        // 날짜 필드 처리 (ISO 형식으로 변환)
        config.data = prepareDataForAPI(config.data);
        
        // 카멜 케이스를 스네이크 케이스로 변환
        config.data = camelToSnake(config.data, {
          excludeFields: EXCLUDED_FIELDS
        });
      }
      
      // 캐시된 응답 확인 (GET 요청만 해당)
      if (config.method === 'get' && config.useCache) {
        const cachedResponse = cache.get(config.url);
        
        if (cachedResponse) {
          const now = Date.now();
          const cacheAge = now - cachedResponse.timestamp;
          
          // 캐시 유효 시간 내인 경우
          if (cacheAge < (config.cacheMaxAge || 60000)) { // 기본 1분
            if (shouldLog) {
              console.log(`[axios] 캐시된 응답 사용: ${config.url}`);
            }
            
            // 캐시된 응답 사용
            return Promise.resolve({
              data: cachedResponse.data,
              status: 200,
              statusText: 'OK (cached)',
              headers: {},
              config,
              cached: true
            });
          }
        }
      }
      
      return config;
    } catch (error) {
      console.error('Request Interceptor Critical Error:', error);
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
    // 로깅 제외 대상 확인
    const shouldLog = !isExcludedFromLogging(response.config.url) && process.env.NODE_ENV === 'development';
    
    try {
      // 응답 데이터가 있는 경우에만 처리
      if (response.data) {
        // 응답 데이터 형식 확인 (배열 또는 객체)
        if (Array.isArray(response.data)) {
          // 스네이크 케이스에서 카멜 케이스로 변환
          response.data = response.data.map(item => snakeToCamel(item, {
            excludeFields: EXCLUDED_FIELDS,
            requestUrl: response.config.url
          }));
          
          // 날짜 필드 처리
          if (shouldProcessDates(response.config.url)) {
            // 중앙화된 날짜 처리 함수 사용
            response.data = processApiDates(response.data, response.config.url);
          }
        } else if (typeof response.data === 'object' && response.data !== null) {
          // 스네이크 케이스에서 카멜 케이스로 변환(URL 정보 포함)
          response.data = snakeToCamel(response.data, {
            excludeFields: EXCLUDED_FIELDS,
            requestUrl: response.config.url
          });
          
          // 날짜 필드 처리
          if (shouldProcessDates(response.config.url)) {
            // 중앙화된 날짜 처리 함수 사용
            response.data = processApiDates(response.data, response.config.url);
          }
        }
      }

      // 디버깅 로그 (개발 환경에서만)
      if (shouldLog) {
        const requestTime = response.config.metadata?.requestTime;
        const responseTime = new Date();
        const elapsedTime = requestTime ? responseTime - requestTime : 0;
        
        // 응답 시간이 1초 이상인 경우 경고 로그
        if (elapsedTime > 1000) {
          console.warn('%c ⚠️ Slow Response', 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px;', {
            url: response.config.url,
            method: response.config.method,
            elapsedTime: `${elapsedTime}ms`
          });
        }
      }
      
      // 인증 관련 엔드포인트 체크 (원본 필드 보존을 위해)
      const isAuthEndpoint = response.config?.url && (
        response.config?.url.includes('/auth/token') || 
        response.config?.url.includes('/auth/refresh') ||
        response.config?.url.includes('/auth/login') ||
        response.config?.url.includes('/auth/signup')
      );

      // 인증 엔드포인트인 경우 원본 필드도 함께 보존
      if (isAuthEndpoint && typeof response.data === 'object') {
        // 원본 인증 필드 저장
        const originalAuthFields = {};
        ['access_token', 'refresh_token', 'token_type'].forEach(field => {
          if (response.data[field] !== undefined) {
            originalAuthFields[field] = response.data[field];
          }
        });
        
        // 원본 필드 보존 (둘 다 사용 가능하도록)
        if (Object.keys(originalAuthFields).length > 0) {
          Object.assign(response.data, originalAuthFields);
        }
      }

      // 캐시 저장
      if (response.config?.method === 'get') {
        cache.set(response.config.url, {
          data: response.data,
          timestamp: Date.now()
        });
      }

      return response;
    } catch (error) {
      console.error('%c 🔴 Response Transform Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', error);
      return response;
    }
  },
  async (error) => {
    // 개발 환경에서만 에러 로깅
    const isDev = process.env.NODE_ENV === 'development';
    
    // 에러 응답이 있는 경우 기본 정보 로깅
    if (isDev && error?.response) {
      console.error(`API 에러 (${error.response.status}): ${error.config?.url}`);
    }
    
    // 네트워크 오류 (응답 없음)
    if (!error.response) {
      if (isDev) {
        console.error('네트워크 오류:', error.message);
      }
      
      // 오프라인 상태 확인
      if (!navigator.onLine) {
        // 오프라인 상태 처리
        return Promise.reject({
          code: 'OFFLINE',
          message: '인터넷 연결을 확인해주세요.',
          originalError: error
        });
      }
      
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: '서버에 연결할 수 없습니다.',
        originalError: error
      });
    }
    
    // 401 Unauthorized 에러 처리 (인증 만료)
    if (error?.response?.status === 401) {
      // config가 없거나 인증 엔드포인트인 경우 토큰 갱신 시도하지 않음
      if (!error.config || error.config.url.includes('/auth/token') || 
          error.config.skipAuthRefresh || error.config._isRetry) {
        clearAuthStorage();
        
        // 로그인 페이지로 리디렉션 (인증 엔드포인트가 아닌 경우만)
        if (!error.config?.url?.includes('/auth/token')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(error);
      }
      
      try {
        // 토큰 갱신 시도
        const refreshResult = await refreshAuthToken();
        
        if (refreshResult?.accessToken) {
          // 토큰 갱신 성공 시 원래 요청 재시도
          const retryConfig = { ...error.config };
          retryConfig.headers.Authorization = `Bearer ${refreshResult.accessToken}`;
          retryConfig._isRetry = true;
          
          return api(retryConfig);
        } else {
          // 토큰 갱신 실패 시 로그아웃 처리
          clearAuthStorage();
          window.location.href = '/login';
          return Promise.reject(error);
        }
      } catch (refreshError) {
        // 토큰 갱신 중 에러 발생 시 로그아웃 처리
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
    
    // --- 에러 응답 포맷 확장: 에러 코드와 세부 메시지를 포함한 객체로 래핑 ---
    const formattedError = {
      code: error?.response?.status || 500,
      message: error?.response?.data?.message || error?.message || '알 수 없는 오류가 발생했습니다',
      data: error?.response?.data || null,
      originalError: error,
      config: {
        url: error?.config?.url || 'unknown',
        method: error?.config?.method || 'unknown',
        skipAuthRefresh: error?.config?.skipAuthRefresh || false
      }
    };
    
    return Promise.reject(formattedError);
  }
);

export default api;