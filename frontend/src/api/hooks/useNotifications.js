import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '../services/notificationService';
import { QUERY_KEYS } from '../queryKeys';

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
