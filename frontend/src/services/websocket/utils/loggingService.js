/**
 * 웹소켓 모듈을 위한 중앙화된 로깅 서비스
 * 모든 로그를 일관된 형식으로 출력하고, 환경별로 로그 레벨을 관리합니다.
 */

// 로그 레벨 상수 정의
export const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// 개발 환경에서는 모든 로그 출력, 프로덕션에서는 중요 로그만 출력
const DEFAULT_LOG_LEVEL = process.env.NODE_ENV === 'development' 
  ? LOG_LEVEL.DEBUG 
  : LOG_LEVEL.WARN;

/**
 * 로깅 서비스 구현
 */
class LoggingService {
  constructor() {
    this.logLevel = DEFAULT_LOG_LEVEL;
    this.enabled = true;
    this.lastLogs = []; // 최근 로그 저장 (디버깅용)
    
    // 개발 모드에서 전역 접근 가능하도록 설정
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      window._wsLogger = this;
    }
  }

  /**
   * 로그 레벨 설정
   * @param {number} level 로그 레벨 (LOG_LEVEL 상수 사용)
   */
  setLogLevel(level) {
    this.logLevel = level;
  }

  /**
   * 로깅 활성화/비활성화
   * @param {boolean} enabled 활성화 여부
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  /**
   * 로그 저장 및 출력
   * @private
   */
  _log(level, module, message, data) {
    if (!this.enabled || level < this.logLevel) return;

    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, module, message, data };
    
    // 최근 로그 저장 (최대 100개)
    this.lastLogs.unshift(entry);
    this.lastLogs = this.lastLogs.slice(0, 100);
    
    // 실제 로그 출력
    const formattedMessage = `[${module}] ${message}`;
    
    switch (level) {
      case LOG_LEVEL.DEBUG:
        console.debug(formattedMessage, data);
        break;
      case LOG_LEVEL.INFO:
        console.info(formattedMessage, data);
        break;
      case LOG_LEVEL.WARN:
        console.warn(formattedMessage, data);
        break;
      case LOG_LEVEL.ERROR:
        console.error(formattedMessage, data);
        break;
    }
    
    return entry;
  }

  /**
   * 디버그 로그
   * @param {string} module 모듈명
   * @param {string} message 로그 메시지
   * @param {any} data 추가 데이터 (선택적)
   */
  debug(module, message, data) {
    return this._log(LOG_LEVEL.DEBUG, module, message, data);
  }

  /**
   * 정보 로그
   * @param {string} module 모듈명
   * @param {string} message 로그 메시지
   * @param {any} data 추가 데이터 (선택적)
   */
  info(module, message, data) {
    return this._log(LOG_LEVEL.INFO, module, message, data);
  }

  /**
   * 경고 로그
   * @param {string} module 모듈명
   * @param {string} message 로그 메시지
   * @param {any} data 추가 데이터 (선택적)
   */
  warn(module, message, data) {
    return this._log(LOG_LEVEL.WARN, module, message, data);
  }

  /**
   * 오류 로그
   * @param {string} module 모듈명
   * @param {string} message 로그 메시지
   * @param {Error|any} error 오류 객체 또는 추가 데이터
   */
  error(module, message, error) {
    return this._log(LOG_LEVEL.ERROR, module, message, error);
  }

  /**
   * 최근 로그 가져오기
   * @param {number} count 가져올 로그 수 (기본값: 10)
   * @returns {Array} 최근 로그 배열
   */
  getRecentLogs(count = 10) {
    return this.lastLogs.slice(0, count);
  }

  /**
   * 로그 내보내기 (JSON 형식)
   * @returns {string} JSON 형식의 로그
   */
  exportLogs() {
    return JSON.stringify(this.lastLogs, null, 2);
  }

  /**
   * 모든 로그 지우기
   */
  clearLogs() {
    this.lastLogs = [];
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
const loggingService = new LoggingService();
export default loggingService; 