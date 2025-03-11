/**
 * Socket.IO 유틸리티 함수
 */

import logger from './loggingService';

/**
 * Socket.IO 메시지 검증 및 정규화
 * @param {Object} message - 메시지 객체
 * @returns {Object|null} 정규화된 메시지 객체 또는 null
 */
export function validateMessage(message) {
  // 메시지가 없거나 객체가 아닌 경우
  if (!message || typeof message !== 'object') {
    logger.warn('SocketIO', '유효하지 않은 메시지 형식', message);
    return null;
  }
  
  return message;
}

/**
 * 재연결 지연 시간 계산
 * @param {number} attempts - 재시도 횟수
 * @param {number} baseDelay - 기본 지연 시간 (ms)
 * @param {number} maxDelay - 최대 지연 시간 (ms)
 * @returns {number} 계산된 지연 시간 (ms)
 */
export function calculateReconnectDelay(attempts, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(1.5, attempts), maxDelay);
  const jitter = Math.random() * 0.5 + 0.5; // 0.5 ~ 1.0 사이의 랜덤값
  return Math.floor(delay * jitter);
}

/**
 * 디버그 로그 출력 (개발 환경에서만)
 * @param  {...any} args - 로그 인자
 */
export function debugLog(...args) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[SocketIO]', ...args);
  }
}

/**
 * 일정 시간 간격으로만 로그 출력 (스로틀링)
 * @param {number} lastTime - 마지막 로그 시간
 * @param {number} interval - 간격 (ms)
 * @param  {...any} args - 로그 인자
 * @returns {number} 현재 시간 (다음 호출에서 lastTime으로 사용)
 */
export function throttleLog(lastTime, interval, ...args) {
  const now = Date.now();
  if (now - lastTime > interval) {
    debugLog(...args);
    return now;
  }
  return lastTime;
}

/**
 * 세션 스토리지에 데이터 저장
 * @param {string} key - 키
 * @param {*} data - 저장할 데이터
 */
export function saveToSessionStorage(key, data) {
  try {
    const serialized = JSON.stringify(data);
    sessionStorage.setItem(key, serialized);
  } catch (error) {
    logger.error('SocketIO', `세션 스토리지 저장 오류: ${key}`, error);
  }
}

/**
 * 세션 스토리지에서 데이터 가져오기
 * @param {string} key - 키
 * @param {*} defaultValue - 기본값
 * @returns {*} 저장된 데이터 또는 기본값
 */
export function getFromSessionStorage(key, defaultValue = null) {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    logger.error('SocketIO', `세션 스토리지 조회 오류: ${key}`, error);
    return defaultValue;
  }
}

/**
 * 세션 스토리지에서 데이터 삭제
 * @param {string} key - 키
 */
export function removeFromSessionStorage(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    logger.error('SocketIO', `세션 스토리지 삭제 오류: ${key}`, error);
  }
}

/**
 * WebSocket 연결 URL을 생성하는 함수
 * @returns {string} WebSocket 연결 URL
 */
export function getSocketIOURL() {
  // config.js에서 정의된 WS_BASE_URL 상수 사용
  const { WS_BASE_URL } = require('../../config');
  
  logger.info('WebSocketUtils', `Socket.IO URL 생성: ${WS_BASE_URL}`);
  
  // Socket.IO 서버는 백엔드에서 '/socket.io' 경로에 마운트되어 있으므로
  // 기본 URL만 반환하고 path 옵션은 socketio.js에서 설정함
  return WS_BASE_URL;
}

export default {
  validateMessage,
  calculateReconnectDelay,
  debugLog,
  throttleLog,
  saveToSessionStorage,
  getFromSessionStorage,
  removeFromSessionStorage,
  getSocketIOURL
}; 