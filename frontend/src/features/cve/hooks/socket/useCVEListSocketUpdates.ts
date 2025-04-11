// socket/useCVEListSocketUpdates.ts
import { useRef, useEffect } from 'react';
import { useTimers } from '../utils/cveQueryUtils';
import useCVESocket from './useCVESocket';
import logger from 'shared/utils/logging';
import { CVE_EVENTS } from 'core/socket/services/constants';

/**
 * CVE 목록 실시간 업데이트 훅
 * 웹소켓을 통해 CVE 목록 변경사항을 실시간으로 수신하고 쿼리 캐시를 업데이트
 * 
 * @returns 연결 상태 객체
 */
export function useCVEListUpdates() {
  // 코어 소켓 훅 사용
  const { 
    connected, 
    on, 
    cleanup,
    invalidateCVEQueries,
    onCVECreated,
    onCVEUpdated,
    onCVEDeleted,
    subscribeCVEList,
    unsubscribeCVEList
  } = useCVESocket();
  
  const { startTimer, clearTimer, clearAllTimers } = useTimers();
  
  // 재연결 상태 추적
  const reconnectAttemptsRef = useRef(0);
  
  // 구독 상태 관리용 ref
  const isSubscribedRef = useRef(false);
  
  // 연결 손실 및 복구 처리 기능 (간소화됨)
  const handleConnectionChange = (isConnected: boolean) => {
    if (!isConnected) {
      logger.warn('useCVEListUpdates', '웹소켓 연결 끊김 감지');
      reconnectAttemptsRef.current = 0;
    } else if (reconnectAttemptsRef.current > 0) {
      logger.info('useCVEListUpdates', '웹소켓 연결 복구됨');
      // 연결 복구 후 구독 복구 시도
      if (isSubscribedRef.current) {
        logger.info('useCVEListUpdates', '구독 상태 복구 시도');
        subscribeCVEList();
      }
    }
  };
  
  // 웹소켓 이벤트 구독 설정
  useEffect(() => {
    if (connected && !isSubscribedRef.current) {
      logger.info('useCVEListUpdates', 'CVE 업데이트 구독 요청 전송');
      
      // 이벤트 구독 설정
      const unsubCreated = on(CVE_EVENTS.CVE_CREATED, onCVECreated);
      const unsubUpdated = on(CVE_EVENTS.CVE_UPDATED, onCVEUpdated);
      const unsubDeleted = on(CVE_EVENTS.CVE_DELETED, onCVEDeleted);
      
      // 서버에 구독 요청 전송
      subscribeCVEList();
      
      isSubscribedRef.current = true;
      
      // 컴포넌트 언마운트 시 정리 작업 수행
      return () => {
        // 구독 해제
        unsubCreated();
        unsubUpdated();
        unsubDeleted();
        
        // 서버에 구독 해제 요청 전송
        if (connected) {
          logger.info('useCVEListUpdates', 'CVE 목록 업데이트 구독 해제');
          unsubscribeCVEList();
        }
        
        // 디바운스된 함수 취소
        invalidateCVEQueries.cancel();
        
        // 타이머 정리
        clearAllTimers();
        
        // 소켓 정리
        cleanup();
        
        // 구독 상태 초기화
        isSubscribedRef.current = false;
      };
    }
    
    // 연결 상태 변경 감지
    handleConnectionChange(connected);
    
    // 연결되지 않은 경우 정리 함수 제공
    return () => {
      invalidateCVEQueries.cancel();
      clearAllTimers();
    };
  }, [connected, on, cleanup, onCVECreated, onCVEUpdated, onCVEDeleted, subscribeCVEList, unsubscribeCVEList, invalidateCVEQueries, clearAllTimers]);

  // 연결 끊김 후 자동 재연결 시도
  useEffect(() => {
    if (!connected && isSubscribedRef.current) {
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttemptsRef.current),
        10000
      );
      
      logger.warn('useCVEListUpdates', '연결 끊김. 재연결 시도 예약', {
        재시도횟수: reconnectAttemptsRef.current + 1,
        지연시간: `${delay}ms`
      });
      
      // 지수 백오프로 재연결 시도
      const timerKey = 'reconnect-attempt';
      startTimer(timerKey, () => {
        reconnectAttemptsRef.current++;
        
        if (reconnectAttemptsRef.current > 3) {
          logger.error('useCVEListUpdates', '최대 재연결 시도 횟수 초과. 목록 업데이트가 중단됨.');
          clearTimer(timerKey);
          return;
        }
        
        // 서버에 구독 요청 재시도
        if (connected) {
          logger.info('useCVEListUpdates', '재연결 성공. 구독 갱신');
          subscribeCVEList();
        }
      }, delay);
      
      return () => {
        clearTimer(timerKey);
      };
    }
  }, [connected, startTimer, clearTimer, subscribeCVEList]);

  return { 
    isConnected: connected,
    reconnectAttempts: reconnectAttemptsRef.current
  };
}

export default useCVEListUpdates;