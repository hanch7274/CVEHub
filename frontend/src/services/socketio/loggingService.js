/**
 * Socket.IO 로깅 서비스
 * Socket.IO 연결 및 이벤트 로깅을 위한 유틸리티
 */

// 로그 레벨 정의
export const LOG_LEVEL = {
  DEBUG: 0,   // 디버그 로그 (매우 상세)
  INFO: 1,    // 정보성 로그 
  WARN: 2,    // 경고 로그
  ERROR: 3,   // 오류 로그
  NONE: 100   // 로깅 비활성화
};

/**
 * Socket.IO 로깅 서비스 클래스
 */
class LoggingService {
  constructor() {
    this.logLevel = process.env.NODE_ENV === 'development' ? LOG_LEVEL.INFO : LOG_LEVEL.ERROR;
    this.enabled = true;
    this.ignorePatterns = ['ping', 'pong']; // 기본적으로 핑/퐁 메시지는 무시
    this.recentLogs = [];
    this.maxLogHistory = 100; // 최대 로그 기록 수
  }

  /**
   * 로그 레벨 설정
   * @param {number} level - 로그 레벨 (LOG_LEVEL 상수 사용)
   */
  setLogLevel(level) {
    this.logLevel = level;
    this.info('LoggingService', `로그 레벨 변경: ${this._getLogLevelName(level)}`);
  }

  /**
   * 로그 레벨명 가져오기
   * @private
   */
  _getLogLevelName(level) {
    switch(level) {
      case LOG_LEVEL.DEBUG: return 'DEBUG';
      case LOG_LEVEL.INFO: return 'INFO';
      case LOG_LEVEL.WARN: return 'WARN';
      case LOG_LEVEL.ERROR: return 'ERROR';
      case LOG_LEVEL.NONE: return 'NONE';
      default: return 'UNKNOWN';
    }
  }

  /**
   * 로깅 활성화/비활성화
   * @param {boolean} enabled - 활성화 여부
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Logger] 로깅 ${this.enabled ? '활성화' : '비활성화'}`);
    }
  }

  /**
   * 로그 무시 패턴 추가
   * @param {string|RegExp} pattern - 무시할 패턴
   */
  addIgnorePattern(pattern) {
    if (pattern && !this.ignorePatterns.includes(pattern)) {
      this.ignorePatterns.push(pattern);
    }
  }

  /**
   * 로그 무시 패턴 제거
   * @param {string|RegExp} pattern - 제거할 패턴
   */
  removeIgnorePattern(pattern) {
    const index = this.ignorePatterns.indexOf(pattern);
    if (index !== -1) {
      this.ignorePatterns.splice(index, 1);
    }
  }

  /**
   * 로그 무시 여부 검사
   * @param {string} message - 로그 메시지
   * @returns {boolean} 무시 여부
   * @private
   */
  _shouldIgnore(message) {
    if (!message) return false;
    
    for (const pattern of this.ignorePatterns) {
      if (typeof pattern === 'string') {
        if (message.includes(pattern)) return true;
      } else if (pattern instanceof RegExp) {
        if (pattern.test(message)) return true;
      }
    }
    return false;
  }

  /**
   * 로그 출력 (내부 사용)
   * @param {number} level - 로그 레벨
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   * @private
   */
  _log(level, module, message, data) {
    if (!this.enabled || level < this.logLevel) return;
    if (message && this._shouldIgnore(message)) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      level: this._getLogLevelName(level),
      timestamp,
      module: module || 'SocketIO',
      message,
      data
    };
    
    // 로그 저장
    this.recentLogs.unshift(logEntry);
    if (this.recentLogs.length > this.maxLogHistory) {
      this.recentLogs.pop();
    }
    
    // 콘솔 출력
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${timestamp.split('T')[1].substring(0, 8)}] [${this._getLogLevelName(level)}] [${module || 'SocketIO'}]`;
      
      switch (level) {
        case LOG_LEVEL.DEBUG:
          console.debug(prefix, message, data || '');
          break;
        case LOG_LEVEL.INFO:
          console.info(prefix, message, data || '');
          break;
        case LOG_LEVEL.WARN:
          console.warn(prefix, message, data || '');
          break;
        case LOG_LEVEL.ERROR:
          console.error(prefix, message, data || '');
          break;
      }
    }
  }

  /**
   * 디버그 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   */
  debug(module, message, data) {
    this._log(LOG_LEVEL.DEBUG, module, message, data);
  }

  /**
   * 정보 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   */
  info(module, message, data) {
    this._log(LOG_LEVEL.INFO, module, message, data);
  }

  /**
   * 경고 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   */
  warn(module, message, data) {
    this._log(LOG_LEVEL.WARN, module, message, data);
  }

  /**
   * 오류 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} error - 오류 객체
   */
  error(module, message, error) {
    this._log(LOG_LEVEL.ERROR, module, message, error);
  }

  /**
   * 최근 로그 가져오기
   * @param {number} count - 가져올 로그 수
   * @returns {Array} 최근 로그 배열
   */
  getRecentLogs(count = 10) {
    return this.recentLogs.slice(0, Math.min(count, this.recentLogs.length));
  }

  /**
   * 로그 내보내기
   * @returns {Object} 로그 JSON 객체
   */
  exportLogs() {
    return {
      timestamp: new Date().toISOString(),
      logs: [...this.recentLogs]
    };
  }

  /**
   * 로그 정리
   */
  clearLogs() {
    this.recentLogs = [];
    this.info('LoggingService', '로그 정리 완료');
  }
}

// 싱글톤 인스턴스 생성
const logger = new LoggingService();

export default logger; 