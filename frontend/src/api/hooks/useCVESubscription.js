import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketIO } from '../../contexts/SocketIOContext';
import { QUERY_KEYS } from '../queryKeys';
import { SOCKET_EVENTS } from '../../services/socketio/constants';

/**
 * CVE 구독 상태 관리 훅
 * 
 * 특정 CVE ID에 대한 구독 상태 관리 및 실시간 구독자 정보 업데이트를 제공합니다.
 * Socket.IO를 통해 서버와 구독 관계를 관리합니다.
 * 
 * @param {string} cveId - 구독 대상 CVE ID
 * @returns {Object} - 구독 관련 상태와 함수들
 */
const useCVESubscription = (cveId) => {
  const { socket, connected } = useSocketIO();
  const queryClient = useQueryClient();
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 구독자 목록을 업데이트하는 핸들러
  const handleSubscriptionUpdated = useCallback((data) => {
    if (!data || !data.cveId || data.cveId !== cveId) return;
    
    console.log(`[useCVESubscription] 구독자 목록 업데이트: ${data.cveId}`, data.subscribers);
    setSubscribers(data.subscribers || []);
    
    // 사용자가 현재 구독 목록에 있는지 확인
    const currentUserId = localStorage.getItem('userId');
    const isCurrentUserSubscribed = data.subscribers?.some(sub => 
      sub.id === currentUserId || sub.userId === currentUserId
    );
    
    setIsSubscribed(isCurrentUserSubscribed);
  }, [cveId]);
  
  // 구독 요청 함수
  const subscribe = useCallback(() => {
    if (!cveId) {
      console.warn('[useCVESubscription] CVE ID가 제공되지 않았습니다.');
      setError('CVE ID가 제공되지 않았습니다.');
      return false;
    }
    
    if (!connected || !socket) {
      console.warn('[useCVESubscription] 소켓이 연결되지 않았습니다.', {
        connected,
        socketExists: !!socket,
        socketId: socket?.id,
        cveId
      });
      setError('웹소켓 연결이 활성화되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`[useCVESubscription] CVE 구독 요청: ${cveId}`, {
        socketId: socket.id,
        connected,
        timestamp: new Date().toISOString()
      });
      
      // 구독 요청 전송
      socket.emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cveId });
      
      // 5초 후에도 응답이 없으면 타임아웃 처리
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          console.warn(`[useCVESubscription] 구독 요청 타임아웃: ${cveId}`);
          setIsLoading(false);
          setError('구독 요청 시간이 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
        }
      }, 5000);
      
      // 클린업 함수에서 타임아웃 제거
      return () => clearTimeout(timeoutId);
    } catch (err) {
      console.error('[useCVESubscription] 구독 요청 오류:', err, {
        cveId,
        socketId: socket?.id,
        connected,
        errorMessage: err.message,
        errorStack: err.stack
      });
      setIsLoading(false);
      setError(err.message || '구독 요청 중 오류가 발생했습니다.');
      return false;
    }
  }, [cveId, connected, socket, isLoading]);
  
  // 구독 해제 요청 함수
  const unsubscribe = useCallback(() => {
    if (!cveId) {
      console.warn('[useCVESubscription] CVE ID가 제공되지 않았습니다.');
      setError('CVE ID가 제공되지 않았습니다.');
      return false;
    }
    
    if (!connected || !socket) {
      console.warn('[useCVESubscription] 소켓이 연결되지 않았습니다.', {
        connected,
        socketExists: !!socket,
        socketId: socket?.id,
        cveId
      });
      setError('웹소켓 연결이 활성화되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`[useCVESubscription] CVE 구독 해제 요청: ${cveId}`, {
        socketId: socket.id,
        connected,
        timestamp: new Date().toISOString()
      });
      
      // 구독 해제 요청 전송
      socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cveId });
      
      // 5초 후에도 응답이 없으면 타임아웃 처리
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          console.warn(`[useCVESubscription] 구독 해제 요청 타임아웃: ${cveId}`);
          setIsLoading(false);
          setError('구독 해제 요청 시간이 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
        }
      }, 5000);
      
      // 클린업 함수에서 타임아웃 제거
      return () => clearTimeout(timeoutId);
    } catch (err) {
      console.error('[useCVESubscription] 구독 해제 요청 오류:', err, {
        cveId,
        socketId: socket?.id,
        connected,
        errorMessage: err.message,
        errorStack: err.stack
      });
      setIsLoading(false);
      setError(err.message || '구독 해제 요청 중 오류가 발생했습니다.');
      return false;
    }
  }, [cveId, connected, socket, isLoading]);
  
  // Socket.IO 이벤트 리스너 설정
  useEffect(() => {
    if (!socket || !connected || !cveId) {
      console.debug(`[useCVESubscription] 소켓 연결 상태 확인:`, {
        socketExists: !!socket,
        socketId: socket?.id,
        connected,
        cveId,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    console.log(`[useCVESubscription] 구독 이벤트 리스너 설정: ${cveId}`, {
      socketId: socket.id,
      connected,
      timestamp: new Date().toISOString()
    });
    
    // 구독 상태 업데이트 이벤트 리스너
    socket.on(SOCKET_EVENTS.SUBSCRIPTION_UPDATED, handleSubscriptionUpdated);
    
    // 구독 성공 이벤트 리스너
    socket.on(SOCKET_EVENTS.SUBSCRIBE_ACK, (data) => {
      if (data.cveId === cveId) {
        console.log(`[useCVESubscription] 구독 성공: ${cveId}`, {
          data,
          timestamp: new Date().toISOString()
        });
        setIsSubscribed(true);
        setIsLoading(false);
        setError(null);
        
        // 구독자 목록 업데이트
        if (data.subscribers) {
          setSubscribers(data.subscribers);
        }
        
        // 캐시 업데이트
        queryClient.invalidateQueries([QUERY_KEYS.CVE_DETAIL, cveId]);
      }
    });
    
    // 구독 실패 이벤트 리스너
    socket.on('subscription:error', (data) => {
      if (data.cveId === cveId) {
        console.error(`[useCVESubscription] 구독 실패: ${cveId}`, {
          error: data.error,
          message: data.message,
          timestamp: new Date().toISOString()
        });
        setIsLoading(false);
        setError(data.message || '구독 요청 중 오류가 발생했습니다.');
      }
    });
    
    // 구독 해제 성공 이벤트 리스너
    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_ACK, (data) => {
      if (data.cveId === cveId) {
        console.log(`[useCVESubscription] 구독 해제 성공: ${cveId}`, {
          data,
          timestamp: new Date().toISOString()
        });
        setIsSubscribed(false);
        setIsLoading(false);
        setError(null);
        
        // 구독자 목록 업데이트
        if (data.subscribers) {
          setSubscribers(data.subscribers);
        }
        
        // 캐시 업데이트
        queryClient.invalidateQueries([QUERY_KEYS.CVE_DETAIL, cveId]);
      }
    });
    
    // 구독 해제 실패 이벤트 리스너
    socket.on('unsubscription:error', (data) => {
      if (data.cveId === cveId) {
        console.error(`[useCVESubscription] 구독 해제 실패: ${cveId}`, {
          error: data.error,
          message: data.message,
          timestamp: new Date().toISOString()
        });
        setIsLoading(false);
        setError(data.message || '구독 해제 요청 중 오류가 발생했습니다.');
      }
    });
    
    // 컴포넌트 언마운트 시 이벤트 리스너 정리
    return () => {
      console.log(`[useCVESubscription] 이벤트 리스너 정리: ${cveId}`);
      socket.off(SOCKET_EVENTS.SUBSCRIPTION_UPDATED, handleSubscriptionUpdated);
      socket.off(SOCKET_EVENTS.SUBSCRIBE_ACK);
      socket.off('subscription:error');
      socket.off(SOCKET_EVENTS.UNSUBSCRIBE_ACK);
      socket.off('unsubscription:error');
    };
  }, [cveId, socket, connected, handleSubscriptionUpdated, queryClient]);
  
  return {
    isSubscribed,
    subscribers,
    subscribe,
    unsubscribe,
    isLoading,
    error
  };
};

export default useCVESubscription; 