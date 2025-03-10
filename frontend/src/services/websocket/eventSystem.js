/**
 * WebSocket 이벤트 시스템
 * 웹소켓 메시지 및 구독 관련 이벤트를 중앙에서 관리
 */
class EventSystem {
  constructor() {
    this.eventHandlers = new Map();
    this.debug = process.env.NODE_ENV === 'development';
    
    // 테스트용 이벤트를 위한 핸들러 맵
    this.legacyHandlers = new Set();
    
    // 이벤트 카운터 (성능 모니터링용)
    this.eventCounter = {
      total: 0,
      byType: {}
    };
    
    // 디버깅 용도로 전역 변수 설정
    if (typeof window !== 'undefined' && this.debug) {
      window._eventSystem = this;
    }
  }

  /**
   * 이벤트 구독
   * @param {string} eventType - 이벤트 타입
   * @param {Function} callback - 콜백 함수
   * @param {string} [identifier] - 식별자 (선택사항)
   * @returns {Function} 구독 취소 함수
   */
  subscribe(eventType, callback, identifier = null) {
    // 유효성 검사 강화
    if (!eventType) {
      console.error('[이벤트] 잘못된 구독 요청: eventType이 없음');
      return () => {};
    }
    
    if (typeof eventType !== 'string') {
      console.error('[이벤트] 잘못된 구독 요청: eventType이 문자열이 아님', { 
        eventType, 
        type: typeof eventType 
      });
      return () => {};
    }
    
    if (typeof callback !== 'function') {
      console.error('[이벤트] 잘못된 구독 요청: callback이 함수가 아님', { eventType });
      return () => {};
    }

    // 이벤트 핸들러 맵 초기화
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Map());
    }

    // 고유 ID 생성
    const handlerId = identifier || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 핸들러 등록
    this.eventHandlers.get(eventType).set(handlerId, callback);
    
    // 디버그 모드에서만 로깅
    if (this.debug && !['ping', 'pong'].includes(eventType)) {
      // connect_ack, connected, disconnected 등의 중요 이벤트는 항상 로깅
      const isImportantEvent = ['connect_ack', 'connected', 'disconnected', 'error'].includes(eventType);
      // 문자열 체크가 이미 위에서 되었으므로 안전하게 startsWith 호출 가능
      const isCveEvent = eventType.startsWith('cve_');
      if (isImportantEvent || isCveEvent) {
        console.log(`[이벤트] '${eventType}' 이벤트 구독 추가 (ID: ${handlerId})`);
      }
    }

    // 구독 취소 함수 반환
    return () => {
      this.unsubscribe(eventType, handlerId);
    };
  }

  /**
   * 이벤트 구독 취소
   * @param {string} eventType - 이벤트 타입
   * @param {string} handlerId - 핸들러 ID
   * @returns {boolean} 구독 취소 성공 여부
   */
  unsubscribe(eventType, handlerId) {
    if (!eventType || !handlerId) return false;

    const handlers = this.eventHandlers.get(eventType);
    if (!handlers) return false;

    const removed = handlers.delete(handlerId);
    
    // 디버그 모드에서만 로깅 (중요한 이벤트나 특정 이벤트만)
    if (this.debug && removed && !['ping', 'pong'].includes(eventType)) {
      const isImportantEvent = ['connect_ack', 'connected', 'disconnected', 'error'].includes(eventType);
      if (isImportantEvent || eventType.startsWith('cve_')) {
        console.log(`[이벤트] '${eventType}' 이벤트 구독 취소 (ID: ${handlerId})`);
      }
    }

    // 핸들러가 없으면 Map 제거
    if (handlers.size === 0) {
      this.eventHandlers.delete(eventType);
    }
    
    return removed;
  }

  /**
   * 이벤트 발생
   * @param {string} eventType - 이벤트 타입
   * @param {*} data - 이벤트 데이터
   * @returns {boolean} 이벤트 처리 성공 여부
   */
  emit(eventType, data) {
    // 이벤트 타입 검증 및 변환
    if (!eventType) {
      console.error('[이벤트] 이벤트 발생 실패: eventType이 없음', { data });
      return false;
    }
    
    // 문자열이 아닌 이벤트 타입 처리
    if (typeof eventType !== 'string') {
      console.warn('[이벤트] 문자열이 아닌 이벤트 타입을 문자열로 변환:', { 
        originalType: eventType, 
        type: typeof eventType 
      });
      try {
        eventType = String(eventType);
      } catch (error) {
        console.error('[이벤트] 이벤트 타입 변환 실패:', error);
        return false;
      }
    }

    // 성능 측정 시작
    const startTime = performance.now();

    // 이벤트 카운터 업데이트
    this.eventCounter.total++;
    this.eventCounter.byType[eventType] = (this.eventCounter.byType[eventType] || 0) + 1;

    const handlers = this.eventHandlers.get(eventType);
    const hasSubscribers = handlers && handlers.size > 0;
    
    // 구독자가 없는 경우 처리
    if (!hasSubscribers) {
      // ping/pong 이벤트를 제외한 중요 이벤트만 로깅
      if (this.debug && !['ping', 'pong', 'stateChanged'].includes(eventType)) {
        const isImportantEvent = ['connect_ack', 'connected', 'disconnected', 'error'].includes(eventType);
        if (isImportantEvent) {
          console.log(`[이벤트] '${eventType}' 이벤트 발생 (구독자 없음)`);
        }
      }
      
      // 레거시 핸들러 지원 (모든 이벤트를 레거시 핸들러에게 전달)
      this._notifyLegacyHandlers(eventType, data);
      return true;
    }

    // 중요한 이벤트만 로깅 (성능에 영향을 줄 수 있는 이벤트는 제외)
    if (this.debug && !['ping', 'pong', 'stateChanged'].includes(eventType)) {
      const isImportantEvent = ['connect_ack', 'connected', 'disconnected', 'error'].includes(eventType);
      if (isImportantEvent || eventType.startsWith('cve_')) {
        console.log(`[이벤트] '${eventType}' 이벤트 발생 (구독자 ${handlers.size}명)${data ? ' 데이터:' : ''}`, 
          data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : data) : '');
      }
    }

    // 모든 구독자에게 알림
    try {
      let callbackErrors = 0;
      handlers.forEach((callback, id) => {
        try {
          callback(data);
        } catch (error) {
          callbackErrors++;
          console.error(`[이벤트] '${eventType}' 처리 중 오류 (ID: ${id}):`, error);
        }
      });
      
      // 레거시 핸들러 지원
      this._notifyLegacyHandlers(eventType, data);
      
      // 성능 측정 종료
      const processingTime = performance.now() - startTime;
      
      // 처리 시간이 긴 이벤트 로깅 (5ms 이상)
      if (this.debug && processingTime > 5 && !['stateChanged', 'ping', 'pong'].includes(eventType)) {
        console.warn(`[이벤트] '${eventType}' 처리 시간이 깁니다: ${processingTime.toFixed(2)}ms (구독자: ${handlers.size}명)`);
      }
      
      // 오류가 있는 경우 요약 로깅
      if (callbackErrors > 0) {
        console.warn(`[이벤트] '${eventType}' 이벤트 처리 중 ${callbackErrors}개의 오류 발생`);
      }
      
      return callbackErrors < handlers.size; // 일부라도 성공했으면 true 반환
    } catch (error) {
      console.error(`[이벤트] '${eventType}' 이벤트 발생 중 오류:`, error);
      return false;
    }
  }
  
  /**
   * 기존 레거시 핸들러에 알림 (호환성 유지)
   * @param {string} eventType - 이벤트 타입
   * @param {*} data - 이벤트 데이터
   * @private
   */
  _notifyLegacyHandlers(eventType, data) {
    if (this.legacyHandlers.size === 0) return;
    
    const legacyMessage = { type: eventType, data };
    
    this.legacyHandlers.forEach(handler => {
      try {
        handler(legacyMessage);
      } catch (error) {
        console.error('[이벤트] 레거시 핸들러 처리 중 오류:', error);
      }
    });
  }
  
  /**
   * 기존 메시지 핸들러 등록 (호환성 지원)
   * @param {Function} handler - 핸들러 함수
   * @returns {boolean} 등록 성공 여부
   */
  addLegacyHandler(handler) {
    if (typeof handler !== 'function') return false;
    
    this.legacyHandlers.add(handler);
    return true;
  }
  
  /**
   * 기존 메시지 핸들러 제거 (호환성 지원)
   * @param {Function} handler - 핸들러 함수
   * @returns {boolean} 제거 성공 여부
   */
  removeLegacyHandler(handler) {
    if (typeof handler !== 'function') return false;
    
    return this.legacyHandlers.delete(handler);
  }

  /**
   * 특정 이벤트의 구독자 수 반환
   * @param {string} eventType - 이벤트 타입
   * @returns {number} 구독자 수
   */
  getSubscriberCount(eventType) {
    if (!eventType) return 0;
    const handlers = this.eventHandlers.get(eventType);
    return handlers ? handlers.size : 0;
  }

  /**
   * 이벤트 통계 가져오기
   * @returns {Object} 이벤트 통계 정보
   */
  getEventStats() {
    return {
      totalEvents: this.eventCounter.total,
      eventsByType: { ...this.eventCounter.byType },
      activeSubscriptions: [...this.eventHandlers.keys()].map(type => ({
        type,
        subscribers: this.getSubscriberCount(type)
      }))
    };
  }

  /**
   * 모든 이벤트 구독 취소
   * @returns {boolean} 성공 여부
   */
  clearAll() {
    try {
      this.eventHandlers.clear();
      this.legacyHandlers.clear();
      
      if (this.debug) {
        console.log('[이벤트] 모든 이벤트 구독 취소됨');
      }
      
      return true;
    } catch (error) {
      console.error('[이벤트] 구독 취소 중 오류:', error);
      return false;
    }
  }
}

// 싱글톤 인스턴스 생성
const eventSystem = new EventSystem();

// 디버깅을 위한 전역 접근 설정 (개발 모드에서만)
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  window._eventSystem = eventSystem;
}

export default eventSystem; 