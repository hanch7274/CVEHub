// socket/useCVESubscription.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from 'core/socket/hooks/useSocket';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import logger from 'shared/utils/logging';

// 구독자 타입 정의
export interface Subscriber {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  profileImage?: string;
}

// 구독 상태 타입
interface SubscriptionState {
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * CVE 구독 관련 훅
 * - 구독/구독취소 액션 제공
 * - 구독자 정보 조회 (중앙 관리 시스템 활용)
 */
export function useCVESubscription(cveId: string) {
  const { socket, connected, on } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // 구독 상태 (간소화)
  const [state, setState] = useState<SubscriptionState>({
    isSubscribed: false,
    isLoading: false,
    error: null
  });
  
  // 기본적인 refs
  const componentIdRef = useRef(`cve-subscription-${cveId}`);
  const attemptedInitialSubscriptionRef = useRef(false);
  
  // 구독 상태 조회
  useEffect(() => {
    // 로컬 스토리지에서 구독 상태 가져오기
    const subscriptionKey = `cve_subscribed_${cveId}`;
    const isSubscribed = localStorage.getItem(subscriptionKey) === 'true';
    
    setState(prev => ({
      ...prev,
      isSubscribed
    }));
    
    logger.debug('useCVESubscription', `초기 구독 상태 로드: ${isSubscribed ? '구독중' : '미구독'}`, {
      cveId,
      isSubscribed
    });
  }, [cveId]);
  
  // 구독자 목록 가져오기 (중앙 관리 시스템에서)
  const getSubscribers = useCallback(() => {
    // 쿼리 클라이언트에서 구독자 목록 가져오기
    const subscribersKey = [QUERY_KEYS.CVE_SUBSCRIBERS, cveId];
    let subscribers: Subscriber[] = queryClient.getQueryData(subscribersKey) || [];
    
    // 없으면 로컬 스토리지에서 가져오기 (폴백)
    if (!subscribers || subscribers.length === 0) {
      try {
        const storedSubscribers = localStorage.getItem(`cve_subscribers_${cveId}`);
        if (storedSubscribers) {
          subscribers = JSON.parse(storedSubscribers);
        }
      } catch (error) {
        logger.error('useCVESubscription', '로컬 스토리지 구독자 정보 파싱 실패', error);
      }
    }
    
    return subscribers;
  }, [cveId, queryClient]);
  
  // 구독하기
  const subscribe = useCallback((silent: boolean = false) => {
    if (!socket || !connected || !user) {
      if (!silent) {
        setState(prev => ({
          ...prev,
          error: '소켓 연결이 없거나 로그인되지 않았습니다.'
        }));
      }
      return;
    }
    
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));
    
    logger.debug('useCVESubscription', `CVE 구독 시도: ${cveId}`, { cveId });
    
    // 로컬 스토리지에 즉시 구독 상태 저장 (낙관적 UI)
    localStorage.setItem(`cve_subscribed_${cveId}`, 'true');
    
    // 서버에 구독 요청 전송
    socket.emit('subscribe_cve', { cve_id: cveId }, (ack: any) => {
      if (ack && ack.success) {
        logger.info('useCVESubscription', `CVE 구독 성공: ${cveId}`, { ack });
        setState(prev => ({
          ...prev,
          isSubscribed: true,
          isLoading: false
        }));
      } else {
        logger.warn('useCVESubscription', `CVE 구독 실패: ${cveId}`, { ack });
        // 실패 시 로컬 스토리지 상태 되돌리기
        localStorage.removeItem(`cve_subscribed_${cveId}`);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: '구독에 실패했습니다. 다시 시도해주세요.'
        }));
      }
    });
  }, [cveId, socket, connected, user]);
  
  // 구독 취소하기
  const unsubscribe = useCallback((silent: boolean = false) => {
    if (!socket || !connected) {
      if (!silent) {
        setState(prev => ({
          ...prev,
          error: '소켓 연결이 없습니다.'
        }));
      }
      return;
    }
    
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));
    
    logger.debug('useCVESubscription', `CVE 구독 취소 시도: ${cveId}`, { cveId });
    
    // 로컬 스토리지에서 즉시 구독 상태 제거 (낙관적 UI)
    localStorage.removeItem(`cve_subscribed_${cveId}`);
    
    // 서버에 구독 취소 요청 전송
    socket.emit('unsubscribe_cve', { cve_id: cveId }, (ack: any) => {
      if (ack && ack.success) {
        logger.info('useCVESubscription', `CVE 구독 취소 성공: ${cveId}`, { ack });
        setState(prev => ({
          ...prev,
          isSubscribed: false,
          isLoading: false
        }));
      } else {
        logger.warn('useCVESubscription', `CVE 구독 취소 실패: ${cveId}`, { ack });
        // 실패 시 로컬 스토리지 상태 되돌리기
        localStorage.setItem(`cve_subscribed_${cveId}`, 'true');
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: '구독 취소에 실패했습니다. 다시 시도해주세요.'
        }));
      }
    });
  }, [cveId, socket, connected]);
  
  // 초기 구독 시도
  useEffect(() => {
    // 구독자가 있는지 확인하고, 로컬 스토리지에 구독 상태가 있으면 서버에 다시 구독 요청
    if (connected && user && !attemptedInitialSubscriptionRef.current) {
      const isSubscribed = localStorage.getItem(`cve_subscribed_${cveId}`) === 'true';
      if (isSubscribed) {
        logger.debug('useCVESubscription', `이전 구독 상태 복원 시도: ${cveId}`, { cveId });
        subscribe(true); // 조용히 구독 (오류 메시지 없음)
      }
      attemptedInitialSubscriptionRef.current = true;
    }
  }, [cveId, connected, user, subscribe]);
  
  // 정리 함수
  useEffect(() => {
    return () => {
      logger.debug('useCVESubscription', `구독 훅 정리: ${cveId}`, { cveId });
    };
  }, [cveId]);
  
  return {
    // 구독 관련 상태 및 액션
    isSubscribed: state.isSubscribed,
    isLoading: state.isLoading,
    error: state.error,
    subscribe,
    unsubscribe,
    
    // 구독자 목록 접근자
    getSubscribers,
  };
}