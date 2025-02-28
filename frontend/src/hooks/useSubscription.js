import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import webSocketInstance from '../services/websocket';

/**
 * useSubscription 훅:
 * CVE 구독 상태를 관리하고 WebSocket을 통한 업데이트를 처리하는 훅
 * 
 * @param {string} cveId - 구독할 CVE ID
 * @param {function} onUpdateReceived - 업데이트 수신 시 콜백
 * @param {function} onSubscribersChange - 구독자 정보 변경 시 콜백
 * @returns {object} - 구독 상태 및 관리 함수
 */
export const useSubscription = (cveId, onUpdateReceived, onSubscribersChange) => {
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  
  // Refs를 사용하여 값의 안정적인 참조 유지
  const cveIdRef = useRef(cveId);
  const handlerRef = useRef(null);
  const isMountedRef = useRef(true);
  const isInitialSubscriptionRef = useRef(true);
  const isProcessingRef = useRef(false);
  
  // 안정적인 콜백 참조 유지
  const callbacksRef = useRef({
    onUpdateReceived,
    onSubscribersChange
  });
  
  // 의존성이 변경될 때마다 최신 콜백 참조 업데이트
  useEffect(() => {
    callbacksRef.current = {
      onUpdateReceived, 
      onSubscribersChange
    };
    cveIdRef.current = cveId;
  }, [cveId, onUpdateReceived, onSubscribersChange]);
  
  // 메시지 핸들러 - 의존성 없이 안정적인 참조 유지
  const messageHandler = useCallback((message) => {
    if (!isMountedRef.current || !message?.type || !message?.data) return;
    
    const currentCveId = cveIdRef.current;
    if (!currentCveId) return;
    
    try {
      // 구독자 정보 업데이트 메시지 처리
      if ((message.type === 'subscribe_cve' || message.type === 'unsubscribe_cve') && 
          message.data?.cveId === currentCveId) {
        console.log(`[useSubscription] 구독자 정보 업데이트: ${message.type}, 구독자 ${message.data?.subscribers?.length || 0}명`);
        
        if (typeof callbacksRef.current.onSubscribersChange === 'function') {
          callbacksRef.current.onSubscribersChange(message.data?.subscribers || []);
        }
      }
      
      // CVE 업데이트 메시지 처리
      if (message.type === 'cve_updated' && message.data?.cveId === currentCveId) {
        console.log(`[useSubscription] CVE 업데이트 감지: ${currentCveId}, 필드: ${message.data?.field || 'unknown'}`);
        
        if (typeof callbacksRef.current.onUpdateReceived === 'function') {
          callbacksRef.current.onUpdateReceived(message.data);
        }
      }
    } catch (error) {
      console.error('[useSubscription] 메시지 처리 오류:', error);
    }
  }, []);
  
  // 구독 관리 함수
  const manageSubscription = useCallback(async () => {
    if (!cveIdRef.current || !isAuthenticated || isProcessingRef.current) return;
    
    try {
      isProcessingRef.current = true;
      console.log(`[useSubscription] CVE 구독 관리: ${cveIdRef.current}`);
      
      // 핸들러가 등록되어 있지 않으면 등록
      if (handlerRef.current !== messageHandler) {
        // 이전 핸들러가 있으면 제거
        if (handlerRef.current) {
          webSocketInstance.removeHandler('message', handlerRef.current);
          console.log('[useSubscription] 이전 메시지 핸들러 제거');
        }
        
        // 새 핸들러 등록
        webSocketInstance.addHandler('message', messageHandler);
        handlerRef.current = messageHandler;
        console.log('[useSubscription] 새 메시지 핸들러 등록');
      }
      
      // 구독 처리
      const success = await webSocketInstance.subscribeToCVE(cveIdRef.current);
      if (success) {
        console.log(`[useSubscription] CVE 구독 성공: ${cveIdRef.current}`);
        
        // 최초 구독 시에만 스낵바 표시
        if (isInitialSubscriptionRef.current) {
          isInitialSubscriptionRef.current = false;
        }
      } else {
        console.error(`[useSubscription] CVE 구독 실패: ${cveIdRef.current}`);
      }
    } catch (error) {
      console.error('[useSubscription] 구독 관리 오류:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [messageHandler, isAuthenticated]);
  
  // 구독 해제 함수
  const unsubscribe = useCallback(async () => {
    const currentCveId = cveIdRef.current;
    if (!currentCveId) return;
    
    try {
      isProcessingRef.current = true;
      console.log(`[useSubscription] CVE 구독 해제 중: ${currentCveId}`);
      
      // 핸들러 제거
      if (handlerRef.current) {
        webSocketInstance.removeHandler('message', handlerRef.current);
        handlerRef.current = null;
        console.log('[useSubscription] 메시지 핸들러 제거됨');
      }
      
      // 구독 해제
      await webSocketInstance.unsubscribeFromCVE(currentCveId);
      console.log(`[useSubscription] CVE 구독 해제 완료: ${currentCveId}`);
    } catch (error) {
      console.error('[useSubscription] 구독 해제 오류:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, []);
  
  // 초기 구독 및 클린업
  useEffect(() => {
    isMountedRef.current = true;
    
    if (cveId && isAuthenticated) {
      // 약간의 지연 후 구독 시작 (중복 요청 방지)
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          manageSubscription();
        }
      }, 300);
      
      return () => {
        clearTimeout(timer);
        isMountedRef.current = false;
        
        // 컴포넌트 언마운트 시 구독 해제 및 핸들러 정리
        unsubscribe();
      };
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [cveId, isAuthenticated, manageSubscription, unsubscribe]);
  
  return {
    unsubscribe
  };
}; 