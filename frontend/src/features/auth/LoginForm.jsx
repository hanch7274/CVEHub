import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocketIO } from '../../contexts/SocketIOContext';
import logger from '../../services/socketio/loggingService';

const LoginForm = ({ username, password, setUsername, setPassword }) => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const socketIO = useSocketIO();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        
        setIsSubmitting(true);
        try {
            await login({ username, password });
            logger.info('[Auth]', '로그인 성공');
            
            // 로그인 성공 후 WebSocket 연결이 완료될 때까지 대기
            const checkConnection = () => {
                if (socketIO.connected) {
                    navigate('/cves');
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            checkConnection();
        } catch (error) {
            logger.error('[Auth]', '로그인 실패:', error);
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            {/* 폼 부분을 여기에 추가 */}
        </div>
    );
};

export default LoginForm;