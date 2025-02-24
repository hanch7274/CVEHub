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
  const messageHandler = useCallback((message) => {
    if (!message?.type || !message?.data) return;

    if (message.type === 'subscribe_cve' || message.type === 'unsubscribe_cve') {
      const { cveId: msgCveId, subscribers, username } = message.data;
      
      if (msgCveId === cveId && Array.isArray(subscribers)) {
        // 구독자 목록 업데이트
        onSubscribersChange(subscribers);

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

      // 서버 응답을 기다림 (messageHandler에서 상태 업데이트)
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
      if (!cveId || !open || cleanup) return;

      try {
        // 이전 구독 해제는 다른 CVE로 변경될 때만
        if (subscriptionState.subscribed && 
            subscriptionState.currentCveId && 
            subscriptionState.currentCveId !== cveId) {
          await handleSubscription(subscriptionState.currentCveId, false);
        }

        // 새로운 구독
        if (!subscriptionState.subscribed || 
            subscriptionState.currentCveId !== cveId) {
          await handleSubscription(cveId, true);
        }
      } catch (error) {
        console.error('[Subscription] Lifecycle error:', error);
      }
    };

    // 다이얼로그가 열려있을 때만 구독
    if (open) {
      subscribe();
    } else if (subscriptionState.subscribed) {
      // 다이얼로그가 닫힐 때 구독 해제
      handleSubscription(subscriptionState.currentCveId, false)
        .catch(error => console.error('[Subscription] Dialog close cleanup error:', error));
    }

    // 클린업 함수
    return () => {
      cleanup = true;
      isMounted = false;

      // 구독된 상태라면 무조건 구독 해제 실행
      if (subscriptionState.subscribed && subscriptionState.currentCveId) {
        console.log('[Subscription] Cleaning up subscription:', subscriptionState.currentCveId);
        handleSubscription(subscriptionState.currentCveId, false)
          .catch(error => {
            console.error('[Subscription] Cleanup error:', error);
          });
      }
    };
  }, [cveId, open, subscriptionState.subscribed, subscriptionState.currentCveId, handleSubscription]);

  return {
    isSubscribed: subscriptionState.subscribed,
    currentCveId: subscriptionState.currentCveId,
    isProcessing: processRef.current.isProcessing,
    lastError: processRef.current.lastError
  };
}; 