import { useEffect, useRef, useCallback } from 'react';
import { useSocketIO } from '../../contexts/SocketIOContext';

/**
 * Socket.IO 이벤트를 처리하기 위한 훅
 * @param {string} event - 구독할 이벤트 이름
 * @param {Function} callback - 이벤트 발생 시 실행할 콜백 함수
 * @returns {Object} - 이벤트 제어 함수들
 */
const useWebSocketHook = (event, callback) => {
  const { socket, connected } = useSocketIO();
  const savedCallback = useRef(callback);
  const isSubscribed = useRef(false);

  // 콜백 함수가 변경될 때마다 참조 업데이트
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // 이벤트 구독 설정
  useEffect(() => {
    if (!socket || !event || !connected) return;

    const handleEvent = (data) => {
      if (savedCallback.current) {
        savedCallback.current(data);
      }
    };

    // 이벤트 리스너 등록
    socket.on(event, handleEvent);
    isSubscribed.current = true;

    console.log(`[Socket.IO] '${event}' 이벤트 구독 시작`);

    // 클린업 함수
    return () => {
      if (socket) {
        socket.off(event, handleEvent);
        isSubscribed.current = false;
        console.log(`[Socket.IO] '${event}' 이벤트 구독 해제`);
      }
    };
  }, [socket, event, connected]);

  // 수동 메시지 전송 함수
  const sendMessage = useCallback((eventName, data = {}) => {
    if (!socket || !connected) {
      console.warn('[Socket.IO] 소켓이 연결되지 않은 상태에서 메시지 전송 시도');
      return false;
    }

    try {
      socket.emit(eventName, data);
      return true;
    } catch (error) {
      console.error('[Socket.IO] 메시지 전송 오류:', error);
      return false;
    }
  }, [socket, connected]);

  return {
    isSubscribed: isSubscribed.current,
    sendMessage,
    socket
  };
};

export default useWebSocketHook; 