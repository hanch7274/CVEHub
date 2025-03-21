/**
 * Socket.IO 유틸리티 함수
 */
import { WS_BASE_URL } from '../../config';
import logger from '../../utils/logging';

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
    const [message, ...data] = args;
    logger.debug('SocketIO', message, data.length > 0 ? data : undefined);
  }
}

/**
 * 일정 시간 간격으로만 로그 출력 (스로틀링)
 * @param {number} lastTime - 마지막 로그 시간
 * @param {number} interval - 간격 (ms)
 * @param {string} message - 로그 메시지
 * @param {Object} [data] - 로그 데이터
 * @returns {number} 현재 시간 (다음 호출에서 lastTime으로 사용)
 */
export function throttleLog(lastTime, interval, message, data) {
  const now = Date.now();
  if (now - lastTime > interval) {
    logger.debug('SocketIO', message, data);
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
 * Socket.IO 연결을 위한 WebSocket URL을 생성합니다.
 * 환경(브라우저 vs Node.js)과 실행 환경(개발 vs 프로덕션)에 따라 적절한 URL을 반환합니다.
 * 
 * @returns {string} Socket.IO 서버 URL
 */
export function getSocketIOURL() {
  // 브라우저 환경 감지
  const isBrowser = typeof window !== 'undefined';
  
  // 환경 변수에서 WebSocket URL 가져오기 (최우선)
  const envWsUrl = process.env.REACT_APP_WS_URL;
  if (envWsUrl) {
    // 프로토콜 제거 (Socket.IO 클라이언트가 자동으로 처리)
    const cleanUrl = envWsUrl.replace(/^(https?:\/\/|wss?:\/\/)/i, '');
    console.log(`[환경 변수] Socket.IO URL 사용: ${cleanUrl}`);
    return cleanUrl;
  }
  
  if (isBrowser) {
    // 현재 페이지의 호스트 정보 추출
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname; // 도메인 이름만 (예: localhost 또는 127.0.0.1)
    
    // 백엔드 포트 (기본값 8000)
    const backendPort = '8000';
    
    // 백엔드 서버 URL 생성 (현재 접속한 호스트 + 백엔드 포트)
    const host = `${hostname}:${backendPort}`;
    console.log(`[현재 호스트 기반] Socket.IO URL 생성: ${host}`);
    return host;
  }
  
  // Node.js 환경 (SSR 등) 또는 fallback
  try {
    // 설정에서 기본 URL 가져오기 (프로토콜 제거)
    const baseUrl = WS_BASE_URL || 'localhost:8000';
    const cleanUrl = baseUrl.replace(/^(https?:\/\/|wss?:\/\/)/i, '');
    console.log(`[기본 설정] Socket.IO URL 사용: ${cleanUrl}`);
    return cleanUrl;
  } catch (error) {
    console.error('WebSocket URL 생성 중 오류 발생:', error);
    // 기본값으로 localhost 반환 (프로토콜 없이)
    return 'localhost:8000';
  }
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