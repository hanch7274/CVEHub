import axios from 'axios';
import { getAccessToken, clearAuthStorage } from '../../utils/storage/tokenStorage';
import { camelToSnake, snakeToCamel } from '../../utils/caseConverter';
import { refreshToken as refreshAuthToken } from '../../services/authService';
import { formatWithTimeZone, prepareDataForAPI, convertDateStrToKST, TIME_ZONES, isValid } from '../../utils/dateUtils';
import { 
  API_BASE_URL, 
  CASE_CONVERSION_CONFIG, 
  PUBLIC_ENDPOINTS,
  TOKEN_REFRESH_CONFIG
} from '../../config';
import { DATE_FORMATS } from '../../utils/dateUtils';

// 디버그 로그 설정
const DEBUG_ENABLED = TOKEN_REFRESH_CONFIG.DEBUG || false;

// 마지막 토큰 갱신 시간 추적
let lastTokenRefreshTime = 0;
let tokenRefreshRetryCount = 0;

// 디버그 로그 함수
const debugLog = (...args) => {
  if (DEBUG_ENABLED) {
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
  '/health'
];

// 날짜 처리에서 제외할 URL 패턴
const URL_NO_DATE_PROCESSING_PATTERNS = [
  '/static/',
  '/assets/'
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
  return URL_NO_LOG_PATTERNS.some(pattern => url.includes(pattern));
};

// URL 패턴에 따라 날짜 처리 여부 결정
const shouldProcessDates = (url) => {
  // 제외 패턴과 일치하는 경우 날짜 처리하지 않음
  return !URL_NO_DATE_PROCESSING_PATTERNS.some(pattern => url.includes(pattern));
};

// 날짜 문자열을 자동으로 감지하고 Date 객체로 변환하는 함수
function convertDateStringsToDate(data, url = '', path = 'root') {
  if (!data) return data;
  
  // /cves/list 엔드포인트에 대한 로그만 출력
  const isCVEListEndpoint = url && url.includes('/cves/list');
  const debugLog = isCVEListEndpoint ? console.log : () => {};
  
  // 디버깅: 변환 전 데이터 확인
  debugLog(`[convertDateStringsToDate:${url}][${path}] 변환 전 데이터 타입:`, typeof data);
  
  // 특별히 처리할 날짜 필드 목록
  const CRITICAL_DATE_FIELDS = ['createdAt', 'lastModifiedAt', 'created_at', 'last_modified_at'];
  
  // 객체인 경우 재귀적으로 처리
  if (typeof data === 'object') {
    // 배열인 경우
    if (Array.isArray(data)) {
      // 디버깅: 배열 처리 시작
      debugLog(`[convertDateStringsToDate:${url}][${path}] 배열 처리 시작, 길이:`, data.length);
      return data.map((item, index) => convertDateStringsToDate(item, url, `${path}[${index}]`));
    }
    
    // null인 경우 그대로 반환
    if (data === null) {
      // 디버깅: null 데이터 발견
      debugLog(`[convertDateStringsToDate:${url}][${path}] null 데이터 발견`);
      return data;
    }
    
    // 객체인 경우 각 필드 처리
    const result = {};
    
    // 디버깅: 객체 처리 시작 (CVE ID가 있는 경우 함께 출력)
    if (isCVEListEndpoint && data.cve_id) {
      debugLog(`[convertDateStringsToDate:${url}][${path}] 객체 처리 시작, CVE ID: ${data.cve_id}`);
    } else if (isCVEListEndpoint) {
      debugLog(`[convertDateStringsToDate:${url}][${path}] 객체 처리 시작, 필드:`, Object.keys(data).join(', '));
    }
    
    // 중요 날짜 필드 먼저 처리
    for (const field of CRITICAL_DATE_FIELDS) {
      if (field in data) {
        // 디버깅: 중요 날짜 필드 처리 (CVE ID가 있는 경우 함께 출력)
        if (isCVEListEndpoint && data.cve_id) {
          debugLog(`[convertDateStringsToDate:${url}][${path}] CVE ID: ${data.cve_id}, ${field}=${data[field]}, 타입: ${typeof data[field]}`);
        } else if (isCVEListEndpoint) {
          debugLog(`[convertDateStringsToDate:${url}][${path}] ${field}=${data[field]}, 타입: ${typeof data[field]}`);
        }
        
        if (data[field] === null || data[field] === undefined) {
          // 디버깅: null/undefined 날짜 필드 발견
          debugLog(`[convertDateStringsToDate:${url}][${path}] ${field} 필드가 null 또는 undefined`);
          result[field] = data[field];
        } else if (typeof data[field] === 'string') {
          try {
            // ISO 형식 날짜 문자열 감지 및 변환
            const dateValue = new Date(data[field]);
            if (!isNaN(dateValue.getTime())) {
              result[field] = dateValue;
              // 디버깅: 날짜 변환 성공
              debugLog(`[convertDateStringsToDate:${url}][${path}] ${field} 필드 날짜 변환 성공:`, dateValue);
            } else {
              result[field] = data[field];
              // 디버깅: 유효하지 않은 날짜 문자열
              debugLog(`[convertDateStringsToDate:${url}][${path}] ${field} 필드 유효하지 않은 날짜 문자열:`, data[field]);
            }
          } catch (error) {
            result[field] = data[field];
            // 디버깅: 날짜 변환 오류
            console.error(`[convertDateStringsToDate:${url}][${path}] ${field} 필드 날짜 변환 오류:`, error);
          }
        } else {
          result[field] = data[field];
        }
      }
    }
    
    // 나머지 필드 처리
    Object.keys(data).forEach(key => {
      if (!CRITICAL_DATE_FIELDS.includes(key)) {
        if (typeof data[key] === 'string') {
          try {
            // ISO 형식 날짜 문자열 감지 및 변환
            const dateValue = new Date(data[key]);
            if (!isNaN(dateValue.getTime())) {
              result[key] = dateValue;
            } else {
              result[key] = data[key];
            }
          } catch (error) {
            result[key] = data[key];
          }
        } else if (typeof data[key] === 'object' && data[key] !== null) {
          result[key] = convertDateStringsToDate(data[key], url, `${path}.${key}`);
        } else {
          result[key] = data[key];
        }
      }
    });
    
    return result;
  }
  
  return data;
}

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
      const shouldLog = !isExcludedFromLogging(config.url);
      
      if (shouldLog) {
        debugLog('=== Request Interceptor Debug [Start] ===');
        debugLog('1. ======= API 요청 시작 =======', {
          url: config.url,
          method: config.method,
          timestamp: formatWithTimeZone(new Date(), DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST)
        });
      }

      // 인증이 필요하지 않은 엔드포인트 체크 (로그인, 회원가입 등)
      const isPublicEndpoint = PUBLIC_ENDPOINTS.some(endpoint => config.url.includes(endpoint));

      if (shouldLog) {
        debugLog('2. Public Endpoint Check:', {
          url: config.url,
          isPublic: isPublicEndpoint
        });
      }

      if (!isPublicEndpoint) {
        if (shouldLog) {
          debugLog('3. Starting Auth Process');
        }
        
        const token = getAccessToken();
        
        if (shouldLog) {
          debugLog('4. Token Check:', {
            exists: !!token,
            preview: token ? `${token.substring(0, 20)}...` : 'No token'
          });
        }
        
        if (token) {
          try {
            if (shouldLog) {
              debugLog('5. Token Validation Start');
            }
            
            const [headerPart, payloadPart] = token.split('.');
            const payload = JSON.parse(atob(payloadPart));
            const now = Math.floor(Date.now() / 1000);
            
            if (shouldLog) {
              debugLog('6. Token Details:', {
                exp: payload.exp,
                currentTime: now,
                timeUntilExp: payload.exp - now,
                currentTimeISO: formatWithTimeZone(new Date(), DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST)
              });
            }
            
            // skipAuthRefresh 플래그가 있는 경우 토큰 갱신 로직 건너뛰기
            if (config.skipAuthRefresh) {
              if (shouldLog) {
                debugLog('7. Skipping token refresh due to skipAuthRefresh flag');
              }
              config.headers.Authorization = `Bearer ${token}`;
            }
            // 토큰 만료 체크 (만료 설정된 시간 전부터 갱신 시도)
            else if (payload.exp && (payload.exp - now < TOKEN_REFRESH_CONFIG.REFRESH_BEFORE_EXPIRY)) {
              if (shouldLog) {
                debugLog('7. Token Refresh Needed');
                debugLog('8. Starting Token Refresh');
              }
              
              try {
                // 토큰 갱신 중 플래그 설정 (중복 갱신 방지)
                if (window._tokenRefreshInProgress) {
                  if (shouldLog) {
                    debugLog('Token refresh already in progress, using current token');
                  }
                  config.headers.Authorization = `Bearer ${token}`;
                } 
                // 토큰 갱신 최소 간격 확인
                else if (Date.now() - lastTokenRefreshTime < TOKEN_REFRESH_CONFIG.MIN_REFRESH_INTERVAL) {
                  if (shouldLog) {
                    debugLog('Token refresh attempted too frequently, using current token');
                  }
                  config.headers.Authorization = `Bearer ${token}`;
                }
                // 토큰 갱신 최대 재시도 횟수 확인
                else if (tokenRefreshRetryCount >= TOKEN_REFRESH_CONFIG.MAX_RETRY_COUNT) {
                  if (shouldLog) {
                    debugLog('Maximum token refresh retry count reached, using current token');
                  }
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
                    
                    // 성공 시 재시도 카운트 초기화
                    tokenRefreshRetryCount = 0;
                    
                    if (shouldLog) {
                      debugLog('9. Refresh Result:', !!refreshResult);
                    }
                    
                    if (refreshResult) {
                      const newToken = getAccessToken();
                      if (newToken) {
                        config.headers.Authorization = `Bearer ${newToken}`;
                        
                        if (shouldLog) {
                          debugLog('10. New Token Set:', {
                            preview: `${newToken.substring(0, 20)}...`
                          });
                        }
                      } else {
                        console.error('%c 🔴 Token Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '11. New Token Missing After Refresh');
                        clearAuthStorage();
                        window.location.href = '/login';
                        return Promise.reject(new Error('Token refresh failed'));
                      }
                    }
                  } catch (refreshError) {
                    // 갱신 실패 시 플래그 해제
                    window._tokenRefreshInProgress = false;
                    
                    console.error('%c 🔴 Token Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '12. Token Refresh Failed:', refreshError);
                    if (refreshError.response?.status === 401) {
                      clearAuthStorage();
                      window.location.href = '/login';
                      return Promise.reject(refreshError);
                    }
                    config.headers.Authorization = `Bearer ${token}`;
                    
                    if (shouldLog) {
                      debugLog('13. Using Existing Token:', {
                        preview: `${token.substring(0, 20)}...`
                      });
                    }
                  }
                }
              } catch (e) {
                console.error('%c 🔴 Token Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '15. Token Validation Error:', {
                  error: e.message,
                  stack: e.stack
                });
                clearAuthStorage();
                window.location.href = '/login';
                return Promise.reject(e);
              }
            } else {
              if (shouldLog) {
                debugLog('14. Using Current Token');
              }
              
              config.headers.Authorization = `Bearer ${token.trim()}`;
            }
          } catch (e) {
            console.error('%c 🔴 Token Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '15. Token Validation Error:', {
              error: e.message,
              stack: e.stack
            });
            clearAuthStorage();
            window.location.href = '/login';
            return Promise.reject(e);
          }
        } else {
          if (shouldLog) {
            debugLog('17. No Token Available');
          }
          
          clearAuthStorage();
          window.location.href = '/login';
          return Promise.reject(new Error('Authentication required'));
        }
      } else {
        if (shouldLog) {
          debugLog('18. Skipping Auth (Public Endpoint)');
        }
      }

      // 데이터 변환: 요청 데이터와 쿼리 파라미터를 스네이크 케이스로 변환
      if (config.data && 
          config.headers['Content-Type'] !== 'application/x-www-form-urlencoded') {
        try {
          // 날짜 필드 UTC 변환 처리
          config.data = prepareDataForAPI(config.data);
          // 케이스 변환
          config.data = camelToSnake(config.data, { excludeFields: EXCLUDED_FIELDS });
        } catch (transformError) {
          console.error('%c 🔴 Transform Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Request data transform error:', transformError);
          // 변환 실패 시 원본 데이터 유지
        }
      }
      
      if (config.params) {
        try {
          config.params = camelToSnake(config.params, { excludeFields: EXCLUDED_FIELDS });
        } catch (transformError) {
          console.error('%c 🔴 Transform Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Request params transform error:', transformError);
          // 변환 실패 시 원본 데이터 유지
        }
      }

      if (!isPublicEndpoint && !config.headers.Authorization) {
        console.error('%c 🔴 Auth Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Authorization header is missing in the final config');
        return Promise.reject(new Error('Authorization header is missing'));
      }

      if (shouldLog && DEBUG_ENABLED) {
        debugLog('=== Final Request Config ===');
        debugLog('URL:', config.url);
        debugLog('Method:', config.method);
        // 중요 요청만 상세 로깅
        if (config.url.includes('/auth/') || config.url.includes('/cve/') || config.method !== 'get') {
          debugLog('Headers:', config.headers);
          debugLog('Data:', config.data);
          debugLog('Params:', config.params);
        }
        debugLog('Timestamp:', formatWithTimeZone(new Date(), DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST));
      }

      // GET 요청 캐싱
      if (config.method === 'get') {
        const url = config.url;
        if (cache.has(url)) {
          const cachedData = cache.get(url);
          // 캐시가 신선한지 확인 (예: 5분)
          if (Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
            return Promise.resolve({
              ...config,
              cachedData: cachedData.data
            });
          }
        }
      }

      // 요청 시간 기록
      config.metadata = config.metadata || {};
      config.metadata.requestTime = new Date();

      return config;
    } catch (error) {
      console.error('%c 🔴 Critical Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '=== Request Interceptor Critical Error ===');
      console.error('%c 🔴 Critical Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Error:', error);
      console.error('%c 🔴 Critical Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Stack:', error.stack);
      return Promise.reject(error);
    }
  },
  (error) => {
    console.error('%c 🔴 Request Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Request Interceptor Error:', error);
    return Promise.reject(error);
  }
);

// Response Interceptor - 수정된 부분
api.interceptors.response.use(
  (response) => {
    // 로깅 제외 대상 확인
    const shouldLog = !isExcludedFromLogging(response.config.url);
    
    try {
      // 응답 데이터가 있는 경우에만 처리
      if (response.data) {
        // 응답 데이터 형식 확인 (배열 또는 객체)
        if (Array.isArray(response.data)) {
          // 원본 데이터 (변환 전) 로깅
          if (response.data.length > 0) {
            // 첫 번째 항목을 깊은 복사
            const firstItem = JSON.parse(JSON.stringify(response.data[0]));
            // 중요 날짜 필드 이름 가능성 체크
            const allKeys = Object.keys(firstItem);
            const dateLikeKeys = allKeys.filter(key => 
              /(?:date|time|at|_?created|_?modified|_?updated|_?published|_?expire|_?release)/i.test(key)
            );
            
            // null 날짜 필드 감지
            const nullDateFields = [];
            const emptyDateFields = [];
            dateLikeKeys.forEach(key => {
              if (firstItem[key] === null) {
                nullDateFields.push(key);
              } else if (firstItem[key] === '') {
                emptyDateFields.push(key);
              }
            });
            
            // 기본 로깅
            console.log(`[axios] 원본 데이터 (배열) URL: ${response.config.url}:`, {
              items_count: response.data.length,
              first_item: firstItem,
              raw_data: JSON.stringify(response.data[0]).substring(0, 200),
              all_keys: allKeys,
              date_like_keys: dateLikeKeys,
              has_null_date_fields: nullDateFields.length > 0,
              null_date_fields: nullDateFields,
              has_empty_date_fields: emptyDateFields.length > 0,
              empty_date_fields: emptyDateFields,
              has_created_at: 'created_at' in firstItem,
              has_createdAt: 'createdAt' in firstItem,
              has_last_modified_at: 'last_modified_at' in firstItem,
              has_lastModifiedAt: 'lastModifiedAt' in firstItem,
              created_at: firstItem.created_at,
              created_at_type: typeof firstItem.created_at,
              last_modified_at: firstItem.last_modified_at,
              last_modified_at_type: typeof firstItem.last_modified_at
            });
            
            // NULL 날짜 필드가 있는 경우 경고 로그
            if (nullDateFields.length > 0 || emptyDateFields.length > 0) {
              console.warn(`[axios] 원본 데이터에 NULL/빈 날짜 필드 발견 URL: ${response.config.url}`, {
                endpoint: response.config.url,
                null_fields: nullDateFields,
                empty_fields: emptyDateFields,
                item_preview: JSON.stringify(firstItem).substring(0, 200)
              });
            }
          }
          
          // 스네이크 케이스에서 카멜 케이스로 변환(URL 정보 포함)
          response.data = response.data.map(item => snakeToCamel(item, {
            excludeFields: EXCLUDED_FIELDS,
            requestUrl: response.config.url
          }));
          
          // 카멜케이스 변환 후 로깅
          if (response.data.length > 0) {
            // 데이터 상세 확인을 위한 첫 번째 항목 복사
            const firstItem = { ...response.data[0] };
            const nullDateFields = [];
            
            // null인 날짜 필드 감지
            if (firstItem.createdAt === null) nullDateFields.push('createdAt');
            if (firstItem.lastModifiedAt === null) nullDateFields.push('lastModifiedAt');
            
            // 기본 로깅
            console.log(`[axios] 카멜케이스 변환 후 (배열) URL: ${response.config.url}:`, {
              items_count: response.data.length,
              first_item: firstItem,
              createdAt: firstItem.createdAt,
              createdAt_type: typeof firstItem.createdAt,
              lastModifiedAt: firstItem.lastModifiedAt,
              lastModifiedAt_type: typeof firstItem.lastModifiedAt,
              has_null_date_fields: nullDateFields.length > 0,
              null_date_fields: nullDateFields
            });
            
            // NULL 날짜 필드가 있으면 더 상세한 로깅
            if (nullDateFields.length > 0) {
              console.warn(`[axios] NULL 날짜 필드 감지 URL: ${response.config.url}`, {
                endpoint: response.config.url,
                method: response.config.method,
                fields: nullDateFields,
                item_preview: JSON.stringify(firstItem).substring(0, 200)
              });
            }
          }
          
          // 날짜 필드 처리
          if (shouldProcessDates(response.config.url)) {
            // 날짜 문자열을 Date 객체로 변환
            response.data = convertDateStringsToDate(response.data, response.config.url);
            
            // 날짜 변환 후 로깅
            if (response.data.length > 0) {
              console.log(`[axios] 날짜 변환 후 (배열) URL: ${response.config.url}:`, {
                items_count: response.data.length,
                first_item_createdAt: response.data[0].createdAt,
                first_item_createdAt_type: typeof response.data[0].createdAt,
                first_item_createdAt_instanceof_Date: response.data[0].createdAt instanceof Date,
                first_item_lastModifiedAt: response.data[0].lastModifiedAt,
                first_item_lastModifiedAt_type: typeof response.data[0].lastModifiedAt,
                first_item_lastModifiedAt_instanceof_Date: response.data[0].lastModifiedAt instanceof Date
              });
            }
          }
        } else if (typeof response.data === 'object' && response.data !== null) {
          // 원본 데이터 (변환 전) 로깅
          // 중요 날짜 필드 이름 가능성 체크
          const allKeys = Object.keys(response.data);
          const dateLikeKeys = allKeys.filter(key => 
            /(?:date|time|at|_?created|_?modified|_?updated|_?published|_?expire|_?release)/i.test(key)
          );
          
          // null 또는 빈 날짜 필드 감지
          const nullDateFields = [];
          const emptyDateFields = [];
          dateLikeKeys.forEach(key => {
            if (response.data[key] === null) {
              nullDateFields.push(key);
            } else if (response.data[key] === '') {
              emptyDateFields.push(key);
            }
          });
          
          // 기본 로깅
          console.log(`[axios] 원본 데이터 (객체) URL: ${response.config.url}:`, {
            data: response.data,
            all_keys: allKeys,
            date_like_keys: dateLikeKeys,
            has_null_date_fields: nullDateFields.length > 0,
            null_date_fields: nullDateFields,
            has_empty_date_fields: emptyDateFields.length > 0,
            empty_date_fields: emptyDateFields,
            created_at: response.data.created_at,
            created_at_type: typeof response.data.created_at,
            last_modified_at: response.data.last_modified_at, 
            last_modified_at_type: typeof response.data.last_modified_at
          });
          
          // NULL 날짜 필드가 있는 경우 경고 로그
          if (nullDateFields.length > 0 || emptyDateFields.length > 0) {
            console.warn(`[axios] 원본 객체 데이터에 NULL/빈 날짜 필드 발견 URL: ${response.config.url}`, {
              endpoint: response.config.url,
              null_fields: nullDateFields,
              empty_fields: emptyDateFields,
              preview: JSON.stringify(response.data).substring(0, 200)
            });
          }
          
          // 스네이크 케이스에서 카멜 케이스로 변환(URL 정보 포함)
          response.data = snakeToCamel(response.data, {
            excludeFields: EXCLUDED_FIELDS,
            requestUrl: response.config.url
          });
          
          // 카멜케이스 변환 후 로깅
          // null인 날짜 필드 감지
          const nullDateFieldsAfterConversion = [];
          if (response.data.createdAt === null) nullDateFieldsAfterConversion.push('createdAt');
          if (response.data.lastModifiedAt === null) nullDateFieldsAfterConversion.push('lastModifiedAt');
          
          console.log(`[axios] 카멜케이스 변환 후 (객체) URL: ${response.config.url}:`, {
            createdAt: response.data.createdAt,
            createdAt_type: typeof response.data.createdAt,
            lastModifiedAt: response.data.lastModifiedAt,
            lastModifiedAt_type: typeof response.data.lastModifiedAt,
            has_null_date_fields: nullDateFieldsAfterConversion.length > 0,
            null_date_fields: nullDateFieldsAfterConversion
          });
          
          // NULL 날짜 필드가 있으면 더 상세한 로깅
          if (nullDateFieldsAfterConversion.length > 0) {
            console.warn(`[axios] NULL 날짜 필드 감지 URL: ${response.config.url}`, {
              endpoint: response.config.url,
              method: response.config.method,
              fields: nullDateFieldsAfterConversion,
              data_preview: JSON.stringify(response.data).substring(0, 200)
            });
          }
          
          // 날짜 필드 처리
          if (shouldProcessDates(response.config.url)) {
            // 날짜 문자열을 Date 객체로 변환
            response.data = convertDateStringsToDate(response.data, response.config.url);
            
            // 날짜 변환 후 로깅
            console.log(`[axios] 날짜 변환 후 (객체) URL: ${response.config.url}:`, {
              createdAt: response.data.createdAt,
              createdAt_type: typeof response.data.createdAt,
              createdAt_instanceof_Date: response.data.createdAt instanceof Date,
              lastModifiedAt: response.data.lastModifiedAt,
              lastModifiedAt_type: typeof response.data.lastModifiedAt,
              lastModifiedAt_instanceof_Date: response.data.lastModifiedAt instanceof Date
            });
          }
        }
      }

      // 디버깅 로그 (개발 환경에서만)
      if (shouldLog && process.env.NODE_ENV === 'development') {
        const requestTime = response.config.metadata?.requestTime;
        const responseTime = new Date();
        const elapsedTime = requestTime ? responseTime - requestTime : 0;
        
        debugLog('=== Response Interceptor Debug ===');
        debugLog('1. Response Status:', response.status);
        debugLog('2. Response Time:', elapsedTime, 'ms');
        
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
          console.log('Preserving original auth fields alongside camelCase versions');
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
    // 에러 디버깅 정보 출력 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      console.error('%c 🔴 Response Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '=== Response Error Debug ===');
      
      // 기본 에러 정보 구성 (안전하게 접근)
      const errorInfo = {
        url: error?.config?.url || 'unknown',
        method: error?.config?.method || 'unknown',
        status: error?.response?.status || 'unknown',
        timestamp: formatWithTimeZone(new Date(), DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST)
      };
      
      console.error('%c 🔴 Response Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Error Config:', errorInfo);
    }

    // 에러 객체 표준화 - config가 없는 경우 기본값 제공
    if (!error.config) {
      // config 객체가 없는 경우 기본 config 생성
      error.config = {
        skipAuthRefresh: true, // 인증 갱신 시도하지 않음
        url: error?.request?.responseURL || 'unknown',
        method: 'unknown',
        headers: {}
      };
    }

    // response 객체가 없는 경우 생성
    if (!error.response) {
      // HTTP 상태 코드 추출 시도
      let statusCode = 500;
      if (error.message) {
        const statusMatch = error.message.match(/status code (\d+)/i);
        if (statusMatch && statusMatch[1]) {
          statusCode = parseInt(statusMatch[1], 10);
        }
      }
      
      // response 객체 생성
      error.response = {
        status: statusCode,
        data: {
          detail: error.message || '알 수 없는 오류가 발생했습니다.',
          errorCode: 'NETWORK_ERROR'
        }
      };
    }

    // 에러 응답 데이터도 변환 처리
    if (error?.response?.data) {
      try {
        // detail 필드가 있는 경우 원본 값 저장
        const originalDetail = error?.response?.data?.detail;
        const originalErrorCode = error?.response?.data?.error_code || error?.response?.data?.errorCode;
        
        // 데이터 변환 적용
        error.response.data = snakeToCamel(error.response.data, { excludeFields: EXCLUDED_FIELDS });
        
        // detail 필드 보존 (변환 후에도 원본 값 유지)
        if (originalDetail) {
          error.response.data.detail = originalDetail;
        }
        
        // errorCode 필드 보존
        if (originalErrorCode) {
          error.response.data.errorCode = originalErrorCode;
        }
      } catch (transformError) {
        // 변환 실패 시 원본 데이터 유지하고 기본 데이터 구조 확보
        if (!error.response.data.detail) {
          error.response.data.detail = error.message || '알 수 없는 오류가 발생했습니다.';
        }
        if (!error.response.data.errorCode) {
          error.response.data.errorCode = 'TRANSFORM_ERROR';
        }
      }
    } else if (error.response) {
      // response.data가 없는 경우 기본 데이터 생성
      error.response.data = {
        detail: error.message || '알 수 없는 오류가 발생했습니다.',
        errorCode: `HTTP_${error.response.status}`
      };
    }

    // 401 에러 처리 (인증 실패)
    if (error?.response?.status === 401) {
      debugLog('=== Auth Error Debug ===');
      
      // config가 없거나 인증 엔드포인트인 경우 토큰 갱신 시도하지 않음
      if (!error.config || error.config.url.includes('/auth/token')) {
        debugLog('Login attempt failed or config missing, skipping token refresh');
        clearAuthStorage();
        return Promise.reject(error);
      }

      const token = getAccessToken();
      debugLog('Current Token:', {
        exists: !!token,
        preview: token ? `${token.substring(0, 20)}...` : 'No token'
      });

      // skipAuthRefresh 옵션 확인 (undefined인 경우 기본값 false 사용)
      // config 객체가 이미 존재함이 보장됨
      const skipAuthRefresh = error.config.skipAuthRefresh === true;
      
      if (token && !error.config.url.includes('/auth/refresh') && !skipAuthRefresh) {
        try {
          // 토큰 갱신 중 플래그 확인 (중복 갱신 방지)
          if (window._tokenRefreshInProgress) {
            debugLog('Token refresh already in progress, rejecting request');
            return Promise.reject(error);
          }
          
          // 토큰 갱신 최소 간격 확인
          if (Date.now() - lastTokenRefreshTime < TOKEN_REFRESH_CONFIG.MIN_REFRESH_INTERVAL) {
            debugLog('Token refresh attempted too frequently, rejecting request');
            return Promise.reject(error);
          }
          
          // 토큰 갱신 최대 재시도 횟수 확인
          if (tokenRefreshRetryCount >= TOKEN_REFRESH_CONFIG.MAX_RETRY_COUNT) {
            debugLog('Maximum token refresh retry count reached, rejecting request');
            clearAuthStorage();
            window.location.href = '/login';
            return Promise.reject(error);
          }
          
          window._tokenRefreshInProgress = true;
          tokenRefreshRetryCount++;
          debugLog('Attempting final token refresh...');
          
          const refreshResult = await refreshAuthToken();
          
          // 갱신 완료 후 플래그 해제 및 시간 기록
          window._tokenRefreshInProgress = false;
          lastTokenRefreshTime = Date.now();
          
          // 성공 시 재시도 카운트 초기화
          tokenRefreshRetryCount = 0;
          
          if (refreshResult) {
            debugLog('Final refresh successful, retrying request...');
            const originalRequest = error.config;
            const newToken = getAccessToken();
            
            // 원본 요청 재시도 전 헤더 확인
            if (!originalRequest.headers) {
              originalRequest.headers = {};
            }
            
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            // 재시도 시 skipAuthRefresh 플래그 설정하여 무한 루프 방지
            originalRequest.skipAuthRefresh = true;
            return axios(originalRequest);
          }
        } catch (refreshError) {
          // 갱신 실패 시 플래그 해제
          window._tokenRefreshInProgress = false;
          
          console.error('%c 🔴 Auth Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Final refresh failed:', refreshError);
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