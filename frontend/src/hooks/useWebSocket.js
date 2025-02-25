import { useEffect, useRef, useState } from 'react';

export const useWebSocket = (url, onMessage) => {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      
      const ws = new WebSocket(url);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setStatus('connected');
        clearTimeout(reconnectTimeoutRef.current);
      };
      
      ws.onmessage = (event) => {
        onMessage(JSON.parse(event.data));
      };
      
      ws.onclose = () => {
        setStatus('disconnected');
        // 지수 백오프 재연결
        reconnectTimeoutRef.current = setTimeout(connect, 1000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };
    
    connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [url, onMessage]);

  return status;
}; 