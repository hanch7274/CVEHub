import { getAccessToken } from '../utils/storage/tokenStorage';
import { getSessionId } from '../utils/auth';
import { WS_BASE_URL } from '../config';
import { v4 as uuidv4 } from 'uuid';

// WebSocket 상태 상수
export const WS_STATUS = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
};

// WebSocket 이벤트 타입
export const WS_EVENT_TYPE = {
    CONNECTED: 'connected',
    CONNECT_ACK: 'connect_ack',
    NOTIFICATION: 'notification',
    NOTIFICATION_READ: 'notification_read',
    ALL_NOTIFICATIONS_READ: 'all_notifications_read',
    ERROR: 'error',
    PING: 'ping',
    PONG: 'pong',
    CLOSE: 'close'  // 명시적 종료 메시지 추가
};

// WebSocket 에러 코드
export const WS_ERROR_CODE = {
    NORMAL_CLOSURE: 1000,
    AUTH_FAILED: 4001,
    INVALID_MESSAGE: 4002,
    INTERNAL_ERROR: 4003
};

class WebSocketService {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.messageHandlers = new Set();
        this.isConnecting = false;
        this.sessionId = getSessionId();
        this.onConnectionChange = null;
        this.lastActivityTime = Date.now();
        this.pingInterval = null;
        this.PING_INTERVAL = 15000;
        this.connectionStartTime = null;
        this.connectionPromise = null;
        this.lastConnectionAttemptTime = null;  // 마지막 연결 시도 시간
        this.MIN_RECONNECT_DELAY = 2000;  // 최소 재연결 대기 시간 (2초)
        this.logger = this.setupLogger();
        this.isClosing = false;  // 명시적 종료 상태 추가
    }

    setupLogger() {
        return {
            debug: (message, data = {}) => {
                if (process.env.NODE_ENV === 'development') {
                    console.debug(`[WebSocket Debug] ${message}`, {
                        ...data,
                        timestamp: new Date().toISOString(),
                        sessionId: this.sessionId,
                        connectionState: this.ws?.readyState,
                        isConnecting: this.isConnecting,
                        reconnectAttempts: this.reconnectAttempts,
                        connectionDuration: this.connectionStartTime ? 
                            Math.floor((Date.now() - this.connectionStartTime) / 1000) : null
                    });
                }
            },
            info: (message, data = {}) => {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[WebSocket] ${message}`, {
                        ...data,
                        timestamp: new Date().toISOString(),
                        sessionId: this.sessionId,
                        connectionState: this.ws?.readyState,
                        isConnecting: this.isConnecting,
                        reconnectAttempts: this.reconnectAttempts
                    });
                }
            },
            error: (message, error = null, data = {}) => {
                console.error(`[WebSocket Error] ${message}`, {
                    error,
                    ...data,
                    timestamp: new Date().toISOString(),
                    sessionId: this.sessionId,
                    connectionState: this.ws?.readyState,
                    isConnecting: this.isConnecting,
                    reconnectAttempts: this.reconnectAttempts,
                    stackTrace: error?.stack
                });
            }
        };
    }

    setOptions(options = {}) {
        const {
            reconnectAttempts = 5,
            reconnectInterval = 3000,
            onConnectionChange = null
        } = options;

        this.maxReconnectAttempts = reconnectAttempts;
        this.reconnectInterval = reconnectInterval;
        this.onConnectionChange = onConnectionChange;
    }

    updateLastActivity() {
        this.lastActivityTime = Date.now();
    }

    setupPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WS_STATUS.OPEN) {
                try {
                    const pingMessage = {
                        type: WS_EVENT_TYPE.PING,
                        data: {
                            timestamp: new Date().toISOString(),
                            sessionId: this.sessionId
                        }
                    };
                    this.ws.send(JSON.stringify(pingMessage));
                    this.logger.info('Ping 전송');
                } catch (error) {
                    this.logger.error('Ping 전송 실패', error);
                    this.disconnect();
                }
            }
        }, this.PING_INTERVAL);
    }

    connect() {
        this.logger.debug('연결 시도 전 상태 확인', {
            currentState: this.ws?.readyState,
            isConnecting: this.isConnecting,
            hasConnectionPromise: !!this.connectionPromise,
            reconnectAttempts: this.reconnectAttempts,
            timeSinceLastAttempt: this.lastConnectionAttemptTime ? 
                Date.now() - this.lastConnectionAttemptTime : null
        });

        // 이미 연결된 경우
        if (this.ws?.readyState === WS_STATUS.OPEN) {
            this.logger.info('이미 연결되어 있습니다');
            return Promise.resolve();
        }

        // 연결 진행 중인 경우
        if (this.isConnecting) {
            this.logger.info('연결이 이미 진행 중입니다');
            return this.connectionPromise || Promise.reject(new Error('연결 진행 중'));
        }

        const token = getAccessToken();
        if (!token) {
            this.logger.error('액세스 토큰이 없습니다');
            return Promise.reject(new Error('인증 토큰이 없습니다'));
        }

        // 이전 연결 정리
        this.cleanup();
        
        this.isConnecting = true;
        this.lastConnectionAttemptTime = Date.now();
        this.connectionStartTime = Date.now();

        this.connectionPromise = new Promise((resolve, reject) => {
            const wsUrl = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}&session_id=${this.sessionId}`;
            
            try {
                // 이전 WebSocket 인스턴스가 있다면 정리
                if (this.ws) {
                    try {
                        this.ws.close(WS_ERROR_CODE.NORMAL_CLOSURE, '새로운 연결 시도');
                    } catch (error) {
                        this.logger.debug('이전 연결 정리 중 오류', error);
                    }
                    this.ws = null;
                }

                this.ws = new WebSocket(wsUrl);
                
                // 연결 타임아웃 설정 (5초)
                const timeoutId = setTimeout(() => {
                    if (this.ws?.readyState !== WS_STATUS.OPEN) {
                        this.logger.error('연결 타임아웃');
                        this.cleanup();
                        reject(new Error('연결 시간 초과'));
                    }
                }, 5000);

                this.ws.onopen = () => {
                    clearTimeout(timeoutId);
                    this.logger.info('연결 성공', {
                        attemptDuration: Date.now() - this.lastConnectionAttemptTime
                    });
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    // setupPingInterval은 connected 메시지 수신 후로 이동
                    this.onConnectionChange?.(true, null);
                    resolve();
                };

                this.ws.onerror = (error) => {
                    clearTimeout(timeoutId);
                    this.logger.error('연결 오류 발생', error);
                    this.cleanup();
                    reject(error);
                };

                this.setupWebSocketHandlers();
                this.logger.info('연결 시도 중', { url: wsUrl });

            } catch (error) {
                this.cleanup();
                this.handleConnectionError(error);
                reject(error);
            }
        }).catch(error => {
            this.connectionPromise = null;
            throw error;
        });

        return this.connectionPromise;
    }

    setupWebSocketHandlers() {
        if (!this.ws) {
            this.logger.error('WebSocket 인스턴스가 없습니다');
            return;
        }

        // 이벤트 핸들러 바인딩 전에 이전 핸들러 제거
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;

        // 새로운 핸들러 바인딩
        this.ws.onopen = this.handleOpen.bind(this);
        this.ws.onmessage = this.handleMessage.bind(this);
        this.ws.onclose = this.handleClose.bind(this);
        this.ws.onerror = this.handleError.bind(this);

        this.logger.debug('WebSocket 핸들러 설정 완료', {
            hasWS: !!this.ws,
            readyState: this.ws?.readyState
        });
    }

    handleOpen() {
        // 연결 시작 시간 기록
        const connectionTime = Date.now() - this.connectionStartTime;
        
        this.logger.debug('handleOpen 호출됨', {
            hasWS: !!this.ws,
            readyState: this.ws?.readyState,
            connectionTime: `${connectionTime}ms`,
            isConnecting: this.isConnecting
        });

        // WebSocket 인스턴스 존재 여부 확인
        if (!this.ws) {
            this.logger.error('handleOpen: WebSocket 인스턴스가 없음');
            return;
        }

        // readyState가 CONNECTING인 경우 잠시 대기
        if (this.ws.readyState === WS_STATUS.CONNECTING) {
            this.logger.debug('연결 진행 중, 상태 변경 대기');
            setTimeout(() => this.handleOpen(), 100);
            return;
        }

        // readyState가 OPEN이 아닌 경우
        if (this.ws.readyState !== WS_STATUS.OPEN) {
            this.logger.error('WebSocket이 올바르게 열리지 않음', {
                readyState: this.ws.readyState,
                connectionTime
            });
            this.cleanup();
            this.attemptReconnect();
            return;
        }

        // 연결 성공 처리
        this.logger.info('연결 성공', {
            readyState: this.ws.readyState,
            connectionTime: `${connectionTime}ms`
        });
        
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.onConnectionChange?.(true, null);
        this.setupPingInterval();
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.logger.debug('메시지 수신', { type: message.type });
            
            switch (message.type) {
                case WS_EVENT_TYPE.CONNECTED:
                    this.handleConnectedMessage(message);
                    break;
                case WS_EVENT_TYPE.CLOSE:
                    if (!this.isClosing) {
                        this.logger.info('서버로부터 종료 요청 수신');
                        this.disconnect();
                    }
                    break;
                case WS_EVENT_TYPE.PING:
                    this.handlePingMessage();
                    break;
                case WS_EVENT_TYPE.PONG:
                    this.handlePongMessage();
                    break;
                default:
                    this.processMessage(message);
            }
        } catch (error) {
            this.logger.error('메시지 처리 중 오류', error);
        }
    }

    handleConnectedMessage(message) {
        this.logger.debug('Connected 메시지 처리', {
            requiresAck: message.data?.requires_ack,
            sessionId: message.data?.session_id,
            readyState: this.ws?.readyState,
            connectionDuration: this.connectionStartTime ? 
                Math.floor((Date.now() - this.connectionStartTime) / 1000) : null
        });

        if (!this.ws || this.ws.readyState !== WS_STATUS.OPEN) {
            this.logger.error('Connected 메시지 처리 실패: 연결이 유효하지 않음', {
                hasWS: !!this.ws,
                readyState: this.ws?.readyState
            });
            return;
        }

        // connected 메시지를 받은 후에만 ACK 전송
        if (message.data?.requires_ack) {
            // ACK 전송 전에 핸들러 설정
            const originalOnMessage = this.ws.onmessage;
            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.type === WS_EVENT_TYPE.CONNECT_ACK) {
                        // ACK 응답을 받으면 원래 메시지 핸들러로 복구
                        this.ws.onmessage = originalOnMessage;
                        
                        // 연결 설정 완료
                        this.setupPingInterval();
                        this.isConnecting = false;
                        this.reconnectAttempts = 0;
                        this.onConnectionChange?.(true, null);
                    } else {
                        // ACK 이외의 메시지는 원래 핸들러로 전달
                        originalOnMessage?.(event);
                    }
                } catch (error) {
                    this.logger.error('ACK 응답 처리 중 오류', error);
                    originalOnMessage?.(event);
                }
            };

            // ACK 메시지 전송
            this.sendConnectAck();
        }
    }

    handlePingMessage() {
        if (this.ws?.readyState === WS_STATUS.OPEN) {
            this.logger.debug('Ping 메시지 처리');
            this.sendPong();
        }
    }

    handlePongMessage() {
        this.logger.debug('Pong 메시지 처리');
        this.updateLastActivity();
    }

    processMessage(message) {
        if (this.ws?.readyState === WS_STATUS.OPEN) {
            this.messageHandlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    this.logger.error('메시지 핸들러 실행 중 오류', error, {
                        messageType: message.type
                    });
                }
            });
        }
    }

    sendConnectAck() {
        // 연결 상태 상세 확인
        const currentState = this.ws?.readyState;
        this.logger.debug('ACK 전송 전 연결 상태 확인', {
            readyState: currentState,
            isConnecting: this.isConnecting,
            connectionDuration: this.connectionStartTime ? 
                Math.floor((Date.now() - this.connectionStartTime) / 1000) : null
        });

        if (currentState !== WS_STATUS.OPEN) {
            this.logger.error('ACK 전송 실패: 연결이 완전히 열리지 않음', {
                readyState: currentState,
                sessionId: this.sessionId
            });
            return;  // 연결 종료하지 않고 그냥 반환
        }

        try {
            const ackMessage = {
                type: 'connect_ack',
                data: {
                    timestamp: new Date().toISOString(),
                    sessionId: this.sessionId
                }
            };
            const messageStr = JSON.stringify(ackMessage);
            
            // 한 번 더 연결 상태 확인
            if (this.ws?.readyState === WS_STATUS.OPEN) {
                this.ws.send(messageStr);
                this.logger.debug('ACK 메시지 전송 성공', {
                    message: ackMessage,
                    readyState: this.ws.readyState,
                    connectionDuration: this.connectionStartTime ? 
                        Math.floor((Date.now() - this.connectionStartTime) / 1000) : null
                });
            } else {
                throw new Error('연결 상태가 전송 도중 변경됨');
            }
        } catch (error) {
            this.logger.error('ACK 메시지 전송 실패', error, {
                readyState: this.ws?.readyState,
                sessionId: this.sessionId,
                connectionDuration: this.connectionStartTime ? 
                    Math.floor((Date.now() - this.connectionStartTime) / 1000) : null
            });
            // 연결 종료하지 않고 에러만 로깅
        }
    }

    sendPong() {
        if (this.ws?.readyState === WS_STATUS.OPEN) {
            try {
                const pongMessage = {
                    type: WS_EVENT_TYPE.PONG,
                    data: {
                        timestamp: new Date().toISOString(),
                        sessionId: this.sessionId
                    }
                };
                this.ws.send(JSON.stringify(pongMessage));
                this.logger.info('Pong 전송');
            } catch (error) {
                this.logger.error('Pong 전송 실패', error);
            }
        }
    }

    handleClose(event) {
        const connectionDuration = this.connectionStartTime ? 
            Math.floor((Date.now() - this.connectionStartTime) / 1000) : null;
            
        this.logger.debug('연결 종료 상세 정보', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            connectionDuration: connectionDuration ? `${connectionDuration}초` : 'N/A',
            currentAttempts: this.reconnectAttempts,
            hasConnectionPromise: !!this.connectionPromise,
            readyState: this.ws?.readyState
        });

        // 정상 종료가 아닌 경우에만 cleanup 실행
        if (event.code !== WS_ERROR_CODE.NORMAL_CLOSURE && event.code !== 1000) {
            this.cleanup();
        }

        this.isConnecting = false;
        this.connectionStartTime = null;
        this.connectionPromise = null;
        
        if (event.code === WS_ERROR_CODE.NORMAL_CLOSURE || event.code === 1000) {
            this.logger.info('정상적인 연결 종료');
            this.onConnectionChange?.(false, null);
            return;
        }
        
        if (event.code === WS_ERROR_CODE.AUTH_FAILED) {
            this.logger.error('인증 실패로 인한 연결 종료');
            this.onConnectionChange?.(false, '인증에 실패했습니다');
            return;
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('최대 재연결 시도 횟수 초과로 인한 종료');
            this.cleanup();
            this.onConnectionChange?.(false, '재연결 시도 횟수를 초과했습니다. 페이지를 새로고침해주세요.');
            return;
        }
        
        if (event.code !== 1001) {
            this.logger.info('비정상 종료로 인한 재연결 시도', { 
                code: event.code,
                nextAttempt: this.reconnectAttempts + 1
            });
            this.attemptReconnect();
            this.onConnectionChange?.(false, '연결이 종료되어 재연결을 시도합니다');
        }
    }

    handleError(error) {
        this.isConnecting = false;
        this.logger.error('연결 오류', error);
        
        if (error?.target?.readyState === WS_STATUS.CLOSED) {
            this.cleanup();
            this.onConnectionChange?.(false, '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
            return;
        }
        
        this.onConnectionChange?.(false, '연결 오류가 발생했습니다');
    }

    handleConnectionError(error) {
        this.isConnecting = false;
        this.logger.error('연결 생성 실패', error);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.cleanup();
            this.onConnectionChange?.(false, '서버 연결에 실패했습니다. 페이지를 새로고침하거나 잠시 후 다시 시도해주세요.');
            return;
        }
        
        this.onConnectionChange?.(false, '연결을 생성할 수 없습니다');
    }

    disconnect() {
        if (this.isClosing) {
            this.logger.debug('이미 종료가 진행 중입니다');
            return;
        }

        this.isClosing = true;
        this.logger.info('연결 종료 시작');

        if (this.ws?.readyState === WS_STATUS.OPEN) {
            try {
                // 서버에 종료 메시지 전송
                const closeMessage = {
                    type: WS_EVENT_TYPE.CLOSE,
                    data: {
                        timestamp: new Date().toISOString(),
                        sessionId: this.sessionId,
                        reason: '클라이언트 요청'
                    }
                };

                // 종료 메시지 전송 후 일정 시간 대기
                const closeTimeout = setTimeout(() => {
                    if (this.ws?.readyState === WS_STATUS.OPEN) {
                        this.ws.close(WS_ERROR_CODE.NORMAL_CLOSURE, '정상 종료');
                    }
                    this.cleanup();
                }, 1000);

                // 종료 응답 대기
                const originalOnMessage = this.ws.onmessage;
                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === WS_EVENT_TYPE.CLOSE) {
                            clearTimeout(closeTimeout);
                            if (this.ws?.readyState === WS_STATUS.OPEN) {
                                this.ws.close(WS_ERROR_CODE.NORMAL_CLOSURE, '정상 종료');
                            }
                            this.cleanup();
                        } else {
                            originalOnMessage?.(event);
                        }
                    } catch (error) {
                        this.logger.error('종료 응답 처리 중 오류', error);
                        originalOnMessage?.(event);
                    }
                };

                this.ws.send(JSON.stringify(closeMessage));
            } catch (error) {
                this.logger.error('연결 종료 중 오류', error);
                this.cleanup();
            }
        } else {
            this.cleanup();
        }
    }

    cleanup() {
        if (!this.ws) {
            return;
        }

        const currentState = this.ws.readyState;
        this.logger.debug('cleanup 시작', {
            readyState: currentState,
            isClosing: this.isClosing
        });

        // 이벤트 핸들러 제거
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        
        // CLOSING 또는 CLOSED 상태가 아닐 때만 close 호출
        if (currentState !== WS_STATUS.CLOSING && currentState !== WS_STATUS.CLOSED) {
            try {
                this.ws.close(WS_ERROR_CODE.NORMAL_CLOSURE, '연결 정리');
            } catch (error) {
                this.logger.debug('WebSocket 정리 중 오류', error);
            }
        }
        
        this.ws = null;

        // 타이머 정리
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // 상태 초기화
        this.isConnecting = false;
        this.isClosing = false;
        this.connectionPromise = null;
        this.messageHandlers.clear();
        
        this.logger.debug('cleanup 완료');
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('최대 재연결 시도 횟수 초과');
            this.cleanup();
            this.onConnectionChange?.(false, '재연결 시도 횟수를 초과했습니다. 페이지를 새로고침해주세요.');
            return;
        }

        if (this.isConnecting || this.connectionPromise) {
            this.logger.info('재연결이 이미 진행 중입니다');
            return;
        }

        this.reconnectAttempts++;
        
        // 지수 백오프 + 무작위 지터 추가
        const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        const jitter = Math.random() * 1000;  // 0-1초 사이의 무작위 지연
        const delay = Math.max(this.MIN_RECONNECT_DELAY, baseDelay + jitter);
        
        this.logger.info('재연결 시도 예약', {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            baseDelay,
            actualDelay: delay,
            nextAttemptTime: new Date(Date.now() + delay).toISOString()
        });
        
        if (this.reconnectAttempts === this.maxReconnectAttempts) {
            this.onConnectionChange?.(false, `마지막 재연결 시도를 진행합니다. (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        }
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        this.reconnectTimeout = setTimeout(() => {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.cleanup();
                this.onConnectionChange?.(false, '재연결에 실패했습니다. 페이지를 새로고침해주세요.');
                return;
            }
            
            this.connect().catch(error => {
                this.logger.error('재연결 시도 실패', error);
            });
        }, delay);
    }

    addMessageHandler(handler) {
        this.messageHandlers.add(handler);
    }

    removeMessageHandler(handler) {
        this.messageHandlers.delete(handler);
    }

    sendMessage(message) {
        if (this.ws?.readyState === WS_STATUS.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                this.logger.info('메시지 전송', { type: message.type });
            } catch (error) {
                this.logger.error('메시지 전송 실패', error);
                throw error;
            }
        } else {
            const error = new Error('WebSocket이 연결되어 있지 않습니다');
            this.logger.error('메시지 전송 실패', error);
            throw error;
        }
    }

    isConnected() {
        return this.ws?.readyState === WS_STATUS.OPEN;
    }
}

export default new WebSocketService(); 