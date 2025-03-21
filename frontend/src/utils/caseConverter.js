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
    excludeFields = []
  } = typeof options === 'boolean' ? { isTopLevel: options } : options;
  
  // null 또는 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    return data;
  }
  
  // 배열인 경우 각 요소를 재귀적으로 변환
  if (Array.isArray(data)) {
    return data.map(item => snakeToCamel(item, { isTopLevel: false, excludeFields }));
  }
  
  // 객체가 아닌 경우 그대로 반환
  if (typeof data !== 'object') {
    return data;
  }

  // 객체인 경우 각 키를 변환
  const result = {};
  
  Object.entries(data).forEach(([key, value]) => {
    // 제외 필드 목록에 있는 경우 변환하지 않음
    const shouldConvert = !excludeFields.includes(key);
    
    // 이미 카멜 케이스인 경우 변환하지 않음
    const isAlreadyCamel = !key.includes('_');
    
    // 키 변환 (snake_case -> camelCase)
    const convertedKey = shouldConvert && !isAlreadyCamel 
      ? key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) 
      : key;
    
    // 값 처리
    let processedValue = value;
    
    // null 또는 undefined인 경우 그대로 사용
    if (value === null || value === undefined) {
      processedValue = value;
    }
    // 날짜 필드이고 빈 객체인 경우 null로 변환 (특수 처리)
    else if ((key === 'created_at' || key === 'last_modified_at' || key === 'createdAt' || key === 'lastModifiedAt') &&
        typeof value === 'object' && Object.keys(value).length === 0) {
      processedValue = null;
    } else if (typeof value === 'object') {
      // 일반적인 객체나 배열인 경우 재귀적으로 변환
      processedValue = snakeToCamel(value, { isTopLevel: false, excludeFields });
    }
    
    result[convertedKey] = processedValue;
  });
  
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
  const { 
    isTopLevel = true, 
    excludeFields = [] 
  } = typeof options === 'boolean' ? { isTopLevel: options } : options;
  
  // null이나 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    return data;
  }

  // 배열인 경우 각 항목에 대해 재귀적으로 변환
  if (Array.isArray(data)) {
    return data.map(item => camelToSnake(item, { isTopLevel: false, excludeFields }));
  }

  // 객체가 아닌 경우 그대로 반환
  if (typeof data !== 'object') {
    return data;
  }

  // 객체인 경우 각 키를 변환
  const result = {};
  
  Object.entries(data).forEach(([key, value]) => {
    // 제외 필드 목록에 있는 경우 변환하지 않음
    const shouldConvert = !excludeFields.includes(key);
    
    // 이미 스네이크 케이스인 경우 변환하지 않음
    const isAlreadySnake = key.includes('_');
    
    // 키 변환 (camelCase -> snake_case)
    const convertedKey = shouldConvert && !isAlreadySnake
      ? key.replace(/([A-Z])/g, '_$1').toLowerCase() 
      : key;
    
    // 값이 객체나 배열인 경우 재귀적으로 변환
    let processedValue = value;
    if (value === null || value === undefined) {
      processedValue = value;
    } else if (typeof value === 'object') {
      processedValue = camelToSnake(value, { isTopLevel: false, excludeFields });
    }
    
    result[convertedKey] = processedValue;
  });
  
  return result;
};