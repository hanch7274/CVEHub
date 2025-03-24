/**
 * 중앙화된 로깅 서비스
 * 애플리케이션 전체에서 사용되는 로깅 시스템
 * 
 * 로그 레벨 가이드라인:
 * - DEBUG: 개발 중 디버깅에 필요한 상세 정보 (예: 함수 호출, 변수 값, 웹소켓 메시지 등)
 * - INFO: 정상적인 애플리케이션 흐름에 대한 정보 (예: 페이지 로드, 사용자 작업, 데이터 로드 등)
 * - WARN: 잠재적인 문제이지만 애플리케이션이 계속 실행될 수 있는 상황 (예: API 응답 지연, 재시도 등)
 * - ERROR: 애플리케이션 기능이 중단되는 심각한 문제 (예: API 오류, 렌더링 오류, 예외 발생 등)
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
 * 컨텍스트 정보 저장을 위한 클래스
 */
class LogContext {
  constructor() {
    this.userId = null;
    this.sessionId = null;
    this.requestId = null;
    this.extraContext = {};
  }

  /**
   * 사용자 ID 설정
   * @param {string} userId - 사용자 ID
   */
  setUserId(userId) {
    this.userId = userId;
  }

  /**
   * 세션 ID 설정
   * @param {string} sessionId - 세션 ID
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  /**
   * 요청 ID 설정
   * @param {string} requestId - 요청 ID
   */
  setRequestId(requestId) {
    this.requestId = requestId;
  }

  /**
   * 추가 컨텍스트 정보 설정
   * @param {string} key - 컨텍스트 키
   * @param {*} value - 컨텍스트 값
   */
  setContext(key, value) {
    if (key && value !== undefined) {
      this.extraContext[key] = value;
    }
  }

  /**
   * 모든 컨텍스트 정보 가져오기
   * @returns {Object} 컨텍스트 정보
   */
  getAll() {
    const context = { ...this.extraContext };
    
    if (this.userId) context.userId = this.userId;
    if (this.sessionId) context.sessionId = this.sessionId;
    if (this.requestId) context.requestId = this.requestId;
    
    return context;
  }

  /**
   * 컨텍스트 초기화
   */
  clear() {
    this.userId = null;
    this.sessionId = null;
    this.requestId = null;
    this.extraContext = {};
  }
}

/**
 * 중앙화된 로깅 서비스 클래스
 */
class LoggingService {
  constructor() {
    // 기본 로그 레벨을 ERROR로 설정 (ERROR 레벨만 출력)
    this.logLevel = LOG_LEVEL.ERROR;
    this.enabled = true;
    this.ignorePatterns = [
      'ping', 
      'pong', 
      'notifications/unread/count', 
      'health', 
      'user/status',
      'socket',
      'Socket',
      'WebSocket',
      'websocket'
    ]; // 기본적으로 무시할 패턴 확장
    this.recentLogs = [];
    this.maxLogHistory = 100; // 최대 로그 기록 수
    this.context = new LogContext(); // 컨텍스트 정보
    
    // 초기화 로그 출력 (ERROR 레벨로 설정)
    if (process.env.NODE_ENV === 'development') {
      console.log('%c 🔧 로깅 시스템 초기화 (ERROR 레벨)', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', {
        logLevel: this._getLogLevelName(this.logLevel),
        enabled: this.enabled,
        environment: process.env.NODE_ENV
      });
    }
  }

  /**
   * 로그 레벨 설정
   * @param {number} level - 로그 레벨 (LOG_LEVEL 상수 사용)
   */
  setLogLevel(level) {
    try {
      const prevLevel = this.logLevel;
      this.logLevel = level;
      
      // ERROR 레벨로 변경되거나 ERROR 레벨에서 다른 레벨로 변경될 때만 로그 출력
      if (level === LOG_LEVEL.ERROR || prevLevel === LOG_LEVEL.ERROR) {
        if (process.env.NODE_ENV === 'development') {
          console.log('%c 🔧 로그 레벨 변경', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', {
            prevLevel: this._getLogLevelName(prevLevel),
            newLevel: this._getLogLevelName(level)
          });
        }
      }
    } catch (error) {
      console.error(`[안전 로깅] 로그 레벨 변경 오류: ${level}`, error);
    }
  }

  /**
   * 로그 레벨명 가져오기
   * @private
   */
  _getLogLevelName(level) {
    try {
      switch(level) {
        case LOG_LEVEL.DEBUG: return 'DEBUG';
        case LOG_LEVEL.INFO: return 'INFO';
        case LOG_LEVEL.WARN: return 'WARN';
        case LOG_LEVEL.ERROR: return 'ERROR';
        case LOG_LEVEL.NONE: return 'NONE';
        default: return 'UNKNOWN';
      }
    } catch (error) {
      return 'UNKNOWN';
    }
  }

  /**
   * 로깅 활성화/비활성화
   * @param {boolean} enabled - 활성화 여부
   */
  setEnabled(enabled) {
    try {
      this.enabled = !!enabled;
      if (process.env.NODE_ENV === 'development') {
        console.log('%c 🔧 로깅 상태 변경', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;', {
          enabled: this.enabled
        });
      }
    } catch (error) {
      console.log(`[안전 로깅] 로깅 ${enabled ? '활성화' : '비활성화'} 설정 중 오류 발생`);
    }
  }

  /**
   * 로그 무시 패턴 추가
   * @param {string|RegExp} pattern - 무시할 패턴
   */
  addIgnorePattern(pattern) {
    try {
      if (pattern && !this.ignorePatterns.includes(pattern)) {
        this.ignorePatterns.push(pattern);
      }
    } catch (error) {
      console.debug('[안전 로깅] 로그 무시 패턴 추가 중 오류 발생', pattern);
    }
  }

  /**
   * 로그 무시 패턴 제거
   * @param {string|RegExp} pattern - 제거할 패턴
   */
  removeIgnorePattern(pattern) {
    try {
      const index = this.ignorePatterns.indexOf(pattern);
      if (index !== -1) {
        this.ignorePatterns.splice(index, 1);
      }
    } catch (error) {
      console.debug('[안전 로깅] 로그 무시 패턴 제거 중 오류 발생', pattern);
    }
  }

  /**
   * 로그 무시 여부 검사
   * @param {string} message - 로그 메시지
   * @returns {boolean} 무시 여부
   * @private
   */
  _shouldIgnore(message) {
    try {
      if (!message || typeof message !== 'string') return false;
      
      for (const pattern of this.ignorePatterns) {
        if (typeof pattern === 'string') {
          if (message.includes(pattern)) return true;
        } else if (pattern instanceof RegExp) {
          if (pattern.test(message)) return true;
        }
      }
      return false;
    } catch (error) {
      // 오류 발생 시 기본적으로 무시하지 않음
      return false;
    }
  }

  /**
   * 사용자 ID 설정
   * @param {string} userId - 사용자 ID
   */
  setUserId(userId) {
    try {
      this.context.setUserId(userId);
    } catch (error) {
      console.debug(`[안전 로깅] 사용자 ID 설정: ${userId}`);
    }
  }

  /**
   * 세션 ID 설정
   * @param {string} sessionId - 세션 ID
   */
  setSessionId(sessionId) {
    try {
      this.context.setSessionId(sessionId);
    } catch (error) {
      console.debug(`[안전 로깅] 세션 ID 설정: ${sessionId}`);
    }
  }

  /**
   * 요청 ID 설정
   * @param {string} requestId - 요청 ID
   */
  setRequestId(requestId) {
    try {
      this.context.setRequestId(requestId);
    } catch (error) {
      console.debug(`[안전 로깅] 요청 ID 설정: ${requestId}`);
    }
  }

  /**
   * 추가 컨텍스트 정보 설정
   * @param {string} key - 컨텍스트 키
   * @param {*} value - 컨텍스트 값
   */
  setContext(key, value) {
    try {
      this.context.setContext(key, value);
    } catch (error) {
      console.debug(`[안전 로깅] 컨텍스트 정보 설정: ${key}=${value}`);
    }
  }

  /**
   * 컨텍스트 초기화
   */
  clearContext() {
    try {
      this.context.clear();
    } catch (error) {
      console.debug('[안전 로깅] 컨텍스트 정보 초기화 중 오류 발생');
    }
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
    try {
      // 로그 레벨 체크 - 설정된 레벨보다 낮으면 출력하지 않음
      if (!this.enabled || level < this.logLevel) {
        return;
      }
      
      // 무시 패턴 체크
      if (message && this._shouldIgnore(message)) {
        return;
      }
      
      const timestamp = new Date().toISOString();
      const context = this.context.getAll();
      const logEntry = {
        level: this._getLogLevelName(level),
        timestamp,
        module: module || 'App',
        message,
        data,
        context
      };
      
      // 로그 저장
      this.recentLogs.unshift(logEntry);
      if (this.recentLogs.length > this.maxLogHistory) {
        this.recentLogs.pop();
      }
      
      // 컨텍스트 정보 문자열 생성
      let contextStr = '';
      if (context.userId) contextStr += ` userId=${context.userId}`;
      if (context.sessionId) contextStr += ` sessionId=${context.sessionId}`;
      if (context.requestId) contextStr += ` requestId=${context.requestId}`;
      
      // 콘솔 출력
      const prefix = `[${timestamp.split('T')[1].substring(0, 8)}] [${this._getLogLevelName(level)}] [${module || 'App'}]${contextStr}`;
      
      // 로그 레벨에 따라 다른 스타일 적용
      let style = '';
      let icon = '';
      
      switch (level) {
        case LOG_LEVEL.DEBUG:
          style = 'background: #9e9e9e; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = '🔍';
          console.debug(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
        case LOG_LEVEL.INFO:
          style = 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = 'ℹ️';
          console.info(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
        case LOG_LEVEL.WARN:
          style = 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = '⚠️';
          console.warn(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
        case LOG_LEVEL.ERROR:
          style = 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = '❌';
          console.error(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
      }
    } catch (error) {
      // 로깅 자체에서 오류가 발생한 경우 기본 콘솔 로깅으로 폴백
      console.error('[로깅 시스템 오류]', error);
      const levelName = level === LOG_LEVEL.DEBUG ? 'DEBUG' : 
                        level === LOG_LEVEL.INFO ? 'INFO' : 
                        level === LOG_LEVEL.WARN ? 'WARN' : 'ERROR';
      
      console[levelName.toLowerCase()](`[안전 로깅] [${levelName}] [${module || 'App'}]`, message, data || '');
    }
  }

  /**
   * 디버그 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   */
  debug(module, message, data) {
    try {
      this._log(LOG_LEVEL.DEBUG, module, message, data);
    } catch (error) {
      // 디버그 로그는 오류 시 출력하지 않음
    }
  }

  /**
   * 정보 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   */
  info(module, message, data) {
    try {
      this._log(LOG_LEVEL.INFO, module, message, data);
    } catch (error) {
      // INFO 로그는 오류 시 출력하지 않음
    }
  }

  /**
   * 경고 로그
   * @param {string} module - 모듈명
   * @param {string} message - 로그 메시지
   * @param {*} data - 추가 데이터
   */
  warn(module, message, data) {
    try {
      this._log(LOG_LEVEL.WARN, module, message, data);
    } catch (error) {
      console.warn(`[안전 로깅] [WARN] [${module}]`, message, data || '');
    }
  }

  /**
   * 오류 로그
   * @param {string} module - 모듈명 또는 오류 메시지
   * @param {string|undefined} message - 로그 메시지 (선택적)
   * @param {*} error - 오류 객체 (선택적)
   */
  error(module, message, error) {
    try {
      // 인자 개수에 따라 다르게 처리
      let actualModule = 'App';
      let actualMessage = '';
      let actualError = null;

      if (arguments.length === 1) {
        // 인자가 1개인 경우: module은 메시지로 처리
        actualMessage = module;
      } else if (arguments.length === 2) {
        // 인자가 2개인 경우: module은 모듈명, message는 메시지로 처리
        actualModule = module;
        actualMessage = message;
      } else {
        // 인자가 3개인 경우: 모두 그대로 사용
        actualModule = module;
        actualMessage = message;
        actualError = error;
      }

      // 오류 객체가 Error 인스턴스인 경우 구조화된 객체로 변환
      let formattedError = actualError;
      if (actualError instanceof Error) {
        formattedError = {
          message: actualError.message,
          stack: actualError.stack,
          name: actualError.name
        };
      } else if (typeof actualError === 'object' && actualError !== null) {
        // 이미 객체인 경우 그대로 사용
        formattedError = actualError;
      }
      
      this._log(LOG_LEVEL.ERROR, actualModule, actualMessage, formattedError);
    } catch (logError) {
      const formattedError = error instanceof Error 
        ? { message: error.message, stack: error.stack } 
        : error;
      console.error(`[안전 로깅] [ERROR]`, module, message || '', formattedError || '');
    }
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
   * 로그 내보내기 (객체 배열)
   * @returns {Array} 로그 객체 배열
   */
  exportLogs() {
    try {
      return [...this.recentLogs];
    } catch (error) {
      console.error('[안전 로깅] 로그 내보내기 실패', error);
      return [];
    }
  }

  /**
   * 로그 내보내기 (문자열)
   * @returns {string} JSON 문자열
   */
  exportLogsAsString() {
    try {
      return JSON.stringify(this.recentLogs, null, 2);
    } catch (error) {
      console.error('[안전 로깅] 로그 문자열 내보내기 실패', error);
      return '[]';
    }
  }

  /**
   * 로그 다운로드
   */
  downloadLogs() {
    try {
      const logs = this.exportLogsAsString();
      const blob = new Blob([logs], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cvehub-logs-${new Date().toISOString().replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[안전 로깅] [ERROR] [LoggingService]', '로그 다운로드 실패', error);
    }
  }
}

// 싱글톤 인스턴스 생성
const logger = new LoggingService();

export default logger;
