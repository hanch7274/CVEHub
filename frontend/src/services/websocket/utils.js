// frontend/src/services/websocket/utils.js

// 메시지 검증 및 정규화
export function validateAndNormalizeMessage(message) {
  // 메시지가 없거나 객체가 아닌 경우
  if (!message || typeof message !== 'object') {
    return null;
  }
  
  // 타입이 없는 경우
  if (!message.type) {
    return null;
  }
  
  const type = message.type;
  const data = message.data || {};
  const validatedData = { ...data };
  
  // CVE 업데이트 관련 메시지인 경우 필드 이름 검증
  if (type === 'cve_updated') {
    // 필드 이름이 없으면 적절한 기본값 할당
    if (!validatedData.field) {
      console.warn('[WebSocket] 메시지에 field 속성이 없습니다. 기본값 "general"로 설정합니다.');
      validatedData.field = 'general';
    }
    
    // 필드 이름이 카멜케이스로 되어 있으면 스네이크 케이스로 변환
    if (validatedData.field === 'snortRules') {
      console.info('[WebSocket] 필드명을 카멜케이스에서 스네이크 케이스로 변환: snortRules -> snort_rules');
      validatedData.field = 'snort_rules';
    }
    
    // cveId 필드 확인
    if (!validatedData.cveId) {
      console.error('[WebSocket] 메시지에 cveId가 없습니다!', validatedData);
    }
  }
  
  // 메시지 반환 (원본 유지, data만 검증된 것으로 교체)
  return {
    ...message,
    data: validatedData
  };
}

// 재연결 지연 시간 계산 (지수 백오프)
export function calculateReconnectDelay(attempts, baseDelay = 1000, maxDelay = 30000) {
  // 지수 백오프: 재시도 횟수에 따라 지연 시간을 증가시킴
  const delay = baseDelay * Math.pow(1.5, attempts);
  // 최대 지연 시간으로 제한
  return Math.min(delay, maxDelay);
}

// 디버그 메시지 출력 (환경에 따라 다르게 처리)
export function debugLog(...args) {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}

// 로그 메시지 제한 (특정 간격으로만 출력)
export function throttleLog(lastTime, interval, ...args) {
  const now = Date.now();
  if (!lastTime || (now - lastTime) > interval) {
    console.log(...args);
    return now;
  }
  return lastTime;
}

// 브라우저 세션 스토리지에 데이터 저장
export function saveToSessionStorage(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`[WebSocket] 세션 스토리지 저장 실패 (${key}):`, error);
    return false;
  }
}

// 브라우저 세션 스토리지에서 데이터 로드
export function getFromSessionStorage(key, defaultValue = null) {
  try {
    const data = sessionStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`[WebSocket] 세션 스토리지 로드 실패 (${key}):`, error);
    return defaultValue;
  }
}

// 브라우저 세션 스토리지에서 데이터 삭제
export function removeFromSessionStorage(key) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[WebSocket] 세션 스토리지 삭제 실패 (${key}):`, error);
    return false;
  }
} 