import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, clearAuthStorage } from 'shared/utils/storage/tokenStorage';
import { camelToSnake, snakeToCamel } from 'shared/utils/caseConverter';
import { 
  normalizeDateFieldsForApi, 
  normalizeDateFieldsFromApi
} from '../../utils/dateUtils';
import { API_BASE_URL, CASE_CONVERSION_CONFIG, PUBLIC_ENDPOINTS, TOKEN_REFRESH_CONFIG } from 'config';
import { refreshToken } from 'features/auth/services/authService';

// 마지막 토큰 갱신 시간 추적
let lastTokenRefreshTime = 0;
let tokenRefreshRetryCount = 0;

// 개발 환경 확인 함수
const isDevelopment = (): boolean => {
  return typeof window !== 'undefined' 
    ? window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    : false;
};

// 전역 변수 타입 정의
declare global {
  interface Window {
    _currentApiRequest?: {
      url: string;
      method: string;
      timestamp: string;
    };
  }
}

// 커스텀 Axios 요청 설정 타입 확장
export interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  skipTransform?: boolean;
  useCache?: boolean;
  cacheMaxAge?: number;
  skipAuthRefresh?: boolean;
  metadata?: {
    requestTime: Date;
  };
  transformRequest?: ((data: any, headers?: any) => any)[];
  transformResponse?: ((data: any) => any)[];
}

// 커스텀 Axios 내부 요청 설정 타입 확장
export interface CustomInternalAxiosRequestConfig extends InternalAxiosRequestConfig {
  skipTransform?: boolean;
  useCache?: boolean;
  cacheMaxAge?: number;
  skipAuthRefresh?: boolean;
  metadata?: {
    requestTime: Date;
  };
}

// 캐시 항목 타입 정의
interface CacheItem {
  data: any;
  timestamp: number;
}

// 간소화된 로깅 함수 - 개발 환경에서만 로그 출력
const logDebug = (...args: any[]): void => {
  if (isDevelopment()) {
    console.log(...args);
  }
};

// Axios 인스턴스 생성
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30초 타임아웃
  headers: {
    'Content-Type': 'application/json'
  }
});

// 캐시 저장소
const cache = new Map<string, CacheItem>();

// 변환에서 제외할 필드 목록 (config에서 가져옴)
const EXCLUDED_FIELDS = CASE_CONVERSION_CONFIG.EXCLUDED_FIELDS;

// 로그 출력에서 제외할 URL 패턴
const URL_NO_LOG_PATTERNS: string[] = [
  '/static/',
  '/assets/',
  '/images/',
  '/favicon.ico',
  '/manifest.json'
];

// 날짜 처리에서 제외할 URL 패턴
const URL_NO_DATE_PROCESS_PATTERNS: string[] = [
  '/auth/',
  '/static/',
  '/assets/',
  '/images/'
];

// URL 패턴에 따라 로그 출력 여부 결정
const isExcludedFromLogging = (url?: string): boolean => {
  if (!url) return true;
  return URL_NO_LOG_PATTERNS.some(pattern => url.includes(pattern));
};

// URL 패턴에 따라 날짜 처리 여부 결정
const shouldProcessDates = (url?: string): boolean => {
  if (!url) return false;
  const shouldProcess = !URL_NO_DATE_PROCESS_PATTERNS.some(pattern => url.includes(pattern));
  
  // 개발 환경에서만 날짜 처리 여부 로깅
  if (isDevelopment() && url.includes('/activities')) {
    console.log(`[axios] 날짜 처리 결정: URL=${url}, 처리여부=${shouldProcess}`);
  }
  
  return shouldProcess;
};

// Request Interceptor
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<CustomInternalAxiosRequestConfig> => {
    try {
      // 전역 변수에 현재 API 요청 정보 저장 (caseConverter에서 URL 추적용)
      if (typeof window !== 'undefined') {
        window._currentApiRequest = {
          url: config.url || '',
          method: config.method || 'get',
          timestamp: new Date().toISOString()
        };
      }
      
      // 로깅 제외 대상 확인
      const shouldLog = !isExcludedFromLogging(config.url) && isDevelopment();
      
      // 요청 시작 시간 기록 (성능 측정용)
      const customConfig = config as CustomInternalAxiosRequestConfig;
      customConfig.metadata = {
        requestTime: new Date()
      };
      
      // 개발 환경에서 요청 로깅
      if (shouldLog) {
        console.log(`[axios] ${config.method?.toUpperCase()} ${config.url}`);
        
        // 요청 데이터가 있는 경우 로깅 (민감 정보 제외)
        if (config.data && typeof config.data === 'object') {
          // 비밀번호 필드는 마스킹 처리
          const sanitizedData = { ...config.data };
          if (sanitizedData.password) sanitizedData.password = '********';
          if (sanitizedData.currentPassword) sanitizedData.currentPassword = '********';
          if (sanitizedData.newPassword) sanitizedData.newPassword = '********';
          
          console.log('[axios] 요청 데이터:', sanitizedData);
        }
      }
      
      // 인증 토큰 처리 (공개 엔드포인트가 아닌 경우)
      if (config.url && !PUBLIC_ENDPOINTS.some(endpoint => config.url?.includes(endpoint))) {
        const token = getAccessToken();
        
        if (token) {
          try {
            // 토큰 만료 여부 확인
            const tokenData = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);
            
            // 토큰이 만료되었거나 만료 임박한 경우 (30초 이내) 갱신 시도
            if (tokenData.exp && tokenData.exp - currentTime < 30 && !customConfig.skipAuthRefresh) {
              const now = Date.now();
              const refreshInterval = TOKEN_REFRESH_CONFIG.MIN_REFRESH_INTERVAL || 10000; // 기본 10초
              
              // 토큰 갱신 요청 간격 제한 (너무 자주 요청하지 않도록)
              if (now - lastTokenRefreshTime > refreshInterval) {
                lastTokenRefreshTime = now;
                
                try {
                  // 토큰 갱신 시도
                  const newToken = await refreshToken();
                  if (newToken) {
                    config.headers.Authorization = `Bearer ${newToken}`;
                    tokenRefreshRetryCount = 0; // 성공 시 재시도 카운트 초기화
                  }
                } catch (refreshError) {
                  tokenRefreshRetryCount++;
                  
                  // 재시도 횟수 초과 시 로그아웃 처리
                  if (tokenRefreshRetryCount > TOKEN_REFRESH_CONFIG.MAX_RETRY || 3) {
                    clearAuthStorage();
                    tokenRefreshRetryCount = 0;
                    
                    // 개발 환경에서만 에러 로그
                    if (isDevelopment()) {
                      console.error('토큰 갱신 실패 (최대 재시도 횟수 초과):', refreshError);
                    }
                    
                    // 로그인 페이지로 리다이렉트 (선택적)
                    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                      window.location.href = '/login?session=expired';
                    }
                  }
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
            if (isDevelopment()) {
              console.error('토큰 검증 오류:', e);
            }
          }
        }
      }
      
      // 요청 데이터가 있는 경우 (POST, PUT, PATCH 등)
      if (config.data && typeof config.data === 'object' && !customConfig.skipTransform) {
        // URLSearchParams 객체는 변환하지 않음
        if (!(config.data instanceof URLSearchParams)) {
          // 날짜 필드 처리 (ISO 형식으로 변환)
          config.data = normalizeDateFieldsForApi(config.data);
          
          // 카멜 케이스를 스네이크 케이스로 변환
          config.data = camelToSnake(config.data, {
            excludeFields: EXCLUDED_FIELDS
          });
        }
      }
      
      // 캐시된 응답 확인 (GET 요청만 해당)
      if (config.method === 'get' && customConfig.useCache) {
        const cachedResponse = cache.get(config.url || '');
        
        if (cachedResponse) {
          const now = Date.now();
          const cacheAge = now - cachedResponse.timestamp;
          
          // 캐시 유효 시간 내인 경우
          if (cacheAge < (customConfig.cacheMaxAge || 60000)) { // 기본 1분
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
            }) as any;
          }
        }
      }
      
      return customConfig;
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
  (response: AxiosResponse): AxiosResponse => {
    // 로깅 제외 대상 확인
    const shouldLog = !isExcludedFromLogging(response.config.url) && isDevelopment();
    
    // 응답 시간 계산 (성능 측정용)
    const customConfig = response.config as CustomInternalAxiosRequestConfig;
    const requestTime = customConfig.metadata?.requestTime;
    let responseTime = 0;
    
    if (requestTime) {
      responseTime = new Date().getTime() - requestTime.getTime();
    }
    
    
    // skipTransform 옵션이 있는 경우 변환 건너뛰기
    if (customConfig.skipTransform) {
      return response;
    }
    
    // 날짜 필드 처리 (ISO 문자열을 Date 객체로 변환)
    if (response.data && 
        typeof response.data === 'object') {
      const url = response.config.url || '';
      const shouldProcess = shouldProcessDates(url);
      
      // 개발 환경에서만 로그 출력
      if (isDevelopment() && url.includes('/activities')) {
        console.log(`[axios] 응답 인터셉터 날짜 처리: URL=${url}, 처리여부=${shouldProcess}`);
        
        if (shouldProcess) {
          console.log(`[axios] 날짜 변환 전 timestamp 샘플:`, 
            Array.isArray(response.data.items) && response.data.items.length > 0 ? 
              response.data.items[0].timestamp : '샘플 없음');
        }
      }
      
      if (shouldProcess) {
        response.data = normalizeDateFieldsFromApi(response.data);
        
        // 개발 환경에서만 로그 출력
        if (isDevelopment() && url.includes('/activities')) {
          console.log(`[axios] 날짜 변환 후 timestamp 샘플:`, 
            Array.isArray(response.data.items) && response.data.items.length > 0 ? 
              response.data.items[0].timestamp : '샘플 없음');
        }
      }
    }
    
    // 스네이크 케이스를 카멜 케이스로 변환
    if (response.data && typeof response.data === 'object') {
      response.data = snakeToCamel(response.data, {
        excludeFields: EXCLUDED_FIELDS,
        processDate: shouldProcessDates(response.config.url)
      });
    }
    
    // GET 요청 결과 캐싱 (useCache 옵션이 있는 경우)
    if (response.config.method === 'get' && 
        (response.config as CustomInternalAxiosRequestConfig).useCache && 
        response.status === 200) {
      cache.set(response.config.url || '', {
        data: response.data,
        timestamp: Date.now()
      });
    }
    
    return response;
  },
  async (error) => {
    // 개발 환경에서만 에러 로깅
    const isDev = isDevelopment();
    
    // 에러 응답이 있는 경우 기본 정보 로깅
    if (error.response) {
      const { status, data, config } = error.response;
      
      // 개발 환경에서만 에러 로깅
      if (isDev) {
        console.error(`API 에러 (${status}): ${config.url}`);
        
        // 에러 데이터가 있으면 로깅
        if (data) {
          console.error('에러 상세:', data);
        }
      }
      
      // skipTransform 옵션이 있는 경우 변환 건너뛰기
      const customConfig = config as CustomInternalAxiosRequestConfig;
      if (customConfig.skipTransform) {
        return Promise.reject(error);
      }
      
      // 401 Unauthorized 에러 처리 (토큰 만료)
      if (status === 401 && config && !customConfig.skipAuthRefresh) {
        try {
          // 토큰 갱신 시도
          const newToken = await refreshToken();
          
          if (newToken) {
            // 갱신된 토큰으로 원래 요청 재시도
            const originalRequest = config;
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axios(originalRequest);
          }
        } catch (refreshError) {
          // 토큰 갱신 실패 시 로그아웃 처리
          clearAuthStorage();
          
          // 개발 환경에서만 에러 로그
          if (isDev) {
            console.error('토큰 갱신 실패:', refreshError);
          }
          
          // 로그인 페이지로 리다이렉트 (선택적)
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            window.location.href = '/login?session=expired';
          }
        }
      }
      
      // 응답 데이터 형식 통일 (스네이크 케이스 -> 카멜 케이스)
      if (error.response.data && typeof error.response.data === 'object') {
        error.response.data = snakeToCamel(error.response.data, {
          excludeFields: EXCLUDED_FIELDS,
          processDate: shouldProcessDates(error.response.config.url)
        });
      }
    } else if (error.request) {
      // 요청은 전송되었으나 응답이 없는 경우 (네트워크 오류 등)
      if (isDev) {
        console.error('API 요청 오류 (응답 없음):', error.message);
      }
    } else {
      // 요청 설정 과정에서 오류 발생
      if (isDev) {
        console.error('API 요청 설정 오류:', error.message);
      }
    }
    
    return Promise.reject(error);
  }
);

// 커스텀 Axios 인스턴스 타입 확장
export type CustomAxiosInstance = AxiosInstance & {
  (config: CustomAxiosRequestConfig): Promise<AxiosResponse>;
  (url: string, config?: CustomAxiosRequestConfig): Promise<AxiosResponse>;
  defaults: AxiosRequestConfig;
  getUri(config?: CustomAxiosRequestConfig): string;
  request<T = any, R = AxiosResponse<T>>(config: CustomAxiosRequestConfig): Promise<R>;
  get<T = any, R = AxiosResponse<T>>(url: string, config?: CustomAxiosRequestConfig): Promise<R>;
  delete<T = any, R = AxiosResponse<T>>(url: string, config?: CustomAxiosRequestConfig): Promise<R>;
  head<T = any, R = AxiosResponse<T>>(url: string, config?: CustomAxiosRequestConfig): Promise<R>;
  options<T = any, R = AxiosResponse<T>>(url: string, config?: CustomAxiosRequestConfig): Promise<R>;
  post<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: CustomAxiosRequestConfig): Promise<R>;
  put<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: CustomAxiosRequestConfig): Promise<R>;
  patch<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: CustomAxiosRequestConfig): Promise<R>;
};

export default api as CustomAxiosInstance;
