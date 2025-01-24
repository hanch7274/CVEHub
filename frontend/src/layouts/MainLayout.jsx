import React, { useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
// ... other imports

const MainLayout = () => {
  const { isConnected, lastMessage } = useWebSocketContext();

  // 연결 상태 변경 시 로깅
  useEffect(() => {
    console.log('[MainLayout] 웹소켓 연결 상태:', {
      isConnected,
      timestamp: new Date().toISOString()
    });
  }, [isConnected]);

  // 새 메시지 수신 시 로깅
  useEffect(() => {
    if (lastMessage) {
      console.log('[MainLayout] 웹소켓 메시지 수신:', {
        type: lastMessage.type,
        data: lastMessage.data,
        timestamp: new Date().toISOString()
      });
    }
  }, [lastMessage]);

  // ... rest of the component code
}; 