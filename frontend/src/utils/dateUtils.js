import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale';

// 날짜 포맷 상수
export const DATE_FORMATS = {
  API: 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'', // API 통신용 ISO 포맷
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
  KST: 'Asia/Seoul'
};

/**
 * UTC 시간을 KST로 변환하여 포맷팅
 * @param {string|Date} date - 변환할 날짜 (ISO 문자열 또는 Date 객체)
 * @param {string} format - 출력 포맷 (기본값: yyyy-MM-dd HH:mm)
 * @returns {string} 포맷팅된 KST 시간
 */
export const formatToKST = (date, format = DATE_FORMATS.DISPLAY.DEFAULT) => {
  
  if (!date) {
    console.log('formatToKST: 날짜가 없습니다.');
    return '-';
  }
  
  // 빈 객체인 경우 처리
  if (typeof date === 'object' && Object.keys(date).length === 0) {
    console.log('formatToKST: 빈 객체가 전달되었습니다.');
    return '-';
  }
  
  try {
    // 이미 Date 객체인 경우 그대로 사용, 문자열인 경우 Date 객체로 변환
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      console.error('formatToKST: 유효하지 않은 날짜 형식입니다.', date);
      return '-';
    }
    
    // 한국 시간대로 포맷팅
    const result = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: format.includes('ss') ? '2-digit' : undefined,
      timeZone: TIME_ZONES.KST
    }).format(dateObj);
  
    return result;
  } catch (error) {
    console.error('Date formatting error:', error);
    return '-';
  }
};

/**
 * 현재 시간을 UTC 기준 ISO 문자열로 반환 (API 요청용)
 * @returns {string} UTC 기준 ISO 문자열
 */
export const getUTCTimestamp = () => {
  return new Date().toISOString();
};

/**
 * KST 시간을 UTC로 변환
 * @param {string|Date} date - 변환할 KST 시간
 * @returns {string} UTC 기준 ISO 문자열
 */
export const convertToUTC = (date) => {
  if (!date) return null;
  
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toISOString();
  } catch (error) {
    console.error('Date conversion error:', error);
    return null;
  }
};

/**
 * @deprecated Use getUTCTimestamp instead
 * 이전 버전 호환성을 위한 함수 (getUTCTimestamp로 대체 권장)
 */
export const getAPITimestamp = () => {
  console.warn('getAPITimestamp is deprecated. Use getUTCTimestamp instead.');
  return getUTCTimestamp();
};

/**
 * 특정 시간대의 시간을 다른 시간대로 변환하여 포맷팅
 * @param {Date|string} date - 변환할 날짜
 * @param {string} timeZone - 변환할 시간대 (예: 'Asia/Seoul', 'UTC')
 * @param {string} format - 출력 포맷
 * @returns {string} 포맷팅된 시간
 */
export const formatWithTimeZone = (date, timeZone, format = DATE_FORMATS.DISPLAY.DEFAULT) => {
  if (!date) return '-';
  
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: format.includes('ss') ? '2-digit' : undefined,
      timeZone: timeZone
    }).format(dateObj);
  } catch (error) {
    console.error('Date formatting error:', error);
    return '-';
  }
};

// ==================== 중앙화된 시간 처리 레이어 ====================

/**
 * API 요청 데이터에서 날짜 필드를 자동으로 UTC로 변환
 * @param {Object} data - API로 전송할 데이터
 * @param {Array<string>} dateFields - 날짜 필드 이름 배열
 * @returns {Object} 날짜 필드가 UTC로 변환된 데이터
 */
export const prepareDataForAPI = (data, dateFields = ['createdAt', 'updatedAt', 'lastModifiedDate', 'dateAdded']) => {
  if (!data) return data;
  
  const result = { ...data };
  
  dateFields.forEach(field => {
    if (result[field]) {
      result[field] = convertToUTC(result[field]);
    }
  });
  
  return result;
};

/**
 * API 응답 데이터의 날짜 필드를 처리합니다.
 * 
 * @param {Object|Array} data - 처리할 API 응답 데이터
 * @param {boolean} convertToKST - KST로 변환 여부
 * @param {Array<string>} dateFields - 날짜 필드 목록 (기본값: ['createdAt', 'updatedAt', 'lastModifiedDate', 'publishedDate', 'modifiedAt'])
 * @returns {Object|Array} 처리된 데이터
 */
export const processAPIResponse = (data, convertToKST = true, dateFields = ['createdAt', 'updatedAt', 'lastModifiedDate', 'publishedDate', 'modifiedAt']) => {
  // 데이터가 없거나 날짜 필드가 없는 경우 빠르게 반환
  if (!data) return data;
  
  // 배열인 경우 각 항목에 대해 재귀적으로 처리
  if (Array.isArray(data)) {
    return data.map(item => processAPIResponse(item, convertToKST, dateFields));
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
  
  console.log('processAPIResponse 입력값:', typeof data, data ? (Array.isArray(data) ? `배열(${data.length})` : '객체') : 'null');
  
  // 객체인 경우 복사본 생성
  const result = { ...data };
  
  // 날짜 필드 처리
  dateFields.forEach(field => {
    if (field in result) {
      console.log(`processAPIResponse: ${field} 필드 처리`, result[field], typeof result[field]);
      
      // null, undefined, 빈 객체, 빈 문자열인 경우 처리
      if (result[field] === null || 
          result[field] === undefined || 
          (typeof result[field] === 'object' && Object.keys(result[field]).length === 0) ||
          (typeof result[field] === 'string' && !result[field].trim())) {
        console.log(`processAPIResponse: ${field} 필드는 비어있습니다. null로 변환합니다.`);
        result[field] = null;
        return;
      }
      
      // ISO 문자열 형식 확인
      if (typeof result[field] === 'string') {
        
        // ISO 문자열 패턴 확인 (더 유연하게 변경)
        const isoPattern = /^\d{4}-\d{2}-\d{2}/;
        if (isoPattern.test(result[field])) {
          
          if (convertToKST) {
            result[`${field}Formatted`] = formatToKST(result[field]);
            console.log(`processAPIResponse: ${field}Formatted 필드 생성`, result[`${field}Formatted`]);
          } else {
            try {
              result[field] = new Date(result[field]);
              console.log(`processAPIResponse: ${field} 필드를 Date 객체로 변환`, result[field]);
            } catch (error) {
              console.error(`processAPIResponse: ${field} 필드 변환 중 오류 발생`, error);
              // 변환 실패 시 원본 값 유지
            }
          }
        } else {
          console.log(`processAPIResponse: ${field} 필드는 ISO 문자열 형식이 아닙니다.`);
        }
      } else {
        console.log(`processAPIResponse: ${field} 필드는 문자열이 아닌 ${typeof result[field]} 타입입니다.`);
      }
    } else {
      console.log(`processAPIResponse: ${field} 필드가 없습니다.`, {
        데이터타입: typeof data,
        데이터키: data ? Object.keys(data) : '없음',
        데이터값: JSON.stringify(data, null, 2).substring(0, 200) + (JSON.stringify(data).length > 200 ? '...' : '')
      });
    }
  });
  
  return result;
};

/**
 * 날짜 값을 UI에 표시하기 위한 형식으로 변환합니다.
 * null, undefined, 빈 객체, 빈 문자열 등 유효하지 않은 값은 '-'로 표시합니다.
 * 
 * @param {Date|string|Object} date 날짜 값
 * @param {string} format 날짜 형식 (기본값: 'YYYY-MM-DD HH:mm:ss')
 * @param {string} fallback 유효하지 않은 날짜일 경우 표시할 값 (기본값: '-')
 * @returns {string} 포맷팅된 날짜 문자열
 */
export const formatForDisplay = (date, format = 'YYYY-MM-DD HH:mm:ss', fallback = '-') => {
  try {
    // 유효하지 않은 값 처리
    if (date === null || date === undefined) {
      console.log('formatForDisplay: 날짜가 null 또는 undefined입니다.');
      return fallback;
    }
    
    // 빈 객체 처리
    if (typeof date === 'object' && Object.keys(date).length === 0) {
      console.log('formatForDisplay: 날짜가 빈 객체입니다.');
      return fallback;
    }
    
    // 빈 문자열 처리
    if (typeof date === 'string' && !date.trim()) {
      console.log('formatForDisplay: 날짜가 빈 문자열입니다.');
      return fallback;
    }
    
    // 날짜 객체로 변환
    let dateObj;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      console.log('formatForDisplay: 지원되지 않는 날짜 형식입니다.', typeof date, date);
      return fallback;
    }
    
    // 유효한 날짜인지 확인
    if (isNaN(dateObj.getTime())) {
      console.log('formatForDisplay: 유효하지 않은 날짜입니다.', date);
      return fallback;
    }
    
    // KST로 변환하여 포맷팅
    return formatWithTimeZone(dateObj, 'Asia/Seoul', format);
  } catch (error) {
    console.error('formatForDisplay 오류:', error);
    return fallback;
  }
};