import { CASE_CONVERSION } from '../config';

/**
 * 스네이크 케이스에서 카멜 케이스로 변환
 * @param {*} data 변환할 데이터
 * @param {Object} options 변환 옵션
 * @param {boolean} options.isTopLevel 최상위 레벨 호출 여부 (재귀 호출 시 false)
 * @param {Array<string>} options.excludeFields 변환에서 제외할 필드 이름 목록
 * @returns {*} 변환된 데이터
 */
export const snakeToCamel = (data, options = {}) => {
  const { 
    isTopLevel = true, 
    excludeFields = CASE_CONVERSION.EXCLUDED_FIELDS || []
  } = typeof options === 'boolean' ? { isTopLevel: options } : options;
  
  // 로깅 함수 - 디버깅 목적
  const logDebug = (message, data) => {
    if (isTopLevel) {
      console.log(`[CaseConverter] ${message}`, data);
    }
  };
  
  logDebug('변환 시작 (snake_case -> camelCase)', {
    dataType: data === null ? 'null' : typeof data,
    isArray: Array.isArray(data),
    hasData: data !== null && data !== undefined,
    excludeFields
  });
  
  // null이나 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    logDebug('null 또는 undefined 데이터 반환', data);
    return data;
  }

  // 배열인 경우 각 항목에 대해 재귀적으로 변환
  if (Array.isArray(data)) {
    const result = data.map(item => snakeToCamel(item, { isTopLevel: false, excludeFields }));
    logDebug('배열 변환 완료', { length: result.length, sample: result.slice(0, 2) });
    return result;
  }

  // 객체가 아닌 경우 그대로 반환
  if (typeof data !== 'object') {
    logDebug('객체가 아닌 데이터 반환', { type: typeof data, value: data });
    return data;
  }

  // 객체인 경우 각 키를 변환
  const result = {};
  
  Object.entries(data).forEach(([key, value]) => {
    // 제외 필드 목록에 있는 경우 변환하지 않음
    const shouldConvert = !excludeFields.includes(key);
    
    // 키 변환 (snake_case -> camelCase)
    const convertedKey = shouldConvert ? key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) : key;
    
    // 값이 객체나 배열인 경우 재귀적으로 변환
    result[convertedKey] = typeof value === 'object' && value !== null
      ? snakeToCamel(value, { isTopLevel: false, excludeFields })
      : value;
  });
  
  if (isTopLevel) {
    logDebug('변환 완료', {
      originalKeys: Object.keys(data),
      convertedKeys: Object.keys(result),
      sample: result
    });
  }
  
  return result;
};

/**
 * 카멜 케이스를 스네이크 케이스로 변환
 * @param {*} data 변환할 데이터
 * @param {Object} options 변환 옵션
 * @param {boolean} options.isTopLevel 최상위 레벨 호출 여부 (재귀 호출 시 false)
 * @param {Array<string>} options.excludeFields 변환에서 제외할 필드 이름 목록
 * @returns {*} 변환된 데이터
 */
export const camelToSnake = (data, options = {}) => {
  const { isTopLevel = true, excludeFields = [] } = options;
  
  // 로깅 함수 - 디버깅 목적
  const logDebug = (message, data) => {
    if (isTopLevel) {
      console.log(`[CaseConverter] ${message}`, data);
    }
  };
  
  logDebug('변환 시작 (camelCase -> snake_case)', {
    dataType: data === null ? 'null' : typeof data,
    isArray: Array.isArray(data),
    hasData: data !== null && data !== undefined,
    excludeFields
  });
  
  // null이나 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    logDebug('null 또는 undefined 데이터 반환', data);
    return data;
  }

  // 배열인 경우 각 항목에 대해 재귀적으로 변환
  if (Array.isArray(data)) {
    const result = data.map(item => camelToSnake(item, { isTopLevel: false, excludeFields }));
    logDebug('배열 변환 완료', { length: result.length, sample: result.slice(0, 2) });
    return result;
  }

  // 객체가 아닌 경우 그대로 반환
  if (typeof data !== 'object') {
    logDebug('객체가 아닌 데이터 반환', { type: typeof data, value: data });
    return data;
  }

  // 객체인 경우 각 키를 변환
  const result = {};
  
  Object.entries(data).forEach(([key, value]) => {
    // 제외 필드 목록에 있는 경우 변환하지 않음
    const shouldConvert = !excludeFields.includes(key);
    
    // 키 변환 (camelCase -> snake_case)
    const convertedKey = shouldConvert 
      ? key.replace(/([A-Z])/g, '_$1').toLowerCase() 
      : key;
    
    // 값이 객체나 배열인 경우 재귀적으로 변환
    result[convertedKey] = typeof value === 'object' && value !== null
      ? camelToSnake(value, { isTopLevel: false, excludeFields })
      : value;
  });
  
  if (isTopLevel) {
    logDebug('변환 완료', {
      originalKeys: Object.keys(data),
      convertedKeys: Object.keys(result),
      sample: result
    });
  }
  
  return result;
};