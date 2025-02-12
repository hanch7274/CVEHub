import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSnackbar } from 'notistack';
import WebSocketService, { WS_EVENT_TYPE } from '../services/websocket';
import { 
    updateCVEFromWebSocket, 
    addCVEFromWebSocket, 
    deleteCVEFromWebSocket,
    refreshCVEList,
    addCommentToStore
} from '../store/slices/cveSlice';
import { addNotification } from '../store/slices/notificationSlice';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import { selectCVEDetail } from '../store/slices/cveSlice';
import { snakeToCamel } from '../utils/caseConverter';

// WebSocket 서비스 인스턴스 생성
const webSocketInstance = new WebSocketService();

export const WebSocketContext = createContext({
    isConnected: false,
    lastMessage: null,
    sendMessage: () => {},
});

// useWebSocketMessage 훅 수정
export const useWebSocketMessage = (messageHandler) => {
    // 메시지 핸들러를 useCallback으로 감싸서 안정화
    const stableMessageHandler = useCallback((message) => {
        if (typeof messageHandler === 'function') {
            messageHandler(message);
        }
    }, [messageHandler]);  // messageHandler를 의존성 배열에 추가

    // 메시지 핸들러 등록 - 디버그 로그 제거
    useEffect(() => {
        if (webSocketInstance) {
            webSocketInstance.addHandler('message', stableMessageHandler);
            return () => {
                webSocketInstance.removeHandler('message', stableMessageHandler);
            };
        }
    }, [stableMessageHandler]);  // stableMessageHandler만 의존성으로 사용

    // sendCustomMessage 함수를 useCallback으로 감싸서 안정화
    const sendCustomMessage = useCallback(async (type, data) => {
        if (webSocketInstance) {
            await webSocketInstance.send(type, data);
        }
    }, []);

    return { sendCustomMessage };
};

export const WebSocketProvider = ({ children }) => {
    const { isAuthenticated } = useSelector(state => state.auth);
    const currentCVE = useSelector(selectCVEDetail);  // null을 반환할 수 있음
    const dispatch = useDispatch();
    const { enqueueSnackbar } = useSnackbar();
    
    // WebSocket 상태 관리
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);

    // 구독 중인 CVE 목록 관리
    const [subscribedCVEs, setSubscribedCVEs] = useState(new Set());

    // 연결 상태 변경 핸들러를 useCallback으로 분리
    const handleConnectionChange = useCallback((connected, connectionError) => {
        console.log('[WebSocket] Connection state changed:', { 
            connected, 
            connectionError,
            isAuthenticated 
        });
        
        setIsConnected(connected);
        setIsReady(connected);
        setError(connectionError);

        if (connectionError && !connectionError.message?.includes('401')) {
            enqueueSnackbar(connectionError.message || '연결 오류가 발생했습니다.', {
                variant: 'error',
                anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
            });
        }
    }, [enqueueSnackbar, isAuthenticated]);

    // 인증 상태에 따른 연결 관리
    useEffect(() => {
        console.log('[WebSocket] Auth state changed:', { 
            isAuthenticated,
            isConnected,
            isReady 
        });

        if (isAuthenticated) {
            webSocketInstance.connect();
        } else {
            webSocketInstance.disconnect();
            setIsConnected(false);
            setIsReady(false);
        }
    }, [isAuthenticated]);

    // 메시지 핸들러
    const handleMessage = useCallback((message) => {
        if (!['ping', 'pong'].includes(message.type)) {
            console.log('[WebSocketContext] Received message:', message);
        }
        
        const type = message.type;
        const data = message.data;

        switch (type) {
            case 'subscribe_cve':
                setSubscribedCVEs(prev => {
                    const newSet = new Set(prev);
                    newSet.add(data.cveId);
                    return newSet;
                });
                break;

            case 'unsubscribe_cve':
                setSubscribedCVEs(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(data.cveId);
                    return newSet;
                });
                break;

            case WS_EVENT_TYPE.CVE_UPDATED:
                if (data.cve) {
                    dispatch(updateCVEFromWebSocket(data.cve));
                    
                    // 디버깅 로그 추가
                    console.log('[WebSocketContext] CVE Update Check:', {
                        updatedCveId: data.cve.cve_id,
                        currentCveId: currentCVE?.cveId,
                        isMatch: data.cve.cve_id === currentCVE?.cveId,
                        currentCVE
                    });
                    
                    // 현재 보고 있는 CVE가 업데이트된 경우에만 알림
                    if (data.cve.cve_id === currentCVE?.cveId) {
                        console.log('[WebSocketContext] Showing notification for CVE update');
                        enqueueSnackbar('CVE 세부 정보가 변경되었습니다. 새로고침 해주세요.', {
                            variant: 'info',
                            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
                        });
                    }
                }
                break;

            case WS_EVENT_TYPE.CVE_CREATED:
                dispatch(addCVEFromWebSocket(data.cve));
                dispatch(refreshCVEList());
                break;

            case WS_EVENT_TYPE.CVE_DELETED:
                dispatch(deleteCVEFromWebSocket(data.cveId));
                dispatch(refreshCVEList());
                break;

            case WS_EVENT_TYPE.COMMENT_ADDED:
                if (data.comment) {
                    // 댓글 추가 시에는 전체 CVE를 업데이트하지 않고
                    // 해당 댓글만 추가하는 액션 디스패치
                    dispatch(addCommentToStore({
                        cveId: data.cveId,
                        comment: data.comment
                    }));
                    
                    // 현재 보고 있는 CVE의 댓글이 업데이트된 경우에만 알림
                    if (data.cveId === currentCVE?.cveId) {
                        enqueueSnackbar('새로운 댓글이 추가되었습니다.', {
                            variant: 'info'
                        });
                    }
                }
                break;

            default:
                break;
        }
    }, [dispatch, enqueueSnackbar, currentCVE]);

    // 메시지 핸들러 등록
    useEffect(() => {
        console.log('[WebSocketContext] Setting up message handlers');
        
        if (webSocketInstance) {
            console.log('[WebSocketContext] Adding message and connection handlers');
            webSocketInstance.addHandler('message', handleMessage);
            webSocketInstance.addHandler('connection', handleConnectionChange);

            return () => {
                console.log('[WebSocketContext] Removing message and connection handlers');
                webSocketInstance.removeHandler('message', handleMessage);
                webSocketInstance.removeHandler('connection', handleConnectionChange);
            };
        }
    }, [handleMessage, handleConnectionChange]);

    // Context 값 메모이제이션
    const value = useMemo(() => ({
        isConnected,
        isReady,
        error,
        currentCVE,  // currentCVE를 context value에 추가
        sendMessage: webSocketInstance.send.bind(webSocketInstance)
    }), [isConnected, isReady, error, currentCVE]);

    // 로딩 상태일 때 표시할 컴포넌트
    const loadingComponent = (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            minHeight="100vh"
        >
            <CircularProgress />
            <Typography variant="body1" sx={{ mt: 2 }}>
                {error ? "연결 실패. 페이지를 새로고침해주세요." : "연결 중..."}
            </Typography>
            {error && (
                <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                    {error.message}
                </Typography>
            )}
        </Box>
    );

    return (
        <WebSocketContext.Provider value={value}>
            {isAuthenticated && !isReady ? loadingComponent : children}
        </WebSocketContext.Provider>
    );
};

// 커스텀 훅
export const useWebSocketContext = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocketContext must be used within a WebSocketProvider');
    }
    return context;
};
