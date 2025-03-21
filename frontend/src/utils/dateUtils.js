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
 * API 응답 데이터의 날짜 문자열을 KST 시간대 Date 객체로 변환합니다.
 * 
 * @param {Object|Array} data - 처리할 API 응답 데이터
 * @param {boolean} convertToKST - 기본 시간대로 변환 여부 (기본값: true)
 * @param {Array<string>} dateFields - 날짜 필드 목록
 * @returns {Object|Array} 처리된 데이터
 */
export const convertDateStrToKST = (data, convertToKST = true, dateFields = [
  'createdAt', 'lastModifiedAt', 'publishedDate', 'dateAdded', 'date_added', 'created_at', 'last_modified_at',
  'updatedAt', 'updated_at', 'publishDate', 'expireDate', 'releaseDate'
]) => {
  // 데이터가 없는 경우 빠르게 반환
  if (!data) return data;
  
  // 배열인 경우 각 항목에 대해 재귀적으로 처리
  if (Array.isArray(data)) {
    return data.map(item => convertDateStrToKST(item, convertToKST, dateFields));
  }
  
  // 객체가 아닌 경우 그대로 반환
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  // 객체에 날짜 필드가 하나도 없는 경우 빠르게 반환
  const hasAnyDateField = dateFields.some(field => field in data);
  if (!hasAnyDateField) {
    return data;
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('convertDateStrToKST 입력값:', typeof data, data ? (Array.isArray(data) ? `배열(${data.length})` : '객체') : 'null');
  }
  
  // 객체인 경우 복사본 생성
  const result = { ...data };
  
  // 날짜 필드 처리
  dateFields.forEach(field => {
    if (field in result) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`convertDateStrToKST: ${field} 필드 처리`, result[field], typeof result[field]);
      }
      
      // null, undefined, 빈 객체, 빈 문자열 등 유효하지 않은 값은 처리
      if (result[field] === null || 
          result[field] === undefined || 
          (typeof result[field] === 'object' && Object.keys(result[field]).length === 0) ||
          (typeof result[field] === 'string' && !result[field].trim())) {
        
        // 빈 객체인 경우 현재 시간으로 초기화 (선택적)
        if (field === 'createdAt' || field === 'created_at') {
          result[field] = new Date().toISOString();
        } else if (field === 'lastModifiedAt' || field === 'last_modified_at') {
          result[field] = new Date().toISOString();
        } else {
          // 다른 날짜 필드는 null로 설정
          result[field] = null;
        }
        return;
      }
      
      // ISO 문자열 형식 확인
      if (typeof result[field] === 'string') {
        // ISO 문자열 패턴 확인 (더 유연하게 변경)
        const isoPattern = /^\d{4}-\d{2}-\d{2}/;
        if (isoPattern.test(result[field])) {
          try {
            // 직접 원본 필드를 Date 객체로 변환 (MongoDB에서 온 시간은 특별 처리)
            const utcDate = parseMongoDBDate(result[field]);
            
            // 원본 필드를 Date 객체로 업데이트
            result[field] = utcDate;
            
            if (process.env.NODE_ENV === 'development') {
              // UTC 시간으로 포맷팅 (시간대 명시적 지정)
              const utcFormatted = formatInTimeZone(utcDate, 'UTC', 'yyyy-MM-dd HH:mm:ss');
              // KST 시간으로 포맷팅
              const kstFormatted = formatInTimeZone(utcDate, TIME_ZONES.DEFAULT, 'yyyy-MM-dd HH:mm:ss');
              console.log(`convertDateStrToKST: ${field} 필드 정보`, {
                원본문자열: result[field].toString(),
                원본ISO: utcDate.toISOString(),
                UTC시간: utcFormatted,
                KST시간: kstFormatted,
                시간대차이: `${TIME_ZONES.DEFAULT}와 UTC의 차이는 9시간`
              });
            }
          } catch (error) {
            console.error(`convertDateStrToKST: ${field} 필드 변환 중 오류 발생`, error);
            // 변환 실패 시 원본 값 유지
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.log(`convertDateStrToKST: ${field} 필드는 ISO 문자열 형식이 아닙니다.`);
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`convertDateStrToKST: ${field} 필드는 문자열이 아닌 ${typeof result[field]} 타입입니다.`);
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`convertDateStrToKST: ${field} 필드가 없습니다.`, {
        데이터타입: typeof data,
        데이터키: data ? Object.keys(data) : '없음',
        데이터값: JSON.stringify(data, null, 2).substring(0, 200) + (JSON.stringify(data).length > 200 ? '...' : '')
      });
    }
  });
  
  return result;
};

/**
 * MongoDB 날짜 문자열을 파싱합니다.
 * MongoDB에서 오는 날짜 문자열은 시간대 정보가 없거나 다양한 형식일 수 있으므로,
 * 여러 패턴을 처리합니다.
 * 
 * @param {string} dateStr - MongoDB에서 온 날짜 문자열
 * @return {Date} 변환된 Date 객체
 */
const parseMongoDBDate = (dateStr) => {
  if (!dateStr) return null;
  
  // 개발 환경에서 디버깅 로그
  if (process.env.NODE_ENV === 'development') {
    console.log(`parseMongoDBDate 입력값:`, dateStr, typeof dateStr);
  }
  
  try {
    // MongoDB ISODate 문자열 패턴 (시간대 정보 없음)
    const mongoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
    
    let dateObj;
    
    if (mongoPattern.test(dateStr)) {
      // MongoDB 형식이면, UTC 시간으로 간주하고 'Z' 추가
      dateObj = new Date(dateStr + 'Z');
      if (process.env.NODE_ENV === 'development') {
        console.log(`parseMongoDBDate: MongoDB 형식 감지 - ${dateStr} => ${dateStr}Z (UTC로 해석)`, dateObj.toISOString());
      }
    } else if (dateStr.endsWith('Z')) {
      // 이미 UTC 시간대 표시가 있는 경우
      dateObj = new Date(dateStr);
      if (process.env.NODE_ENV === 'development') {
        console.log(`parseMongoDBDate: ISO UTC 형식 - ${dateStr}`, dateObj.toISOString());
      }
    } else if (dateStr.includes('+')) {
      // 타임존 오프셋이 포함된 경우 (예: +09:00)
      dateObj = new Date(dateStr);
      if (process.env.NODE_ENV === 'development') {
        console.log(`parseMongoDBDate: 타임존 오프셋 포함 - ${dateStr}`, dateObj.toISOString());
      }
    } else {
      // 다른 형식의 문자열
      dateObj = new Date(dateStr);
      if (process.env.NODE_ENV === 'development') {
        console.log(`parseMongoDBDate: 기타 날짜 형식 - ${dateStr}`, dateObj.toISOString());
      }
    }
    
    // 유효한 날짜인지 확인
    if (isNaN(dateObj.getTime())) {
      console.error(`parseMongoDBDate: 유효하지 않은 날짜 - ${dateStr}`);
      return null;
    }
    
    return dateObj;
  } catch (error) {
    console.error(`parseMongoDBDate 오류:`, error, dateStr);
    return null;
  }
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
      
      // MongoDB 형식 (2025-03-21T02:27:54.630000) - Z가 없는 ISOString
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(dateValue)) {
        return parseISO(dateValue + 'Z'); // UTC로 간주하고 Z 추가
      }
      
      // ISO 형식 (이미 Z 또는 +00:00 포함)
      return parseISO(dateValue);
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
    return formatInTimeZone(date, timeZone, formatStr, { locale: ko });
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error, dateValue);
    return '-';
  }
};

// formatForDisplay 함수를 formatDate로 대체 (하위 호환성 유지)
export const formatForDisplay = formatDate;