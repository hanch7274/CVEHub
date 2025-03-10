import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import webSocketService from '../../websocket';
import logger from '../utils/loggingService';

/**
 * WebSocket 구독 관리 훅
 * 
 * @param {string} resourceId - 구독할 리소스 ID
 * @param {string} resourceType - 리소스 타입 (기본값: 'cve')
 * @returns {object} 구독 관련 기능
 */
export const useSubscription = (resourceId, resourceType = 'cve') => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  
  // 마운트 상태 추적
  const isMounted = useRef(true);
  // 구독 취소 함수 저장
  const unsubscribeRef = useRef(null);
  // 구독 시도 중인지 추적
  const subscribingRef = useRef(false);
  // 이전 리소스 ID 추적
  const prevResourceIdRef = useRef(resourceId);

  // 마운트/언마운트 추적
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 구독 함수
  const subscribe = useCallback(async () => {
    if (!resourceId || isSubscribed || subscribingRef.current) return false;
    
    try {
      subscribingRef.current = true;
      logger.debug('Subscription', `${resourceType} 구독 시도`, { resourceId });
      
      const success = await webSocketService.subscribe(resourceId, resourceType);
      
      // 마운트된 상태일 때만 상태 업데이트
      if (isMounted.current) {
        if (success) {
          setIsSubscribed(true);
          logger.info('Subscription', `${resourceType} 구독 성공`, { resourceId });
        } else {
          logger.warn('Subscription', `${resourceType} 구독 실패`, { resourceId });
        }
      }
      
      subscribingRef.current = false;
      return success;
    } catch (error) {
      subscribingRef.current = false;
      logger.error('Subscription', `${resourceType} 구독 오류`, { resourceId, error });
      return false;
    }
  }, [resourceId, resourceType, isSubscribed]);

  // 구독 해제 함수
  const unsubscribe = useCallback(async () => {
    if (!resourceId || !isSubscribed) return false;
    
    try {
      logger.debug('Subscription', `${resourceType} 구독 해제 시도`, { resourceId });
      
      const success = await webSocketService.unsubscribe(resourceId, resourceType);
      
      // 마운트된 상태일 때만 상태 업데이트
      if (isMounted.current) {
        if (success) {
          setIsSubscribed(false);
          logger.info('Subscription', `${resourceType} 구독 해제 성공`, { resourceId });
        } else {
          logger.warn('Subscription', `${resourceType} 구독 해제 실패`, { resourceId });
        }
      }
      
      return success;
    } catch (error) {
      logger.error('Subscription', `${resourceType} 구독 해제 오류`, { resourceId, error });
      return false;
    }
  }, [resourceId, resourceType, isSubscribed]);

  // 구독 이벤트 핸들러
  const handleSubscriptionEvent = useCallback((data) => {
    if (!data || !isMounted.current) return;
    
    logger.debug('Subscription', `구독 이벤트 수신`, { 
      resourceId, 
      action: data.action,
      type: data.type,
      subscriberCount: data.subscribers?.length,
      rawData: JSON.stringify(data).substring(0, 200)
    });
    
    if (data.type === 'subscribe_cve' && data.cveId === resourceId) {
      logger.info('Subscription', `CVE 구독 이벤트 수신`, {
        cveId: data.cveId,
        subscribers: data.subscribers?.length || 0
      });
      
      if (data.subscribers) {
        setSubscribers(data.subscribers);
        setIsSubscribed(true);
      }
      return;
    }
    
    if (data.subscribers) {
      setSubscribers(data.subscribers);
    }
    
    if (data.action === 'subscribe') {
      setIsSubscribed(true);
    } else if (data.action === 'unsubscribe') {
      setIsSubscribed(false);
    }
  }, [resourceId]);

  // 이벤트 구독 및 정리
  useEffect(() => {
    if (!resourceId) return;
    
    // 리소스 ID가 변경된 경우 이전 구독 해제
    if (prevResourceIdRef.current !== resourceId && prevResourceIdRef.current && isSubscribed) {
      webSocketService.unsubscribe(prevResourceIdRef.current, resourceType)
        .then(() => logger.info('Subscription', `이전 ${resourceType} 구독 해제`, { 
          prevId: prevResourceIdRef.current,
          newId: resourceId 
        }))
        .catch(err => logger.error('Subscription', `이전 ${resourceType} 구독 해제 실패`, { 
          prevId: prevResourceIdRef.current, 
          error: err 
        }));
    }
    
    prevResourceIdRef.current = resourceId;
    
    // 이벤트 구독
    const eventName = `subscription:${resourceId}`;
    logger.debug('Subscription', `이벤트 구독`, { eventName });
    
    // CVE 관련 구독 이벤트 구독 (직접 구독 이벤트 리스닝)
    const directEventName = `subscribe_${resourceType}`;
    logger.debug('Subscription', `직접 이벤트 구독`, { directEventName });
    
    // 이전 구독 취소
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    // 복합 구독 취소 함수
    const unsubscribes = [];
    
    // 새 구독 등록
    unsubscribes.push(webSocketService.on(eventName, handleSubscriptionEvent));
    
    // 직접 CVE 구독 이벤트 등록
    unsubscribes.push(webSocketService.on(directEventName, handleSubscriptionEvent));
    
    // 구독 취소 함수 설정
    unsubscribeRef.current = () => {
      unsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') {
          try {
            unsub();
          } catch (err) {
            logger.warn('Subscription', '구독 취소 중 오류', { error: err });
          }
        }
      });
    };
    
    // 연결 상태이고 구독되지 않은 경우에만 구독 시도
    if (webSocketService.checkConnection() && !isSubscribed && !subscribingRef.current) {
      subscribe();
    }
    
    // 정리 함수
    return () => {
      // 구독 이벤트 해제
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      // 자동 구독 해제 (선택적)
      if (resourceId && isSubscribed && isMounted.current) {
        logger.debug('Subscription', `언마운트 시 구독 해제`, { resourceId });
        unsubscribe().catch(err => 
          logger.error('Subscription', `언마운트 구독 해제 오류`, { resourceId, error: err })
        );
      }
    };
  }, [resourceId, resourceType, isSubscribed, subscribe, unsubscribe, handleSubscriptionEvent]);

  // 반환 객체 메모이제이션
  return useMemo(() => ({
    isSubscribed,
    subscribers,
    subscribe,
    unsubscribe
  }), [isSubscribed, subscribers, subscribe, unsubscribe]);
}; 