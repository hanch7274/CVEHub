import { format, parseISO, isValid } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { ko } from 'date-fns/locale';

// 날짜 포맷 상수
export const DATE_FORMATS = {
  API: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", // API 통신용 ISO 포맷 (모든 문자를 작은따옴표로 이스케이프)
  DISPLAY: {
    DEFAULT: 'yyyy-MM-dd HH:mm',
    DATE_ONLY: 'yyyy-MM-dd',
    TIME_ONLY: 'HH:mm:ss',
    FULL: 'yyyy-MM-dd HH:mm:ss',
    YEAR_MONTH: 'yyyy-MM'
  }
};

// 시간대 상수
export const TIME_ZONES = {
  UTC: 'UTC',
  KST: 'Asia/Seoul',
  DEFAULT: process.env.REACT_APP_DEFAULT_TIMEZONE || 'Asia/Seoul'
};

/**
 * UTC 시간을 기본 시간대(DEFAULT)로 변환하여 포맷팅
 * @param {string|Date} date - 변환할 날짜 (ISO 문자열 또는 Date 객체)
 * @param {string} format - 출력 포맷 (기본값: yyyy-MM-dd HH:mm)
 * @returns {string} 포맷팅된 시간
 */
export const formatToKST = (date, format = DATE_FORMATS.DISPLAY.DEFAULT) => {
  if (!date) {
    return '-';
  }
  
  try {
    // date-fns-tz의 formatInTimeZone 함수 사용
    return formatInTimeZone(
      date instanceof Date ? date : new Date(date),
      TIME_ZONES.DEFAULT,
      format,
      { locale: ko }
    );
  } catch (error) {
    console.error('formatToKST 오류:', error);
    return '-';
  }
};

/**
 * 특정 시간대의 시간을 다른 시간대로 변환하여 포맷팅
 * date-fns-tz의 formatInTimeZone 함수를 직접 사용하는 간단한 래퍼
 * @param {string|Date} date - 변환할 날짜 (ISO 문자열 또는 Date 객체)
 * @param {string} formatStr - 출력 포맷 (기본값: yyyy-MM-dd HH:mm)
 * @param {string} timeZone - 변환할 시간대 (기본값: KST)
 * @returns {string} 포맷팅된 시간
 */
export const formatWithTimeZone = (
  date,
  formatStr = DATE_FORMATS.DISPLAY.DEFAULT,
  timeZone = TIME_ZONES.KST
) => {
  if (!date) {
    return '-';
  }
  
  try {
    // date-fns-tz의 formatInTimeZone 함수 사용
    return formatInTimeZone(
      date instanceof Date ? date : new Date(date),
      timeZone,
      formatStr,
      { locale: ko }
    );
  } catch (error) {
    console.error('formatWithTimeZone 오류:', error);
    return '-';
  }
};

/**
 * ISO 문자열 현재 시간 반환 (UTC 기준)
 * @returns {string} ISO 포맷의 UTC 시간
 */
export const getUTCTimestamp = () => {
  return new Date().toISOString();
};

/**
 * API 요청 데이터에서 날짜 필드를 자동으로 UTC로 변환
 * @param {Object} data - API로 전송할 데이터
 * @param {Array<string>} dateFields - 날짜 필드 이름 배열
 * @returns {Object} 날짜 필드가 UTC로 변환된 데이터
 */
export const prepareDataForAPI = (data, dateFields = ['createdAt', 'lastModifiedAt', 'dateAdded']) => {
  if (!data) return data;
  
  const result = { ...data };
  
  dateFields.forEach(field => {
    if (result[field]) {
      // Date 객체면 ISO 문자열로 변환
      if (result[field] instanceof Date) {
        result[field] = result[field].toISOString();
      }
      // 문자열이 아니면 변환 시도
      else if (typeof result[field] !== 'string') {
        try {
          result[field] = new Date(result[field]).toISOString();
        } catch (error) {
          console.error(`prepareDataForAPI: ${field} 필드 변환 오류`, error);
        }
      }
    }
  });
  
  return result;
};

/**
 * 날짜 데이터 파싱 함수 (통합)
 * 다양한 형식의 날짜 입력을 Date 객체로 변환
 * @param {string|Date|number} dateValue - 변환할 날짜 값 (MongoDB 형식 문자열, ISO 문자열, Date 객체, 타임스탬프)
 * @returns {Date|null} - 변환된 Date 객체 또는 변환 실패 시 null
 */
export const parseDate = (dateValue) => {
  if (!dateValue) return null;
  
  try {
    // 이미 Date 객체인 경우
    if (dateValue instanceof Date) {
      return isValid(dateValue) ? dateValue : null;
    }
    
    // 빈 객체인 경우
    if (typeof dateValue === 'object' && Object.keys(dateValue).length === 0) {
      return null;
    }
    
    // 문자열인 경우
    if (typeof dateValue === 'string') {
      if (!dateValue.trim()) return null;
      
      // MongoDB ISODate 문자열 패턴 (시간대 정보 없음)
      const mongoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
      // ISO 8601 형식 (Z 또는 +/-로 시간대 정보 포함)
      const isoWithTZPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/i;
      
      let dateObj;
      
      
      if (mongoPattern.test(dateValue)) {
        // MongoDB 형식이면, 백엔드에서 UTC로 저장된다는 것을 알고 있으므로 'Z' 추가
        // CVEList API에서 오는 형식
        dateObj = new Date(dateValue + 'Z');
      } else if (isoWithTZPattern.test(dateValue)) {
        // 이미 시간대 정보가 포함된 ISO 형식 (CVEDetail API에서 오는 형식)
        dateObj = new Date(dateValue);
      } else {
        // 기타 형식은 기본 변환 시도
        dateObj = new Date(dateValue);
      }
      
      // 유효한 날짜인지 확인
      if (!isNaN(dateObj.getTime())) {
        return dateObj;
      }
      
      // 유효하지 않은 경우 로깅
      console.warn(`유효하지 않은 날짜 문자열: ${dateValue}`);
      return null;
    }
    
    // 숫자(타임스탬프)인 경우
    if (typeof dateValue === 'number') {
      return new Date(dateValue);
    }
    
    return null;
  } catch (error) {
    console.error('날짜 파싱 오류:', error, dateValue);
    return null;
  }
};

// date-fns의 isValid 함수 재내보내기
export { isValid };

/**
 * UI 표시용 날짜/시간 포맷팅 (개선 버전)
 * 내부적으로 parseDate를 사용하여 다양한 입력값 처리
 * @param {string|Date|number} dateValue - 포맷팅할 날짜 값
 * @param {string} formatStr - 포맷 문자열 (기본값: DATE_FORMATS.DISPLAY.DEFAULT)
 * @param {string} timeZone - 시간대 (기본값: TIME_ZONES.KST)
 * @returns {string} 포맷팅된 날짜 문자열
 */
export const formatDate = (dateValue, formatStr = DATE_FORMATS.DISPLAY.DEFAULT, timeZone = TIME_ZONES.KST) => {
  const date = parseDate(dateValue);
  
  if (!date) return '-';
  
  try {
    // 개발 환경에서만 디버깅 로그 출력
    if (process.env.NODE_ENV === 'development') {
      // 디버깅이 필요한 경우에만 주석 해제하여 사용
      // console.log('formatDate 입력:', {
      //   입력값: dateValue,
      //   파싱결과: date,
      //   시간대: timeZone
      // });
    }
    
    // date-fns-tz의 formatInTimeZone 함수를 사용하여 명시적으로 시간대 변환
    // 백엔드에서 모든 시간 데이터는 UTC+0 기준으로 저장되므로, 이를 지정된 시간대로 변환
    const formattedResult = formatInTimeZone(date, timeZone, formatStr, { locale: ko });
    
    return formattedResult;
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error, dateValue);
    return '-';
  }
};

/**
 * API 응답 데이터의 날짜 필드를 자동으로 처리하는 함수
 * 백엔드에서 오는 다양한 형식의 날짜를 일관되게 Date 객체로 변환
 * @param {Object|Array} data - API 응답 데이터 (객체 또는 배열)
 * @param {string} requestUrl - 요청 URL (디버깅 용도)
 * @returns {Object|Array} 날짜 필드가 처리된 데이터
 */
export const processApiDates = (data, requestUrl = '') => {
  if (!data) return data;
  
  // 처리를 건너뛸 URL 패턴
  if (shouldSkipDateProcessing(requestUrl)) return data;
  
  // 날짜 필드 후보 (카멜케이스와 스네이크케이스 모두 포함)
  const dateFieldCandidates = [
    // 카멜케이스
    'createdAt', 'lastModifiedAt', 'updatedAt', 'publishedAt', 
    'releaseDate', 'expiryDate', 'startDate', 'endDate',
    'dateAdded', 'dateModified', 'datePublished', 'dateCreated',
    // 스네이크케이스
    'created_at', 'last_modified_at', 'updated_at', 'published_at',
    'release_date', 'expiry_date', 'start_date', 'end_date',
    'date_added', 'date_modified', 'date_published', 'date_created'
  ];
  
  try {
    // 배열인 경우 각 항목에 대해 재귀적으로 처리
    if (Array.isArray(data)) {
      return data.map(item => processApiDates(item, requestUrl));
    }
    
    // 객체가 아니거나 null인 경우 그대로 반환
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    // Date 객체는 그대로 반환
    if (data instanceof Date) return data;
    
    // 결과 객체 생성 (얕은 복사)
    const result = { ...data };
    
    // 날짜 필드 후보 처리
    dateFieldCandidates.forEach(field => {
      if (field in result && result[field] !== null && result[field] !== undefined) {
        const originalValue = result[field];
        
        // 이미 Date 객체인 경우 변환하지 않음
        if (originalValue instanceof Date) {
          return;
        }
        
        const parsedDate = parseDate(originalValue);
        
        if (parsedDate) {
          result[field] = parsedDate;
        }
      }
    });
    
    // 중첩된 객체 처리 (1단계만)
    Object.keys(result).forEach(key => {
      if (
        result[key] && 
        typeof result[key] === 'object' && 
        !Array.isArray(result[key]) && 
        !(result[key] instanceof Date)
      ) {
        result[key] = processApiDates(result[key], `${requestUrl}/${key}`);
      }
    });
    
    return result;
  } catch (error) {
    console.error('API 날짜 처리 오류:', error, { data, requestUrl });
    return data; // 오류 발생 시 원본 데이터 반환
  }
};

/**
 * 특정 URL 패턴에 대해 날짜 처리를 건너뛸지 결정하는 함수
 * @param {string} url - 요청 URL
 * @returns {boolean} 날짜 처리를 건너뛸지 여부
 */
const shouldSkipDateProcessing = (url = '') => {
  // 처리를 건너뛸 URL 패턴 목록
  const skipPatterns = [
    '/static/', 
    '/assets/', 
    '/auth/login', 
    '/auth/register',
    '/users/search'
  ];
  
  return skipPatterns.some(pattern => url.includes(pattern));
};

/**
 * 주어진 타임스탬프로부터 경과된 시간을 한국어로 표시
 * @param {number|string|Date} timestamp - 비교할 타임스탬프 (밀리초 단위)
 * @returns {string} 경과 시간 문자열 (예: '5초', '10분', '2시간', '3일')
 */
export const timeAgo = (timestamp) => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    // 유효하지 않은 날짜인 경우
    if (!isValid(date)) {
      return '-';
    }
    
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 0) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    return `${Math.floor(seconds / 86400)}일 전`;
  } catch (error) {
    console.error('timeAgo 오류:', error);
    return '-';
  }
};