/**
 * 스네이크 케이스에서 카멜 케이스로 변환
 * @param {*} data 변환할 데이터
 * @param {boolean} isTopLevel 최상위 레벨 호출 여부 (재귀 호출 시 false)
 * @returns {*} 변환된 데이터
 */
export const snakeToCamel = (data, isTopLevel = true) => {
  const isDebug = process.env.NODE_ENV === 'development';
  
  // 디버깅용 변환 전 데이터 로깅 - 최상위 레벨의 유의미한 객체만 로깅
  if (isDebug && isTopLevel && data !== null && typeof data === 'object' && Object.keys(data).length > 0) {
    // 200자 제한으로 로그 길이 제한
    const stringData = JSON.stringify(data);
    const truncatedData = stringData.length > 200 
      ? stringData.substring(0, 197) + '...' 
      : stringData;
    
    // 웹소켓 메시지와 같은 특정 유형의 데이터만 로깅
    if (data.type && (data.type.includes('crawler') || data.type === 'ping' || data.type === 'pong')) {
      console.log('[변환] 스네이크->카멜 입력 (메시지):', truncatedData);
    }
  }
  
  // null이나 기본 타입은 그대로 반환
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }

  // 배열인 경우 각 요소를 재귀적으로 변환 (최상위 레벨 아님)
  if (Array.isArray(data)) {
    return data.map(item => snakeToCamel(item, false));
  }

  // 객체인 경우 각 키를 변환하고 값을 재귀적으로 변환
  return Object.keys(data).reduce((result, key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = snakeToCamel(data[key], false);
    return result;
  }, {});
};

// 카멜 케이스를 스네이크 케이스로 변환
export const camelToSnake = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    acc[snakeKey] = camelToSnake(obj[key]);
    return acc;
  }, {});
}; 