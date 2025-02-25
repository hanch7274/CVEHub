import { useState, useRef, useCallback, useEffect } from 'react';
import { useWebSocketMessage } from '../contexts/WebSocketContext';

export const useSubscription = ({ cveId, open, currentUser, onSubscribersChange }) => {
  // 구독 상태 관리
  const [subscriptionState, setSubscriptionState] = useState({
    subscribed: false,
    currentCveId: null
  });

  // 프로세스 상태 관리
  const processRef = useRef({
    isProcessing: false,
    lastError: null,
    cleanup: null
  });

  // 현재 사용자 참조
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // WebSocket 메시지 핸들러
  const messageHandler = useCallback(async (message) => {
    if (!message?.type || !message?.data) return;

    if (message.type === 'subscribe_cve' || message.type === 'unsubscribe_cve') {
      const { cveId: msgCveId, subscribers, username } = message.data;
      
      // 자신이 보낸 메시지는 무시
      if (username === currentUserRef.current?.username) {
        console.log('[Subscription] Ignoring self-sent message');
        return;
      }
      
      if (msgCveId === cveId && Array.isArray(subscribers)) {
        // 구독자 목록 업데이트를 Promise로 래핑
        await Promise.resolve(onSubscribersChange(subscribers));

        // 현재 사용자의 구독 상태 확인
        const isCurrentUserSubscribed = subscribers.some(
          sub => sub.id === currentUserRef.current?.id
        );

        // 구독 상태가 실제로 변경된 경우만 업데이트
        setSubscriptionState(prev => {
          if (prev.subscribed !== isCurrentUserSubscribed) {
            return {
              subscribed: isCurrentUserSubscribed,
              currentCveId: isCurrentUserSubscribed ? msgCveId : null
            };
          }
          return prev;
        });
      }
    }
  }, [cveId, onSubscribersChange]);

  const { sendCustomMessage } = useWebSocketMessage(messageHandler);

  // 구독/구독 해제 함수
  const handleSubscription = useCallback(async (targetCveId, shouldSubscribe) => {
    if (!targetCveId || processRef.current.isProcessing) return;

    // 이미 구독 중인 상태에서 동일한 CVE 구독 요청이 오면 무시
    if (shouldSubscribe && 
        subscriptionState.subscribed && 
        subscriptionState.currentCveId === targetCveId) {
      console.log('[Subscription] Already subscribed to CVE:', targetCveId);
      return;
    }

    // 구독 해제 요청인데 이미 구독되지 않은 상태면 무시
    if (!shouldSubscribe && 
        (!subscriptionState.subscribed || 
         subscriptionState.currentCveId !== targetCveId)) {
      console.log('[Subscription] Already unsubscribed from CVE:', targetCveId);
      return;
    }

    processRef.current.isProcessing = true;
    console.log(`[Subscription] ${shouldSubscribe ? 'Subscribing to' : 'Unsubscribing from'} CVE:`, targetCveId);

    try {
      await sendCustomMessage(
        shouldSubscribe ? 'subscribe_cve' : 'unsubscribe_cve',
        {
          cveId: targetCveId,
          username: currentUserRef.current?.username
        }
      );

      // 서버 응답을 기다리지 않고 직접 상태 업데이트
      setSubscriptionState({
        subscribed: shouldSubscribe,
        currentCveId: shouldSubscribe ? targetCveId : null
      });

      processRef.current.lastError = null;

    } catch (error) {
      console.error('[Subscription] Error:', error);
      processRef.current.lastError = error.message;
      throw error;
    } finally {
      processRef.current.isProcessing = false;
    }
  }, [sendCustomMessage]);

  // 구독 생명주기 관리
  useEffect(() => {
    let isMounted = true;
    let cleanup = false;

    const subscribe = async () => {
      if (!cveId || cleanup || !open) return;

      try {
        // 이미 같은 CVE를 구독 중이면 무시
        if (subscriptionState.subscribed && subscriptionState.currentCveId === cveId) {
          console.log('[Subscription] Already subscribed to the same CVE:', cveId);
          return;
        }

        // 다른 CVE를 구독 중이었다면 해제
        if (subscriptionState.currentCveId && subscriptionState.currentCveId !== cveId) {
          await handleSubscription(subscriptionState.currentCveId, false);
          if (isMounted) {
            await handleSubscription(cveId, true);
          }
        } 
        // 처음 구독하는 경우
        else if (!subscriptionState.subscribed) {
          await handleSubscription(cveId, true);
        }
      } catch (error) {
        console.error('[Subscription] Lifecycle error:', error);
      }
    };

    // CVE가 열려있고 변경되었을 때만 구독 처리
    if (open && cveId) {
      subscribe();
    }

    // 클린업 함수
    return () => {
      cleanup = true;
      isMounted = false;

      // CVE 다이얼로그가 완전히 닫힐 때만 구독 해제
      if (!open && subscriptionState.subscribed) {
        console.log('[Subscription] Cleaning up subscription:', subscriptionState.currentCveId);
        handleSubscription(subscriptionState.currentCveId, false)
          .catch(error => {
            console.error('[Subscription] Cleanup error:', error);
          });
      }
    };
  }, [cveId, open]); // handleSubscription 제거, 필수 의존성만 유지

  return {
    isSubscribed: subscriptionState.subscribed,
    currentCveId: subscriptionState.currentCveId,
    isProcessing: processRef.current.isProcessing,
    lastError: processRef.current.lastError
  };
}; 