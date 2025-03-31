import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '../services/notificationService';
import { QUERY_KEYS } from '../queryKeys';
import { useSocket } from './useSocket';
import { useEffect, useCallback } from 'react';
import logger from '../../utils/logging';

/**
 * 알림 목록을 조회하는 훅
 * @param {Object} params - 페이지네이션 파라미터 (skip, limit)
 * @param {Object} options - React Query 옵션
 * @returns {Object} 쿼리 결과
 */
export const useNotifications = (params = {}, options = {}) => {
  return useQuery({
    queryKey: [QUERY_KEYS.NOTIFICATION, 'list', params],
    queryFn: () => notificationService.getNotifications(params),
    ...options,
  });
};

/**
 * 읽지 않은 알림 개수를 조회하는 훅
 * @param {Object} options - React Query 옵션
 * @returns {Object} 쿼리 결과
 */
export const useUnreadCount = (options = {}) => {
  const queryClient = useQueryClient();
  // useSocket 훅 사용 - 함수 시그니처에 맞게 수정
  const { on } = useSocket(
    undefined, // 이벤트 이름은 지정하지 않음
    undefined, // 콜백 함수는 지정하지 않음
    [], // 의존성 배열
    {
      componentId: 'notifications-unread-count',
      useRxJS: true
    }
  );
  
  // 실시간 알림 수신 시 카운트 업데이트
  useEffect(() => {
    // 새 알림 이벤트 리스너
    const unsubNewNotification = on('NEW_NOTIFICATION', () => {
      logger.info('새 알림 이벤트 수신');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'unread-count'] });
    });
    
    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      unsubNewNotification();
    };
  }, [on, queryClient]);
  
  return useQuery({
    queryKey: [QUERY_KEYS.NOTIFICATION, 'unread-count'],
    queryFn: () => notificationService.getUnreadCount(),
    ...options,
  });
};

/**
 * 알림을 읽음 처리하는 훅
 * @returns {Object} 뮤테이션 결과
 */
export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id) => notificationService.markAsRead(id),
    onSuccess: () => {
      // 알림 목록과 읽지 않은 알림 개수 갱신
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'list'] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'unread-count'] });
    },
  });
};

/**
 * 모든 알림을 읽음 처리하는 훅
 * @returns {Object} 뮤테이션 결과
 */
export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      // 알림 목록과 읽지 않은 알림 개수 갱신
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'list'] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'unread-count'] });
    },
  });
};

/**
 * 실시간 알림 업데이트를 구독하는 훅
 * @returns {Object} 구독 상태
 */
export const useNotificationUpdates = () => {
  const queryClient = useQueryClient();
  // useSocket 훅 사용 - 함수 시그니처에 맞게 수정
  const { connected, on } = useSocket(
    undefined, // 이벤트 이름은 지정하지 않음
    undefined, // 콜백 함수는 지정하지 않음
    [], // 의존성 배열
    {
      componentId: 'notification-updates',
      useRxJS: true
    }
  );
  
  // 새 알림 이벤트 핸들러
  const handleNewNotification = useCallback((notification) => {
    logger.info('새 알림 수신:', notification);
    
    // 알림 목록과 읽지 않은 알림 개수 갱신
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'list'] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'unread-count'] });
  }, [queryClient]);
  
  // 읽음 처리 이벤트 핸들러
  const handleNotificationRead = useCallback((data) => {
    logger.info('알림 읽음 이벤트 수신:', data);
    
    // 알림 목록과 읽지 않은 알림 개수 갱신
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'list'] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATION, 'unread-count'] });
  }, [queryClient]);
  
  // 소켓 이벤트 구독 설정
  useEffect(() => {
    if (connected) {
      // 이벤트 구독 설정
      const unsubNew = on('NEW_NOTIFICATION', handleNewNotification);
      const unsubRead = on('NOTIFICATION_READ', handleNotificationRead);
      const unsubAllRead = on('ALL_NOTIFICATIONS_READ', handleNotificationRead);
      
      // 컴포넌트 언마운트 시 정리 작업
      return () => {
        unsubNew();
        unsubRead();
        unsubAllRead();
      };
    }
  }, [connected, on, handleNewNotification, handleNotificationRead, queryClient]);
  
  return { isConnected: connected };
};

export default {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useNotificationUpdates
};