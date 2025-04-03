import api from 'shared/api/config/axios';
import { NOTIFICATION, WEBSOCKET } from 'shared/api/config/endpoints';

export const notificationService = {
  // 알림 목록 조회
  getNotifications: async (params) => {
    const response = await api.get(NOTIFICATION.BASE, { params });
    return response.data;
  },

  // 읽지 않은 알림 개수 조회
  getUnreadCount: async () => {
    const response = await api.get(NOTIFICATION.UNREAD_COUNT);
    return response.data;
  },

  // 알림 읽음 처리
  markAsRead: async (id) => {
    const response = await api.patch(NOTIFICATION.READ(id));
    return response.data;
  },

  // 모든 알림 읽음 처리
  markAllAsRead: async () => {
    const response = await api.patch(NOTIFICATION.READ_ALL);
    return response.data;
  },

  // WebSocket 연결 URL 생성
  getWebSocketUrl: (userId, token) => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
    const cleanHost = wsHost.replace(/^https?:\/\//, '');
    return `${wsProtocol}//${cleanHost}${WEBSOCKET.CONNECT(userId, token)}`;
  },
}; 