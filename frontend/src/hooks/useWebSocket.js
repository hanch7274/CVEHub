import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import WebSocketService, { WS_EVENT_TYPE } from '../services/websocket';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { getSessionId } from '../utils/auth';

/**
 * WebSocket Hook
 * @param {Object} options - Hook 옵션
 * @param {Function} options.onMessage - 메시지 수신 콜백
 * @param {number} options.reconnectAttempts - 최대 재연결 시도 횟수
 * @param {number} options.reconnectInterval - 재연결 시도 간격 (ms)
 * @param {Function} options.onError - 에러 발생 콜백
 * @param {Function} options.onConnectionChange - 연결 상태 변경 콜백
 */
const useWebSocket = (options = {}) => {
    const {
        onMessage,
        reconnectAttempts = 5,
        reconnectInterval = 3000,
        onError,
        onConnectionChange
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [lastMessage, setLastMessage] = useState(null);
    const { isAuthenticated } = useSelector(state => state.auth);
    const connectionChangeRef = useRef(onConnectionChange);
    const isConnectingRef = useRef(false);
    const setupAttemptRef = useRef(0);
    const maxSetupAttempts = 5;

    // 디버깅 로거
    const logger = useCallback((level, message, data = {}) => {
        if (process.env.NODE_ENV === 'development') {
            console[level](`[useWebSocket ${level}] ${message}`, {
                ...data,
                timestamp: new Date().toISOString(),
                isConnected,
                isConnecting: isConnectingRef.current,
                setupAttempt: setupAttemptRef.current,
                hasError: !!error
            });
        }
    }, [isConnected, error]);

    // 에러 처리
    const handleError = useCallback((err) => {
        logger('error', '에러 발생', { error: err });
        setError(err);
        if (onError) {
            onError(err);
        }
    }, [logger, onError]);

    // 연결 상태 변경 처리
    const handleConnectionChange = useCallback((connected, err = null) => {
        logger('debug', '연결 상태 변경', { 
            connected, 
            error: err,
            previousState: isConnectingRef.current 
        });

        if (isConnectingRef.current === connected) {
            logger('debug', '동일한 연결 상태 무시');
            return;
        }
        
        isConnectingRef.current = connected;
        setIsConnected(connected);
        
        if (err) {
            setError(err);
            logger('error', '연결 상태 변경 중 에러', { error: err });
        } else {
            setError(null);
        }
        
        if (connectionChangeRef.current) {
            connectionChangeRef.current(connected, err);
        }
    }, [logger]);

    // 메시지 처리
    const messageHandler = useCallback((message) => {
        logger('debug', '메시지 수신', { 
            messageType: message.type,
            messageData: message.data 
        });

        setLastMessage(message);
        
        if (message.type === WS_EVENT_TYPE.ERROR) {
            handleError(message.data.message || '알 수 없는 오류가 발생했습니다');
            return;
        }

        if (onMessage) {
            try {
                onMessage(message);
            } catch (err) {
                handleError('메시지 처리 중 오류가 발생했습니다');
                logger('error', '메시지 핸들러 에러', { error: err });
            }
        }
    }, [logger, onMessage, handleError]);

    // WebSocket 연결 설정
    useEffect(() => {
        // 인증이 필요하지 않은 페이지에서는 웹소켓 연결을 시도하지 않음
        if (!isAuthenticated) {
            logger('debug', '인증되지 않은 상태 - WebSocket 연결 시도하지 않음');
            return;
        }

        const token = getAccessToken();
        logger('debug', 'WebSocket 설정 시작', { 
            hasToken: !!token,
            isAuthenticated,
            setupAttempt: setupAttemptRef.current
        });

        if (!token) {
            logger('debug', '토큰 없음 - WebSocket 연결 시도하지 않음');
            return;
        }

        // 최대 설정 시도 횟수 초과 체크
        if (setupAttemptRef.current >= maxSetupAttempts) {
            logger('error', '최대 설정 시도 횟수 초과');
            handleError('WebSocket 설정 시도 횟수를 초과했습니다. 페이지를 새로고침해주세요.');
            return;
        }

        let isEffectActive = true;
        let reconnectTimeout = null;

        const setupWebSocket = async () => {
            try {
                if (!isEffectActive) {
                    logger('debug', 'Effect가 비활성화되어 설정 중단');
                    return;
                }

                // 인증 상태 재확인
                if (!isAuthenticated || !getAccessToken()) {
                    logger('debug', '인증 상태 변경 - WebSocket 연결 중단');
                    return;
                }

                setupAttemptRef.current++;
                logger('debug', 'WebSocket 서비스 설정 시도', {
                    attempt: setupAttemptRef.current,
                    maxAttempts: maxSetupAttempts
                });

                WebSocketService.setOptions({
                    reconnectAttempts,
                    reconnectInterval,
                    onConnectionChange: (connected, err) => {
                        if (!isEffectActive || !isAuthenticated) {
                            logger('debug', '비활성화된 상태의 상태 변경 무시');
                            return;
                        }
                        
                        if (isConnectingRef.current !== connected) {
                            isConnectingRef.current = connected;
                            setIsConnected(connected);
                            
                            if (err) {
                                // 인증 관련 에러는 로그인 페이지에서 표시하지 않음
                                if (!isAuthenticated && err.includes('인증')) {
                                    return;
                                }
                                setError(err);
                                logger('error', '연결 상태 변경 중 에러', { error: err });
                                
                                if (err.includes('재연결 시도 횟수를 초과했습니다')) {
                                    logger('debug', '재연결 타임아웃 설정');
                                    reconnectTimeout = setTimeout(() => {
                                        if (isEffectActive && isAuthenticated) {
                                            setError(null);
                                            WebSocketService.connect().catch(error => {
                                                logger('error', '재연결 실패', { error });
                                            });
                                        }
                                    }, 30000);
                                }
                            } else {
                                setError(null);
                            }
                            
                            connectionChangeRef.current?.(connected, err);
                        }
                    }
                });

                WebSocketService.addMessageHandler(messageHandler);

                if (!WebSocketService.isConnected() && !isConnectingRef.current) {
                    logger('debug', '새로운 연결 시도');
                    await WebSocketService.connect().catch(error => {
                        if (isEffectActive && isAuthenticated) {
                            logger('error', '연결 실패', { error });
                            handleError('WebSocket 연결에 실패했습니다');
                        }
                    });
                }
            } catch (err) {
                if (isEffectActive && isAuthenticated) {
                    handleError('WebSocket 초기화 중 오류가 발생했습니다');
                    logger('error', 'WebSocket 초기화 에러', { error: err });
                }
            }
        };

        // 초기 연결 시도 지연
        const initTimeout = setTimeout(() => {
            setupWebSocket();
        }, 100);  // 100ms 지연

        return () => {
            logger('debug', 'WebSocket Effect cleanup 시작');
            isEffectActive = false;
            clearTimeout(initTimeout);
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            WebSocketService.removeMessageHandler(messageHandler);
            WebSocketService.disconnect();
            logger('debug', 'WebSocket Effect cleanup 완료');
        };
    }, [
        isAuthenticated,
        messageHandler,
        reconnectAttempts,
        reconnectInterval,
        handleError,
        logger
    ]);

    // 메시지 전송
    const sendMessage = useCallback((message) => {
        try {
            WebSocketService.sendMessage(message);
        } catch (err) {
            handleError('메시지 전송 중 오류가 발생했습니다');
            throw err;
        }
    }, [handleError]);

    // 연결 종료
    const disconnect = useCallback(() => {
        try {
            WebSocketService.disconnect();
        } catch (err) {
            handleError('연결 종료 중 오류가 발생했습니다');
            console.error('Disconnect error:', err);
        }
    }, [handleError]);

    // 재연결
    const reconnect = useCallback(() => {
        try {
            if (!WebSocketService.isConnected()) {
                setError(null);
                WebSocketService.connect();
            }
        } catch (err) {
            handleError('재연결 중 오류가 발생했습니다');
            console.error('Reconnect error:', err);
        }
    }, [handleError]);

    return {
        isConnected,
        error,
        lastMessage,
        sendMessage,
        disconnect,
        reconnect
    };
};

export default useWebSocket;
