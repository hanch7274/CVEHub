import { useEffect, useRef, useCallback } from 'react';
import socketIOService from '../../services/socketio/socketio';
import logger from '../../utils/logging';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 웹소켓 이벤트를 처리하는 훅
 * @param {string} event - 구독할 이벤트 이름
 * @param {Function} callback - 이벤트 발생 시 호출될 콜백 함수
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.optimisticUpdate - 낙관적 업데이트 사용 여부
 * @param {Array} options.queryKey - 무효화할 쿼리 키
 * @param {Function} options.updateDataFn - 데이터 업데이트 함수 (낙관적 업데이트에 사용)
 * @returns {Function} - 메시지 전송 함수
 */
const useWebSocketHook = (event, callback, options = {}) => {
  // 최신 콜백 함수를 참조하기 위한 ref
  const callbackRef = useRef(callback);
  const optionsRef = useRef(options);
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
    if (!event) {
      logger.warn('useWebSocketHook', '이벤트 이름이 제공되지 않았습니다.');
      return;
    }
    
    // 이벤트 핸들러 함수
    const handleEvent = (data) => {
      try {
        logger.debug(
          'useWebSocketHook', 
          `이벤트 수신: ${event}, 데이터: ${JSON.stringify(data, null, 2)}`
        );
        
        // 낙관적 업데이트 처리 (개선된 방식)
        if (optionsRef.current.optimisticUpdate && optionsRef.current.queryKey) {
          logger.debug(
            'useWebSocketHook',
            `낙관적 업데이트 적용: ${JSON.stringify(optionsRef.current.queryKey)}`
          );
          
          // 커스텀 업데이트 함수가 제공된 경우
          if (optionsRef.current.updateDataFn && typeof optionsRef.current.updateDataFn === 'function') {
            try {
              // 현재 캐시된 데이터 가져오기
              const cachedData = queryClient.getQueryData(optionsRef.current.queryKey);
              
              if (cachedData) {
                // 업데이트 함수를 사용하여 데이터 업데이트
                const updatedData = optionsRef.current.updateDataFn(cachedData, data);
                
                // 캐시 직접 업데이트
                queryClient.setQueryData(optionsRef.current.queryKey, updatedData);
                logger.debug('useWebSocketHook', '캐시 직접 업데이트 성공');
                
                // 업데이트 성공 시 쿼리 무효화 스킵
                return;
              }
            } catch (updateError) {
              logger.error('useWebSocketHook', '캐시 업데이트 중 오류 발생', updateError);
              // 오류 발생 시 기본 무효화 방식으로 폴백
            }
          }
          
          // 기본 쿼리 무효화 (캐시 업데이트 실패 또는 업데이트 함수 없음)
          queryClient.invalidateQueries(optionsRef.current.queryKey, {
            refetchActive: true,
            refetchInactive: false
          });
        }
        
        // 최신 콜백 함수 호출
        if (callbackRef.current) {
          callbackRef.current(data);
        }
      } catch (error) {
        logger.error(
          'useWebSocketHook', 
          `이벤트 처리 중 오류 발생: ${event}`, 
          error
        );
      }
    };
    
    // 이벤트 리스너 등록
    logger.info('useWebSocketHook', `이벤트 리스너 등록: ${event}`);
    socketIOService.on(event, handleEvent);
    
    // 컴포넌트 언마운트 시 이벤트 리스너 해제
    return () => {
      logger.info('useWebSocketHook', `이벤트 리스너 해제: ${event}`);
      socketIOService.off(event, handleEvent);
    };
  }, [event, queryClient]);
  
  // 메시지 전송 함수 - 낙관적 업데이트 지원
  const sendMessage = useCallback((messageEvent, data, localUpdateCallback) => {
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