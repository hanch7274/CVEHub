// socket/useCVESubscription.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from 'core/socket/hooks/useSocket';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import logger from 'shared/utils/logging';
import socketService from 'core/socket/services/socketService';
import socketEventBus from 'core/socket/services/socketEventBus';
import { SUBSCRIPTION_EVENTS } from 'core/socket/services/constants';
import { Subscription } from 'rxjs';

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

// 구독 상태 이벤트 타입
interface SubscriptionStatusEvent {
  cveId: string;
  subscribed: boolean;
}

/**
 * CVE 구독 관련 훅
 * - 구독/구독취소 액션 제공
 * - 구독자 정보 조회 (중앙 관리 시스템 활용)
 */
export function useCVESubscription(cveId: string) {
  const { connected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // 구독 상태 (로컬 상태로 관리)
  const [state, setState] = useState<SubscriptionState>({
    isSubscribed: false, // 초기값은 false, 이후 useEffect에서 업데이트됨
    isLoading: false,
    error: null
  });
  
  // 기본적인 refs
  const componentIdRef = useRef(`cve-subscription-${cveId}`);
  const attemptedInitialSubscriptionRef = useRef(false);
  const subscriptionsRef = useRef<Subscription[]>([]);
  
  // 구독자 목록 가져오기 (중앙 관리 시스템에서)
  const getSubscribers = useCallback(() => {
    // 쿼리 클라이언트에서 구독자 목록 가져오기
    const subscribersKey = [QUERY_KEYS.CVE_SUBSCRIBERS, cveId];
    let subscribers: Subscriber[] = queryClient.getQueryData(subscribersKey) || [];
    
    return subscribers;
  }, [cveId, queryClient]);
  
  // 구독하기
  const subscribe = useCallback((silent: boolean = false) => {
    if (!connected || !user) {
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
    
    try {
      // 이벤트 버스를 통해 구독 요청 이벤트 발행 대신
      // socketService의 updateSubscription 메서드 사용
      socketService.updateSubscription(cveId, true);
      
      // 성공 시 UI 상태 업데이트 - 실제 상태는 이벤트 응답으로 업데이트됨
      setState(prev => ({
        ...prev,
        isLoading: false
      }));
      
      logger.info('useCVESubscription', `CVE 구독 요청 성공: ${cveId}`, { cveId });
    } catch (error: any) {
      // 실패 시 오류 상태로 업데이트
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error?.message || '구독 요청 실패'
      }));
      
      logger.error('useCVESubscription', `CVE 구독 실패: ${cveId}`, { 
        cveId, 
        error 
      });
    }
  }, [cveId, connected, user]);
  
  // 구독 취소하기
  const unsubscribe = useCallback((silent: boolean = false) => {
    if (!connected) {
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
    
    try {
      // 이벤트 버스를 통해 구독 취소 요청 이벤트 발행 대신
      // socketService의 updateSubscription 메서드 사용
      socketService.updateSubscription(cveId, false);
      
      // 성공 시 UI 상태 업데이트 - 실제 상태는 이벤트 응답으로 업데이트됨
      setState(prev => ({
        ...prev,
        isLoading: false
      }));
      
      logger.info('useCVESubscription', `CVE 구독 취소 요청 성공: ${cveId}`, { cveId });
    } catch (error: any) {
      // 실패 시 오류 상태로 업데이트
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error?.message || '구독 취소 요청 실패'
      }));
      
      logger.error('useCVESubscription', `CVE 구독 취소 실패: ${cveId}`, {
        cveId,
        error
      });
    }
  }, [cveId, connected]);
  
  // 구독 상태 변경 감시 (이벤트 버스 사용)
  useEffect(() => {
    // 이벤트 버스를 통한 구독 상태 업데이트 구독
    const subscription = socketEventBus.on<SubscriptionStatusEvent>(SUBSCRIPTION_EVENTS.SUBSCRIPTION_STATUS)
      .subscribe(data => {
        if (data && data.cveId === cveId) {
          const isSubscribed = !!data.subscribed;
          
          // 로컬 상태와 다를 경우에만 업데이트
          if (state.isSubscribed !== isSubscribed) {
            setState(prev => ({
              ...prev,
              isSubscribed,
              isLoading: false,
              error: null
            }));
            
            logger.debug('useCVESubscription', `구독 상태 업데이트: ${isSubscribed ? '구독중' : '미구독'}`, {
              cveId,
              isSubscribed
            });
          }
        }
      });
    
    // 구독 추적을 위해 ref에 저장
    subscriptionsRef.current.push(subscription);
    
    return () => {
      // 구독 정리
      subscription.unsubscribe();
    };
  }, [cveId, state.isSubscribed]);
  
  // 컴포넌트 언마운트 시 모든 구독 정리
  useEffect(() => {
    return () => {
      // 모든 RxJS 구독 정리
      subscriptionsRef.current.forEach(subscription => {
        if (subscription && !subscription.closed) {
          subscription.unsubscribe();
        }
      });
      subscriptionsRef.current = [];
      
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