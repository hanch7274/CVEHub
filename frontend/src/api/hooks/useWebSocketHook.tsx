import { useEffect, useRef, useCallback } from 'react';
import socketIOService from '../../services/socketio/socketio';
import logger from '../../utils/logging';
import { useQueryClient, QueryKey } from '@tanstack/react-query';

/**
 * 웹소켓 훅 옵션 인터페이스
 */
export interface WebSocketHookOptions<TData = any, TPayload = any> {
  /**
   * 낙관적 업데이트 사용 여부
   */
  optimisticUpdate?: boolean;
  
  /**
   * 무효화할 쿼리 키
   */
  queryKey?: QueryKey;
  
  /**
   * 데이터 업데이트 함수 (낙관적 업데이트에 사용)
   * @param oldData 기존 캐시된 데이터
   * @param newData 소켓으로부터 받은 새 데이터
   * @returns 업데이트된 데이터
   */
  updateDataFn?: (oldData: TData, newData: TPayload) => TData;
}

/**
 * 웹소켓 이벤트를 처리하는 훅
 * @param event - 구독할 이벤트 이름
 * @param callback - 이벤트 발생 시 호출될 콜백 함수
 * @param options - 추가 옵션
 * @returns 메시지 전송 함수
 */
const useWebSocketHook = <TData = any, TPayload = any>(
  event: string,
  callback: (data: TPayload) => void,
  options: WebSocketHookOptions<TData, TPayload> = {}
): (messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => void => {
  // 최신 콜백 함수를 참조하기 위한 ref
  const callbackRef = useRef<(data: TPayload) => void>(callback);
  const optionsRef = useRef<WebSocketHookOptions<TData, TPayload>>(options);
  const queryClient = useQueryClient();
  
  // 콜백 함수가 변경될 때마다 ref 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // 옵션이 변경될 때마다 ref 업데이트
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  // 이벤트 리스너 등록 및 해제
  useEffect(() => {
    // 이벤트 이름이 없거나 빈 문자열인 경우 기본값 사용
    const eventName = event || 'default_event';
    
    if (!event) {
      // 개발 환경에서만 경고 메시지 표시
      if (process.env.NODE_ENV === 'development') {
        // 호출 스택 정보 가져오기
        const stackTrace = new Error().stack || '';
        const stackLines = stackTrace.split('\n');
        
        // 첫 번째 줄은 Error 객체 생성, 두 번째 줄은 현재 함수, 세 번째 줄부터 호출 스택
        const callerInfo = stackLines.length > 2 ? stackLines[2].trim() : '알 수 없는 위치';
        
        logger.warn(
          'useWebSocketHook', 
          `이벤트 이름이 제공되지 않아 기본값을 사용합니다. 호출 위치: ${callerInfo}`
        );
        
        // 콘솔에 더 자세한 스택 트레이스 출력
        console.warn('useWebSocketHook 이벤트 이름 누락 - 호출 스택:', stackTrace);
      }
    }
    
    // 이벤트 핸들러 함수
    const handleEvent = (data: TPayload) => {
      try {
        logger.debug(
          'useWebSocketHook', 
          `이벤트 수신: ${eventName}, 데이터: ${JSON.stringify(data, null, 2)}`
        );
        
        // 낙관적 업데이트 처리 (개선된 방식)
        if (optionsRef.current.optimisticUpdate && optionsRef.current.queryKey) {
          try {
            queryClient.setQueryData(
              optionsRef.current.queryKey,
              (oldData: TData) => {
                if (optionsRef.current.updateDataFn) {
                  return optionsRef.current.updateDataFn(oldData, data);
                }
                return data as unknown as TData;
              }
            );
            
            if (process.env.NODE_ENV === 'development') {
              logger.debug('useWebSocketHook', '캐시 직접 업데이트 성공');
            }
          } catch (updateError) {
            logger.error('useWebSocketHook', '캐시 업데이트 중 오류 발생', updateError);
          }
        }
        
        // 콜백 호출
        callbackRef.current(data);
      } catch (error) {
        logger.error(
          'useWebSocketHook', 
          `이벤트 처리 중 오류 발생: ${eventName}`, 
          error
        );
      }
    };
    
    // 이벤트 리스너 등록
    socketIOService.on(eventName, handleEvent);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info('useWebSocketHook', `이벤트 리스너 등록: ${eventName}`);
    }
    
    // 컴포넌트 언마운트 시 이벤트 리스너 해제
    return () => {
      socketIOService.off(eventName, handleEvent);
      if (process.env.NODE_ENV === 'development') {
        logger.info('useWebSocketHook', `이벤트 리스너 해제: ${eventName}`);
      }
    };
  }, [event, queryClient]);
  
  // 메시지 전송 함수 - 낙관적 업데이트 지원
  const sendMessage = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
      logger.debug(
        'useWebSocketHook', 
        `메시지 전송: ${messageEvent}, 데이터: ${JSON.stringify(data, null, 2)}`
      );
      
      // 로컬 업데이트 콜백이 제공된 경우 즉시 실행
      if (localUpdateCallback && typeof localUpdateCallback === 'function') {
        logger.debug('useWebSocketHook', '로컬 업데이트 실행');
        localUpdateCallback(data);
      }
      
      // socketIOService를 통해 메시지 전송
      socketIOService.emit(messageEvent, data);
    } catch (error) {
      logger.error(
        'useWebSocketHook', 
        `메시지 전송 중 오류 발생: ${messageEvent}`, 
        error
      );
    }
  }, []);
  
  return sendMessage;
};

export default useWebSocketHook;
