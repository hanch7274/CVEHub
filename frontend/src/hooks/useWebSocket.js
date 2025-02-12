import { useEffect, useCallback } from 'react';
import WebSocketService from '../services/websocket';

export function useWebSocket(onMessage, onConnectionChange) {
    const handleMessage = useCallback((message) => {
        if (onMessage) {
            onMessage(message);
        }
    }, [onMessage]);

    const handleConnection = useCallback((isConnected, error) => {
        if (onConnectionChange) {
            onConnectionChange(isConnected, error);
        }
    }, [onConnectionChange]);

    useEffect(() => {
        WebSocketService.addMessageHandler(handleMessage);
        WebSocketService.addConnectionHandler(handleConnection);
        WebSocketService.connect();

        return () => {
            WebSocketService.removeMessageHandler(handleMessage);
            WebSocketService.removeConnectionHandler(handleConnection);
        };
    }, [handleMessage, handleConnection]);

    return {
        sendMessage: WebSocketService.send.bind(WebSocketService),
        isConnected: WebSocketService.isConnected()
    };
}
