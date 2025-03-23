/**
 * 케이스 변환 유틸리티
 * humps 라이브러리를 사용하여 camelCase와 snake_case 간 변환을 처리합니다.
 */
import { camelizeKeys, decamelizeKeys } from 'humps';

/**
 * 날짜 필드 자동 변환 기능
 * 날짜 문자열을 Date 객체로 자동 변환하는 함수
 * @param {Object} data 변환할 데이터
 * @returns {Object} 변환된 데이터
 */
const convertDateFields = (data) => {
  if (!data) return data;
  
  // 배열인 경우 각 항목에 재귀적으로 적용
  if (Array.isArray(data)) {
    return data.map(item => convertDateFields(item));
  }
  
  // 객체가 아니거나 null이면 그대로 반환
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  // Date 객체인 경우 그대로 반환
  if (data instanceof Date) {
    return data;
  }
  
  // 날짜 필드 패턴 (날짜를 나타내는 키 이름)
  const dateFieldPattern = /^(created_?at|last_?modified_?at|update[d_]?at|date_?added|published_?date|expire_?date|timestamp)$/i;
  
  // 변환 결과 저장을 위한 새 객체
  const result = { ...data };
  
  // 객체의 모든 속성 검사
  Object.entries(data).forEach(([key, value]) => {
    // 1. 날짜 필드 이름인 경우
    if (dateFieldPattern.test(key)) {
      // 날짜 필드에 대한 자세한 정보 로깅
      if (process.env.NODE_ENV === 'development') {
        console.log(`[caseConverter] 날짜 필드 처리 - '${key}':`, {
          value,
          type: typeof value,
          isNull: value === null,
          isEmpty: value === '',
          isString: typeof value === 'string',
          isDate: value instanceof Date,
          isObject: typeof value === 'object' && value !== null && !(value instanceof Date),
          pattern_match: typeof value === 'string' ? /^\d{4}-\d{2}-\d{2}T/.test(value) : false
        });
      }
      
      // 문자열이고 유효한 날짜 형식인 경우
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        try {
          const date = new Date(value);
          // 유효한 날짜인 경우에만 변환
          if (!isNaN(date.getTime())) {
            result[key] = date;
            if (process.env.NODE_ENV === 'development') {
              console.log(`[caseConverter] '${key}' 날짜 변환 성공:`, {
                원본: value,
                변환결과: date,
                ISO문자열: date.toISOString()
              });
            }
          } else {
            console.warn(`[caseConverter] '${key}' 유효하지 않은 날짜: ${value}`);
          }
        } catch (e) {
          // 변환 실패 시 원본 유지
          console.warn(`[caseConverter] '${key}' 날짜 변환 실패:`, e);
        }
      }
      // Date 객체인 경우 그대로 유지
      else if (value instanceof Date) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[caseConverter] '${key}' 이미 Date 객체임, 그대로 유지`);
        }
      }
      // 빈 객체인 경우
      else if (typeof value === 'object' && value !== null && !(value instanceof Date) && Object.keys(value).length === 0) {
        result[key] = null;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[caseConverter] '${key}' 빈 객체를 null로 변환`);
        }
      }
      // null인 경우 로그
      else if (value === null) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[caseConverter] '${key}' 필드가 null 값임`);
        }
      }
      // 빈 문자열인 경우
      else if (value === '') {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[caseConverter] '${key}' 필드가at 빈 문자열임`);
        }
      }
    }
    // 2. 중첩된 객체인 경우 재귀적으로 처리
    else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      result[key] = convertDateFields(value);
    }
  });
  
  return result;
};

/**
 * 스네이크 케이스에서 카멜 케이스로 변환
 * @param {*} data 변환할 데이터
 * @param {Object} options 변환 옵션
 * @param {Array<string>} options.excludeFields 변환에서 제외할 필드 이름 목록
 * @param {boolean} options.processDate 날짜 필드 자동 변환 여부
 * @returns {*} 변환된 데이터
 */
export const snakeToCamel = (data, options = {}) => {
  const { 
    excludeFields = [],
    processDate = true,
    requestUrl = 'unknown'
  } = options;
  
  // null 또는 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    return data;
  }
  
  try {
    // 날짜 자동 변환 전 원본 데이터 보존 (디버깅용)
    if (processDate && process.env.NODE_ENV === 'development') {
      console.log('snakeToCamel 변환 전:', {
        data: typeof data === 'object' ? { ...data } : data,
        type: typeof data,
        isArray: Array.isArray(data),
      });
    }
    
    // 1. 날짜 필드 처리 (카멜케이스 변환 전)
    let processedData = processDate ? convertDateFields(data) : data;
    
    // 2. humps 라이브러리로 카멜케이스 변환
    let camelizedData = camelizeKeys(processedData, (key, convert) => {
      // 제외 필드 목록에 있는 경우 변환하지 않음
      return excludeFields.includes(key) ? key : convert(key);
    });
    
    // 3. 환경이 개발 모드인 경우 추가 디버깅 로그
    if (processDate && process.env.NODE_ENV === 'development') {
      // 요청 URL은 이미 options에서 추출했으므로 추가 처리 필요 없음
      // (options에서 { requestUrl = 'unknown' }으로 기본값 설정)
      
      // 주요 날짜 필드의 변환 결과 확인
      const dateFields = ['createdAt', 'lastModifiedAt', 'created_at', 'last_modified_at'];
      const dateFieldStatus = {};
      const nullDateFields = [];
      
      dateFields.forEach(field => {
        if (camelizedData && typeof camelizedData === 'object') {
          const value = camelizedData[field];
          // null인 날짜 필드 추적
          if (field in camelizedData && value === null) {
            nullDateFields.push(field);
          }
          
          dateFieldStatus[field] = {
            exists: field in camelizedData,
            value,
            type: typeof value,
            isDate: value instanceof Date,
            isNull: value === null,
            isEmpty: value === ''
          };
        }
      });
      
      // null인 날짜 필드가 있으면 추가 로깅
      if (nullDateFields.length > 0) {
        console.warn(`[snakeToCamel] NULL 날짜 필드 감지 [URL: ${requestUrl}]:`, {
          fields: nullDateFields,
          data_preview: camelizedData ? JSON.stringify(camelizedData).substring(0, 300) : 'no data'
        });
      }
      
      if (Object.keys(dateFieldStatus).length > 0) {
        console.log(`snakeToCamel 변환 후 날짜 필드 [URL: ${requestUrl}]:`, dateFieldStatus);
      }
    }
    
    return camelizedData;
  } catch (error) {
    console.error('snakeToCamel 변환 오류:', error);
    return data; // 오류 발생 시 원본 반환
  }
};

/**
 * 카멜 케이스를 스네이크 케이스로 변환
 * @param {*} data 변환할 데이터
 * @param {Object} options 변환 옵션
 * @param {Array<string>} options.excludeFields 변환에서 제외할 필드 이름 목록
 * @returns {*} 변환된 데이터
 */
export const camelToSnake = (data, options = {}) => {
  const { excludeFields = [] } = options;
  
  // null 또는 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    return data;
  }
  
  try {
    // humps 라이브러리로 스네이크케이스 변환
    return decamelizeKeys(data, (key, convert, options) => {
      // 제외 필드 목록에 있는 경우 변환하지 않음
      return excludeFields.includes(key) ? key : convert(key, options);
    });
  } catch (error) {
    console.error('camelToSnake 변환 오류:', error);
    return data; // 오류 발생 시 원본 반환
  }
};