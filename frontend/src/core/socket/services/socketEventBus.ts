// services/socketEventBus.ts
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import logger from 'shared/utils/logging';

/**
 * 소켓 이벤트 타입 정의
 */
export interface SocketEvent<T = any> {
  type: string;
  payload: T;
}

/**
 * 소켓 서비스 컴포넌트 간 통신을 위한 이벤트 버스
 * 
 * 이 클래스는 SocketService, SocketEventManager, SocketMetrics 간의
 * 순환 참조를 제거하기 위한 이벤트 중재자 역할을 합니다.
 */
class SocketEventBus {
  private eventSubject = new Subject<SocketEvent>();
  
  /**
   * 이벤트 발행
   * @param type 이벤트 타입
   * @param payload 이벤트 데이터
   */
  publish<T = any>(type: string, payload: T): void {
    logger.debug('SocketEventBus', `이벤트 발행: ${type}`, { type, hasPayload: !!payload });
    this.eventSubject.next({ type, payload });
  }
  
  /**
   * 특정 타입의 이벤트 구독
   * @param type 구독할 이벤트 타입
   * @returns 이벤트 스트림
   */
  on<T = any>(type: string): Observable<T> {
    return this.eventSubject.pipe(
      filter(event => event.type === type),
      map(event => event.payload as T)
    );
  }
  
  /**
   * 모든 이벤트 스트림 가져오기
   * @returns 모든 이벤트 스트림
   */
  allEvents(): Observable<SocketEvent> {
    return this.eventSubject.asObservable();
  }
}

// 싱글톤 인스턴스
const socketEventBus = new SocketEventBus();

export default socketEventBus;
