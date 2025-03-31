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

// 환경 변수에 대한 안전한 접근
const isDevMode = (): boolean => {
  return typeof window !== 'undefined' && 
         window.location && 
         (window.location.hostname === 'localhost' || 
          window.location.hostname === '127.0.0.1');
};

// 로그 레벨 정의
export const LOG_LEVEL = {
  DEBUG: 0,   // 디버그 로그 (매우 상세)
  INFO: 1,    // 정보성 로그 
  WARN: 2,    // 경고 로그
  ERROR: 3,   // 오류 로그
  NONE: 100   // 로깅 비활성화
};

export type LogLevel = typeof LOG_LEVEL[keyof typeof LOG_LEVEL];

// 로그 메서드 타입 정의
export interface LogMethod {
  (module: string, message: string, data?: any): void;
  (message: string): void;
  (message: string, data: any): void;
}

interface ExtraContext {
  [key: string]: any;
}

/**
 * 컨텍스트 정보 저장을 위한 클래스
 */
class LogContext {
  private userId: string | null = null;
  private sessionId: string | null = null;
  private requestId: string | null = null;
  private extraContext: ExtraContext = {};

  /**
   * 사용자 ID 설정
   * @param userId - 사용자 ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * 세션 ID 설정
   * @param sessionId - 세션 ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * 요청 ID 설정
   * @param requestId - 요청 ID
   */
  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  /**
   * 추가 컨텍스트 정보 설정
   * @param key - 컨텍스트 키
   * @param value - 컨텍스트 값
   */
  setContext(key: string, value: any): void {
    if (key && value !== undefined) {
      this.extraContext[key] = value;
    }
  }

  /**
   * 모든 컨텍스트 정보 가져오기
   * @returns 컨텍스트 정보
   */
  getAll(): ExtraContext {
    const context: ExtraContext = { ...this.extraContext };
    
    if (this.userId) context.userId = this.userId;
    if (this.sessionId) context.sessionId = this.sessionId;
    if (this.requestId) context.requestId = this.requestId;
    
    return context;
  }

  /**
   * 컨텍스트 초기화
   */
  clear(): void {
    this.userId = null;
    this.sessionId = null;
    this.requestId = null;
    this.extraContext = {};
  }
}

interface LogEntry {
  level: string;
  timestamp: string;
  module: string;
  message: string;
  data?: any;
  context: ExtraContext;
}

/**
 * 중앙화된 로깅 서비스 클래스
 */
class LoggingService {
  private logLevel: LogLevel;
  private enabled: boolean;
  private ignorePatterns: (string | RegExp)[];
  private recentLogs: LogEntry[];
  private maxLogHistory: number;
  private context: LogContext;

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
    if (isDevMode()) {
      console.log('%c 로깅 시스템 초기화 (ERROR 레벨)', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', {
        logLevel: this._getLogLevelName(this.logLevel),
        enabled: this.enabled,
        environment: isDevMode() ? 'development' : 'production'
      });
    }
  }

  /**
   * 로그 레벨 설정
   * @param level - 로그 레벨 (LOG_LEVEL 상수 사용)
   */
  setLogLevel(level: LogLevel): void {
    try {
      const prevLevel = this.logLevel;
      this.logLevel = level;
      
      // ERROR 레벨로 변경되거나 ERROR 레벨에서 다른 레벨로 변경될 때만 로그 출력
      if (level === LOG_LEVEL.ERROR || prevLevel === LOG_LEVEL.ERROR) {
        if (isDevMode()) {
          console.log('%c 로그 레벨 변경', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', {
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
  private _getLogLevelName(level: LogLevel): string {
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
   * @param enabled - 활성화 여부
   */
  setEnabled(enabled: boolean): void {
    try {
      this.enabled = !!enabled;
      if (isDevMode()) {
        console.log('%c 로깅 상태 변경', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;', {
          enabled: this.enabled
        });
      }
    } catch (error) {
      console.log(`[안전 로깅] 로깅 ${enabled ? '활성화' : '비활성화'} 설정 중 오류 발생`);
    }
  }

  /**
   * 로그 무시 패턴 추가
   * @param pattern - 무시할 패턴
   */
  addIgnorePattern(pattern: string | RegExp): void {
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
   * @param pattern - 제거할 패턴
   */
  removeIgnorePattern(pattern: string | RegExp): void {
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
   * @param message - 로그 메시지
   * @returns 무시 여부
   * @private
   */
  private _shouldIgnore(message: string): boolean {
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
   * @param userId - 사용자 ID
   */
  setUserId(userId: string): void {
    try {
      this.context.setUserId(userId);
    } catch (error) {
      console.debug(`[안전 로깅] 사용자 ID 설정: ${userId}`);
    }
  }

  /**
   * 세션 ID 설정
   * @param sessionId - 세션 ID
   */
  setSessionId(sessionId: string): void {
    try {
      this.context.setSessionId(sessionId);
    } catch (error) {
      console.debug(`[안전 로깅] 세션 ID 설정: ${sessionId}`);
    }
  }

  /**
   * 요청 ID 설정
   * @param requestId - 요청 ID
   */
  setRequestId(requestId: string): void {
    try {
      this.context.setRequestId(requestId);
    } catch (error) {
      console.debug(`[안전 로깅] 요청 ID 설정: ${requestId}`);
    }
  }

  /**
   * 추가 컨텍스트 정보 설정
   * @param key - 컨텍스트 키
   * @param value - 컨텍스트 값
   */
  setContext(key: string, value: any): void {
    try {
      this.context.setContext(key, value);
    } catch (error) {
      console.debug(`[안전 로깅] 컨텍스트 정보 설정: ${key}=${value}`);
    }
  }

  /**
   * 컨텍스트 초기화
   */
  clearContext(): void {
    try {
      this.context.clear();
    } catch (error) {
      console.debug('[안전 로깅] 컨텍스트 정보 초기화 중 오류 발생');
    }
  }

  /**
   * 로그 출력 (내부 사용)
   * @param level - 로그 레벨
   * @param module - 모듈명
   * @param message - 로그 메시지
   * @param data - 추가 데이터
   * @private
   */
  private _log(level: LogLevel, module: string, message: string, data?: any): void {
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
      const logEntry: LogEntry = {
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
          icon = '';
          console.debug(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
        case LOG_LEVEL.INFO:
          style = 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = '';
          console.info(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
        case LOG_LEVEL.WARN:
          style = 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = '';
          console.warn(`%c ${icon} ${prefix}`, style, message, data || '');
          break;
        case LOG_LEVEL.ERROR:
          style = 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;';
          icon = '';
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
   */
  debug = (moduleOrMessage: string, messageOrData?: any, data?: any): void => {
    try {
      // 인자 개수에 따라 다르게 처리
      if (messageOrData === undefined && data === undefined) {
        // 인자가 1개인 경우: moduleOrMessage는 메시지로 처리
        this._log(LOG_LEVEL.DEBUG, 'App', moduleOrMessage);
      } else if (data === undefined) {
        // 인자가 2개인 경우: 첫 번째 인자가 모듈명인지 메시지인지 판단
        if (typeof messageOrData === 'string') {
          // messageOrData가 문자열이면 moduleOrMessage는 모듈명, messageOrData는 메시지로 처리
          this._log(LOG_LEVEL.DEBUG, moduleOrMessage, messageOrData);
        } else {
          // messageOrData가 문자열이 아니면 moduleOrMessage는 메시지, messageOrData는 데이터로 처리
          this._log(LOG_LEVEL.DEBUG, 'App', moduleOrMessage, messageOrData);
        }
      } else {
        // 인자가 3개인 경우: 모두 그대로 사용
        this._log(LOG_LEVEL.DEBUG, moduleOrMessage, messageOrData, data);
      }
    } catch (error) {
      // 디버그 로그는 오류 시 출력하지 않음
    }
  };

  /**
   * 정보 로그
   */
  info = (moduleOrMessage: string, messageOrData?: any, data?: any): void => {
    try {
      // 인자 개수에 따라 다르게 처리
      if (messageOrData === undefined && data === undefined) {
        // 인자가 1개인 경우: moduleOrMessage는 메시지로 처리
        this._log(LOG_LEVEL.INFO, 'App', moduleOrMessage);
      } else if (data === undefined) {
        // 인자가 2개인 경우: 첫 번째 인자가 모듈명인지 메시지인지 판단
        if (typeof messageOrData === 'string') {
          // messageOrData가 문자열이면 moduleOrMessage는 모듈명, messageOrData는 메시지로 처리
          this._log(LOG_LEVEL.INFO, moduleOrMessage, messageOrData);
        } else {
          // messageOrData가 문자열이 아니면 moduleOrMessage는 메시지, messageOrData는 데이터로 처리
          this._log(LOG_LEVEL.INFO, 'App', moduleOrMessage, messageOrData);
        }
      } else {
        // 인자가 3개인 경우: 모두 그대로 사용
        this._log(LOG_LEVEL.INFO, moduleOrMessage, messageOrData, data);
      }
    } catch (error) {
      // INFO 로그는 오류 시 출력하지 않음
    }
  };

  /**
   * 경고 로그
   */
  warn = (moduleOrMessage: string, messageOrData?: any, data?: any): void => {
    try {
      // 인자 개수에 따라 다르게 처리
      if (messageOrData === undefined && data === undefined) {
        // 인자가 1개인 경우: moduleOrMessage는 메시지로 처리
        this._log(LOG_LEVEL.WARN, 'App', moduleOrMessage);
      } else if (data === undefined) {
        // 인자가 2개인 경우: 첫 번째 인자가 모듈명인지 메시지인지 판단
        if (typeof messageOrData === 'string') {
          // messageOrData가 문자열이면 moduleOrMessage는 모듈명, messageOrData는 메시지로 처리
          this._log(LOG_LEVEL.WARN, moduleOrMessage, messageOrData);
        } else {
          // messageOrData가 문자열이 아니면 moduleOrMessage는 메시지, messageOrData는 데이터로 처리
          this._log(LOG_LEVEL.WARN, 'App', moduleOrMessage, messageOrData);
        }
      } else {
        // 인자가 3개인 경우: 모두 그대로 사용
        this._log(LOG_LEVEL.WARN, moduleOrMessage, messageOrData, data);
      }
    } catch (error) {
      console.warn(`[안전 로깅] [WARN] [${moduleOrMessage}]`, messageOrData, data || '');
    }
  };

  /**
   * 오류 로그
   */
  error = (moduleOrMessage: string, messageOrData?: any, error?: any): void => {
    try {
      // 인자 개수에 따라 다르게 처리
      let actualModule = 'App';
      let actualMessage = '';
      let actualError: any = null;

      if (messageOrData === undefined && error === undefined) {
        // 인자가 1개인 경우: moduleOrMessage는 메시지로 처리
        actualMessage = moduleOrMessage;
      } else if (error === undefined) {
        // 인자가 2개인 경우: 첫 번째 인자가 모듈명인지 메시지인지 판단
        if (typeof messageOrData === 'string' || messageOrData === undefined) {
          // messageOrData가 문자열이면 moduleOrMessage는 모듈명, messageOrData는 메시지로 처리
          actualModule = moduleOrMessage;
          actualMessage = messageOrData || '';
        } else {
          // messageOrData가 문자열이 아니면 moduleOrMessage는 메시지, messageOrData는 오류로 처리
          actualMessage = moduleOrMessage;
          actualError = messageOrData;
        }
      } else {
        // 인자가 3개인 경우: 모두 그대로 사용
        actualModule = moduleOrMessage;
        actualMessage = messageOrData;
        actualError = error;
      }

      // 오류 객체 처리를 위한 인터페이스 정의
      interface ErrorLike {
        message: string;
        stack?: string;
        name?: string;
      }

      // 오류 객체 타입 가드
      const isErrorLike = (obj: any): obj is ErrorLike => {
        return obj && typeof obj === 'object' && 'message' in obj;
      };

      // 오류 객체가 Error 인스턴스인 경우 구조화된 객체로 변환
      let formattedError: any = actualError;
      
      if (actualError && isErrorLike(actualError)) {
        formattedError = {
          message: actualError.message,
          stack: actualError.stack || '',
          name: actualError.name || 'Error'
        };
      } else if (actualError !== null) {
        // 이미 객체인 경우 그대로 사용
        formattedError = actualError;
      }
      
      this._log(LOG_LEVEL.ERROR, actualModule, actualMessage, formattedError);
    } catch (logError) {
      // 오류 객체 처리를 위한 인터페이스 정의
      interface ErrorLike {
        message: string;
        stack?: string;
        name?: string;
      }

      // 오류 객체 타입 가드
      const isErrorLike = (obj: any): obj is ErrorLike => {
        return obj && typeof obj === 'object' && 'message' in obj;
      };

      let formattedError: any = error;
      
      if (error && isErrorLike(error)) {
        formattedError = { 
          message: error.message, 
          stack: error.stack || '' 
        };
      }
      
      console.error(`[안전 로깅] [ERROR]`, moduleOrMessage, messageOrData || '', formattedError || '');
    }
  };

  /**
   * 최근 로그 가져오기
   * @param count - 가져올 로그 수
   * @returns 최근 로그 배열
   */
  getRecentLogs(count = 10): LogEntry[] {
    return this.recentLogs.slice(0, Math.min(count, this.recentLogs.length));
  }

  /**
   * 로그 내보내기 (객체 배열)
   * @returns 로그 객체 배열
   */
  exportLogs(): LogEntry[] {
    try {
      return [...this.recentLogs];
    } catch (error) {
      console.error('[안전 로깅] 로그 내보내기 실패', error);
      return [];
    }
  }

  /**
   * 로그 내보내기 (문자열)
   * @returns JSON 문자열
   */
  exportLogsAsString(): string {
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
  downloadLogs(): void {
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
