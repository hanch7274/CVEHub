// services/socketEventManager.ts
import { Observable, Subject, fromEvent, EMPTY, throwError } from 'rxjs';
import { shareReplay, map, filter, catchError, retry, takeUntil, finalize } from 'rxjs/operators';
import _ from 'lodash';
import { LRUCache } from 'lru-cache';
import { Socket } from 'socket.io-client';
import logger from 'shared/utils/logging';
import { camelToSnake, snakeToCamel } from 'shared/utils/caseConverter';
import { SUBSCRIPTION_EVENTS } from './constants';
import socketEventBus from './socketEventBus';

import {
  SocketEventCallback,
  SocketEventListeners,
  SocketCaseConverterOptions
} from '../types';

// 변환에서 제외할 필드 목록
const EXCLUDED_FIELDS: string[] = ['id', 'uuid', 'created_at', 'updated_at', 'deleted_at'];

// 구독 관련 이벤트에서 변환이 필요한 필드 매핑
const SUBSCRIPTION_FIELD_MAPPINGS: Record<string, string> = {
  'cve_id': 'cveId',
  'cveId': 'cve_id',
  'user_id': 'userId',
  'userId': 'user_id',
  'display_name': 'displayName',
  'displayName': 'display_name',
  'profile_image': 'profileImage',
  'profileImage': 'profile_image'
};

// 변환 바이패스가 필요한 이벤트 목록
const BYPASS_CONVERSION_EVENTS: string[] = [
  SUBSCRIPTION_EVENTS.SUBSCRIBE_CVE,
  SUBSCRIPTION_EVENTS.UNSUBSCRIBE_CVE,
  SUBSCRIPTION_EVENTS.SUBSCRIPTION_STATUS,
  SUBSCRIPTION_EVENTS.CVE_SUBSCRIBERS_UPDATED
];

/**
 * Socket 이벤트 관리 클래스
 * 이벤트 등록, 발생, 처리 및 케이스 변환을 담당합니다.
 */
export class SocketEventManager {
  // 이벤트 및 리스너 관리
  private listeners: SocketEventListeners = {};
  private eventObservables: Map<string, Observable<any>> = new Map();
  private destroySubjects: Map<string, Subject<void>> = new Map();
  
  // 캐싱 및 성능 최적화
  private eventCache: LRUCache<string, { data: any, timestamp: number }>;
  private caseConversionCache: LRUCache<string, any>;
  
  // 소켓 인스턴스
  private socket: Socket | null = null;
  
  constructor() {
    // 캐시 초기화
    this.eventCache = new LRUCache<string, { data: any, timestamp: number }>({
      max: 100,          // 최대 항목 수
      ttl: 5 * 60000     // 5분 TTL
    });
    
    this.caseConversionCache = new LRUCache<string, any>({
      max: 500,          // 최대 항목 수
      ttl: 10 * 60000    // 10분 TTL
    });
    
    // 이벤트 버스 구독 설정
    this._setupEventBusSubscriptions();
    
    logger.debug('SocketEventManager', '이벤트 관리자 초기화 완료');
  }
  
  /**
   * 이벤트 버스 구독 설정
   */
  private _setupEventBusSubscriptions(): void {
    // 소켓 인스턴스 생성 이벤트 구독
    socketEventBus.on('socketService:socketCreated').subscribe((socket: Socket) => {
      this.socket = socket;
      logger.debug('SocketEventManager', '소켓 인스턴스 업데이트됨');
    });
    
    // 소켓 연결 해제 이벤트 구독
    socketEventBus.on('socketService:disconnected').subscribe(() => {
      this.socket = null;
      logger.debug('SocketEventManager', '소켓 인스턴스 제거됨');
    });
  }
  
  /**
   * 이벤트 리스너 등록
   * @param event 이벤트 이름
   * @param callback 콜백 함수
   * @returns 리스너 제거 함수
   */
  on(event: string, callback: SocketEventCallback): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    // 이미 등록된 콜백인지 확인
    const isCallbackRegistered = this.listeners[event].some(cb => cb === callback);
    
    if (!isCallbackRegistered) {
      this.listeners[event].push(callback);
      
      // 소켓이 있는 경우 이벤트 리스너 등록
      if (this.socket) {
        this.socket.on(event, (data: any) => {
          // 데이터 케이스 변환 처리
          const convertedData = this._convertDataCasing(data, {
            direction: 'incoming',
            sourceName: `소켓이벤트[${event}]`,
            eventName: event
          });
          
          callback(convertedData);
        });
      }
      
      logger.debug('SocketEventManager', `이벤트 리스너 등록: ${event}`);
    }
    
    // 이벤트 리스너 제거 함수 반환
    return () => {
      this.off(event, callback);
    };
  }
  
  /**
   * 이벤트 리스너 제거
   * @param event 이벤트 이름
   * @param callback 콜백 함수
   */
  off(event: string, callback: SocketEventCallback): void {
    if (this.listeners[event]) {
      // 콜백 제거
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      
      // 소켓이 있는 경우 이벤트 리스너 제거
      if (this.socket) {
        this.socket.off(event);
      }
      
      logger.debug('SocketEventManager', `이벤트 리스너 제거: ${event}`);
    }
  }
  
  /**
   * 모든 리스너 제거
   */
  clearAllListeners(): void {
    // 모든 이벤트 리스너 제거
    for (const event in this.listeners) {
      if (Object.prototype.hasOwnProperty.call(this.listeners, event)) {
        this.listeners[event] = [];
      }
    }
    
    // 소켓 이벤트 리스너 제거
    if (this.socket) {
      this.socket.removeAllListeners();
    }
    
    // 이벤트 관찰자 정리
    this.eventObservables.clear();
    
    // 구독 해제 트리거 및 정리
    this.destroySubjects.forEach((subject) => {
      subject.next();
      subject.complete();
    });
    
    // 구독 해제 주체 정리
    this.destroySubjects.clear();
    
    logger.debug('SocketEventManager', '모든 이벤트 리스너 정리 완료');
  }
  
  /**
   * 이벤트 발생
   * @param event 이벤트 이름
   * @param data 이벤트 데이터
   * @param callback 콜백 함수 (옵션)
   */
  emit(event: string, data?: any, callback?: Function): void {
    // 스로틀링 또는 디바운싱 적용 여부 결정
    if (this._shouldThrottleEvent(event)) {
      // 스로틀링 적용하여 이벤트 발생
      _.throttle(() => this._emitImmediate(event, data, callback), 300)();
    } else if (this._shouldDebounceEvent(event)) {
      // 디바운싱 적용하여 이벤트 발생
      _.debounce(() => this._emitImmediate(event, data, callback), 300)();
    } else {
      // 즉시 이벤트 발생
      this._emitImmediate(event, data, callback);
    }
  }
  
  /**
   * 즉시 이벤트 발생 (내부 메서드)
   */
  private _emitImmediate(event: string, data: any, callback?: Function): void {
    if (!this.socket) {
      // 소켓이 연결되지 않은 경우 소켓 인스턴스 요청
      socketEventBus.publish('socketManager:getSocket', null);
      logger.warn('SocketEventManager', '소켓 연결이 없는 상태에서 이벤트 발생 시도', {
        event,
        hasData: !!data
      });
      return;
    }
    
    try {
      // 데이터 케이스 변환 처리 (서버 형식으로 변환)
      const convertedData = this._convertDataCasing(data, {
        direction: 'outgoing',
        sourceName: `emit[${event}]`,
        eventName: event
      });
      
      // 이벤트 발생
      if (callback) {
        this.socket.emit(event, convertedData, callback);
      } else {
        this.socket.emit(event, convertedData);
      }
      
      logger.debug('SocketEventManager', `이벤트 발생: ${event}`, {
        event,
        hasData: !!data
      });
    } catch (error) {
      logger.error('SocketEventManager', `이벤트 발생 중 오류: ${event}`, error);
    }
  }
  
  /**
   * 이벤트 스로틀링 적용 여부 결정
   */
  private _shouldThrottleEvent(event: string): boolean {
    // 스로틀링이 필요한 이벤트 목록
    const throttleEvents = [
      'typing',
      'cursor_position',
      'scroll_position'
    ];
    
    return throttleEvents.includes(event);
  }
  
  /**
   * 이벤트 디바운싱 적용 여부 결정
   */
  private _shouldDebounceEvent(event: string): boolean {
    // 디바운싱이 필요한 이벤트 목록
    const debounceEvents = [
      'search_query',
      'filter_change'
    ];
    
    return debounceEvents.includes(event);
  }
  
  /**
   * Observable 형태로 이벤트 구독
   * @param event 이벤트 이름
   * @returns 이벤트 스트림
   */
  fromEvent<T = any>(eventName: string, componentId: string = 'global'): Observable<T> {
    const cacheKey = `${eventName}_${componentId}`;
    const socket = this.socket as Socket;
    
    // 캐시된 Observable이 있으면 반환
    if (this.eventObservables.has(cacheKey)) {
      return this.eventObservables.get(cacheKey) as Observable<T>;
    }
    
    // 소켓 상태 및 인스턴스 확인
    if (!socket) {
      logger.warn('SocketEventManager', `소켓 인스턴스가 없어 이벤트 스트림 생성 불가: ${eventName}`);
      return EMPTY;
    }
    
    // 컴포넌트별 정리를 위한 Subject 생성 또는 가져오기
    if (!this.destroySubjects.has(componentId)) {
      this.destroySubjects.set(componentId, new Subject<void>());
    }
    const destroySubject = this.destroySubjects.get(componentId)!;
    
    // fromEvent를 사용하여 소켓 이벤트를 Observable로 변환
    const observable = fromEvent<T>(socket, eventName).pipe(
      // 데이터 케이스 변환 및 로깅
      map(data => {
        logger.debug('SocketEventManager', `이벤트 수신: ${eventName}`, data);
        // 데이터 케이스 변환 처리 (snake_case -> camelCase)
        return this._convertDataCasing(data, {
          direction: 'incoming',
          eventName: eventName
        }) as T;
      }),
      // 오류 처리
      catchError(error => {
        logger.error('SocketEventManager', `이벤트 처리 중 오류: ${eventName}`, error);
        return throwError(() => error);
      }),
      // 자동 재시도 (최대 3회)
      retry({ count: 3, delay: 1000 }),
      // 컴포넌트 언마운트 시 구독 해제
      takeUntil(destroySubject),
      // 여러 구독자가 동일한 Observable을 공유하도록 설정
      shareReplay(1),
      // 완료 시 정리
      finalize(() => {
        logger.debug('SocketEventManager', `이벤트 스트림 종료: ${eventName}`);
        this.eventObservables.delete(cacheKey);
      })
    );
    
    // 캐시에 저장
    this.eventObservables.set(cacheKey, observable);
    
    return observable;
  }
  
  /**
   * 컴포넌트 정리
   */
  cleanup(componentId: string): void {
    if (this.destroySubjects.has(componentId)) {
      const subject = this.destroySubjects.get(componentId)!;
      subject.next();
      subject.complete();
      this.destroySubjects.delete(componentId);
      
      // 해당 컴포넌트와 관련된 모든 캐시된 Observable 제거
      const keysToRemove: string[] = [];
      this.eventObservables.forEach((_, key) => {
        if (key.endsWith(`_${componentId}`)) {
          keysToRemove.push(key);
        }
      });
      
      keysToRemove.forEach(key => {
        this.eventObservables.delete(key);
      });
      
      logger.debug('SocketEventManager', `컴포넌트 정리 완료: ${componentId}`);
    }
  }
  
  /**
   * 데이터 케이스 변환 처리
   * @param data 변환할 데이터
   * @param options 변환 옵션
   * @returns 변환된 데이터
   */
  private _convertDataCasing(data: any, options?: SocketCaseConverterOptions): any {
    // 캐시 키 생성
    const cacheKey = this._createCacheKey(data, options);
    if (cacheKey && this.caseConversionCache.has(cacheKey)) {
      return this.caseConversionCache.get(cacheKey);
    }
    
    // 기본 옵션 설정
    const direction = options?.direction || 'incoming';
    const converter = direction === 'outgoing' ? camelToSnake : snakeToCamel;
    const sourceName = options?.sourceName || '알 수 없는 소스';
    const eventName = options?.eventName || '';
    
    // 구독 관련 이벤트는 특별 처리
    const isSubscriptionEvent = BYPASS_CONVERSION_EVENTS.includes(eventName);
    
    try {
      // null 처리
      if (data === null) {
        return null;
      }
      
      // 데이터 타입에 따라 변환 처리
      if (typeof data === 'object') {
        // 배열 처리
        if (Array.isArray(data)) {
          const result = data.map(item => this._convertDataCasing(item, options));
          
          // 캐시에 저장
          if (cacheKey) {
            this.caseConversionCache.set(cacheKey, result);
          }
          
          return result;
        }
        
        // 객체 처리
        const result: Record<string, any> = {};
        
        for (const key in data) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            // 구독 관련 이벤트에서 특정 필드 처리
            if (isSubscriptionEvent && (key in SUBSCRIPTION_FIELD_MAPPINGS)) {
              const mappedKey = SUBSCRIPTION_FIELD_MAPPINGS[key];
              
              // 방향에 따라 매핑된 키 또는 원래 키 사용
              result[direction === 'outgoing' ? mappedKey : key] = data[key];
              continue;
            }
            
            // 변환에서 제외할 필드 확인
            if (EXCLUDED_FIELDS.includes(key)) {
              result[key] = data[key];
              continue;
            }
            
            // 일반 필드는 케이스 변환 적용
            const convertedKey = converter(key);
            
            // 중첩된 객체나 배열은 재귀적으로 처리
            if (typeof data[key] === 'object' && data[key] !== null) {
              result[convertedKey] = this._convertDataCasing(data[key], options);
            } else {
              result[convertedKey] = data[key];
            }
          }
        }
        
        // 구독 관련 이벤트에서 특정 필드 추가 처리 (양방향 호환성 보장)
        if (isSubscriptionEvent && typeof data === 'object' && !Array.isArray(data)) {
          // cve_id와 cveId 동시 지원
          if ('cve_id' in data && !('cveId' in data)) {
            result.cveId = data.cve_id;
          } else if ('cveId' in data && !('cve_id' in data)) {
            result.cve_id = data.cveId;
          }
        }
        
        // 캐시에 저장
        if (cacheKey) {
          this.caseConversionCache.set(cacheKey, result);
        }
        
        return result;
      }
      
      // 객체나 배열이 아닌 경우 원래 값 반환
      return data;
    } catch (error) {
      logger.error('SocketEventManager', '데이터 케이스 변환 중 오류 발생', error);
      return data;
    }
  }
  
  /**
   * 캐시 키 생성
   */
  private _createCacheKey(data: any, options?: SocketCaseConverterOptions): string | null {
    if (!data || typeof data !== 'object') {
      return null;
    }
    
    try {
      const direction = options?.direction || 'incoming';
      const sourceName = options?.sourceName || '';
      
      // 간단한 객체는 직접 키 생성
      if (!Array.isArray(data) && Object.keys(data).length <= 5) {
        return `${direction}:${sourceName}:${JSON.stringify(data)}`;
      }
      
      // 복잡한 객체는 일부 프로퍼티와 길이 기반 키 생성
      const keys = Object.keys(data);
      const keyPreview = keys.slice(0, 3).join(',');
      
      if (Array.isArray(data)) {
        return `${direction}:${sourceName}:array:${data.length}:${keyPreview}`;
      }
      
      return `${direction}:${sourceName}:object:${keys.length}:${keyPreview}`;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 재귀적 키 변환 (인터페이스 구현용)
   */
  convertKeysRecursive(data: any, toCamelCase: boolean, options?: SocketCaseConverterOptions): any {
    const direction = toCamelCase ? 'incoming' : 'outgoing';
    return this._convertDataCasing(data, { ...options, direction });
  }
}
