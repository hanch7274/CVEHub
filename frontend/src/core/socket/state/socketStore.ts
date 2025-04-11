import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Socket } from 'socket.io-client';
import { 
  CONNECTION_EVENTS, 
  SOCKET_STATE, 
  SocketState 
} from 'core/socket/services/constants';
import logger from 'shared/utils/logging';

/**
 * Socket.IO 상태 관리를 위한 Zustand 스토어 타입 정의
 */
interface SocketStore {
  // 상태
  socket: Socket | null;
  connected: boolean;
  connectionState: SocketState;
  connectionError: Error | null;
  lastActivity: Date | null;
  eventSubscriptions: Map<string, Set<(data: any) => void>>;
  
  // 액션
  setSocket: (socket: Socket | null) => Socket | null;
  setConnected: (connected: boolean) => void;
  setConnectionState: (state: SocketState) => void;
  setConnectionError: (error: Error | null) => void;
  updateLastActivity: () => void;
  
  // 이벤트 구독 관리
  addEventHandler: (event: string, handler: (data: any) => void) => () => void;
  removeEventHandler: (event: string, handler: (data: any) => void) => void;
  clearEventHandlers: (event: string) => void;
  clearAllSubscriptions: () => void;
  
  // 이벤트 발생 관련
  emitEvent: (socket: Socket | null, event: string, data: any) => void;
  
  // 유틸리티
  getEventHandlers: (event: string) => Set<(data: any) => void> | undefined;
  hasEventHandlers: (event: string) => boolean;
  getSubscribedEvents: () => string[];
}

/**
 * Socket.IO 상태 관리를 위한 Zustand 스토어
 * 
 * 기존 SocketIOContext와 병행하여 사용할 수 있도록 설계
 */
export const useSocketStore = create<SocketStore>()(
  devtools(
    persist(
      (set, get) => ({
        // 초기 상태
        socket: null,
        connected: false,
        connectionState: SOCKET_STATE.DISCONNECTED,
        connectionError: null,
        lastActivity: null,
        eventSubscriptions: new Map(),
        
        // 액션: 소켓 설정
        setSocket: (socket) => {
          set({ 
            socket,
            lastActivity: new Date()
          });
          return socket;
        },
        
        // 액션: 연결 상태 설정
        setConnected: (connected) => set({ 
          connected,
          connectionState: connected ? SOCKET_STATE.CONNECTED : SOCKET_STATE.DISCONNECTED,
          lastActivity: new Date()
        }),
        
        // 액션: 연결 상태 설정 (상세)
        setConnectionState: (state) => set({ 
          connectionState: state,
          connected: state === SOCKET_STATE.CONNECTED,
          lastActivity: new Date()
        }),
        
        // 액션: 연결 오류 설정
        setConnectionError: (error) => set({ 
          connectionError: error,
          connectionState: error ? SOCKET_STATE.ERROR : get().connectionState,
          lastActivity: new Date()
        }),
        
        // 액션: 마지막 활동 시간 업데이트
        updateLastActivity: () => set({ 
          lastActivity: new Date() 
        }),
        
        // 액션: 이벤트 핸들러 추가
        addEventHandler: (event, handler) => {
          const { eventSubscriptions } = get();
          const handlers = eventSubscriptions.get(event) || new Set();
          handlers.add(handler);
          
          const newSubscriptions = new Map(eventSubscriptions);
          newSubscriptions.set(event, handlers);
          
          set({ 
            eventSubscriptions: newSubscriptions,
            lastActivity: new Date()
          });
          
          logger.debug('socketStore', `이벤트 핸들러 추가: ${event}`, { 
            handlerCount: handlers.size 
          });
          
          // 클린업 함수 반환
          return () => get().removeEventHandler(event, handler);
        },
        
        // 액션: 이벤트 핸들러 제거
        removeEventHandler: (event, handler) => {
          const { eventSubscriptions } = get();
          const handlers = eventSubscriptions.get(event);
          
          if (handlers) {
            handlers.delete(handler);
            
            const newSubscriptions = new Map(eventSubscriptions);
            if (handlers.size === 0) {
              newSubscriptions.delete(event);
              logger.debug('socketStore', `이벤트 ${event}에 대한 모든 핸들러 제거`);
            } else {
              newSubscriptions.set(event, handlers);
              logger.debug('socketStore', `이벤트 ${event}에 대한 핸들러 제거`, { 
                remainingHandlers: handlers.size 
              });
            }
            
            set({ 
              eventSubscriptions: newSubscriptions,
              lastActivity: new Date()
            });
          }
        },
        
        // 액션: 특정 이벤트의 모든 핸들러 제거
        clearEventHandlers: (event) => {
          const { eventSubscriptions } = get();
          
          if (eventSubscriptions.has(event)) {
            const newSubscriptions = new Map(eventSubscriptions);
            newSubscriptions.delete(event);
            
            set({ 
              eventSubscriptions: newSubscriptions,
              lastActivity: new Date()
            });
            
            logger.debug('socketStore', `이벤트 ${event}에 대한 모든 핸들러 제거`);
          }
        },
        
        // 액션: 모든 이벤트 구독 제거
        clearAllSubscriptions: () => {
          set({ 
            eventSubscriptions: new Map(),
            lastActivity: new Date()
          });
          
          logger.debug('socketStore', '모든 이벤트 구독 제거');
        },
        
        // 액션: 이벤트 발생
        emitEvent: (socket, event, data) => {
          if (!socket) {
            logger.warn('socketStore', `소켓 없이 이벤트 발생 시도: ${event}`);
            return;
          }
          
          try {
            socket.emit(event, data);
            get().updateLastActivity();
            
            logger.debug('socketStore', `이벤트 발생: ${event}`, { 
              dataType: typeof data 
            });
          } catch (error) {
            logger.error('socketStore', `이벤트 발생 중 오류: ${event}`, error);
          }
        },
        
        // 유틸리티: 이벤트 핸들러 가져오기
        getEventHandlers: (event) => {
          return get().eventSubscriptions.get(event);
        },
        
        // 유틸리티: 이벤트 핸들러 존재 여부 확인
        hasEventHandlers: (event) => {
          const handlers = get().eventSubscriptions.get(event);
          return !!handlers && handlers.size > 0;
        },
        
        // 유틸리티: 구독 중인 이벤트 목록 가져오기
        getSubscribedEvents: () => {
          return Array.from(get().eventSubscriptions.keys());
        }
      }),
      { 
        name: 'socket-storage',
        partialize: (state) => ({
          connected: state.connected,
          connectionState: state.connectionState,
          connectionError: state.connectionError,
          lastActivity: state.lastActivity
        }),
        onRehydrateStorage: () => (state) => {
          // 재수화 시 Map 객체 초기화
          if (state) {
            // 안전하게 eventSubscriptions Map 초기화
            state.eventSubscriptions = new Map();
            
            logger.debug('socketStore', '스토어 상태 재수화 완료', {
              connected: state.connected,
              connectionState: state.connectionState
            });
          }
        }
      }
    )
  )
);

// 스토어 상태 변경 구독 함수
export const subscribeToSocketStore = (
  selector: (state: SocketStore) => any,
  callback: (selectedState: any, previousState: any) => void
) => {
  let previousState = selector(useSocketStore.getState());
  
  return useSocketStore.subscribe((state) => {
    const currentState = selector(state);
    if (currentState !== previousState) {
      callback(currentState, previousState);
      previousState = currentState;
    }
  });
};

// 스토어 상태 직접 접근 함수 (컴포넌트 외부 사용)
export const getSocketState = () => useSocketStore.getState();

// 스토어 액션 직접 접근 함수 (컴포넌트 외부 사용)
export const socketActions = {
  setSocket: (socket: Socket | null) => {
    useSocketStore.getState().setSocket(socket);
    return socket;
  },
  setConnected: (connected: boolean) => useSocketStore.getState().setConnected(connected),
  setConnectionState: (state: SocketState) => useSocketStore.getState().setConnectionState(state),
  setConnectionError: (error: Error | null) => useSocketStore.getState().setConnectionError(error),
  updateConnectionState: (data: { connectionState: SocketState; isConnected: boolean }) => {
    useSocketStore.getState().setConnectionState(data.connectionState);
    useSocketStore.getState().setConnected(data.isConnected);
  },
  emitEvent: (socket: Socket | null, event: string, data: any) => 
    useSocketStore.getState().emitEvent(socket, event, data),
  addEventHandler: (event: string, handler: (data: any) => void) => 
    useSocketStore.getState().addEventHandler(event, handler),
  removeEventHandler: (event: string, handler: (data: any) => void) => 
    useSocketStore.getState().removeEventHandler(event, handler),
  clearEventHandlers: (event: string) => 
    useSocketStore.getState().clearEventHandlers(event),
  clearAllSubscriptions: () => 
    useSocketStore.getState().clearAllSubscriptions()
};

export default useSocketStore;
