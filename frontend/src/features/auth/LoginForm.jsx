import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login } from '../../features/auth/authSlice';
import { WebSocketService } from '../../services/websocket';

const LoginForm = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const response = await dispatch(login({ username, password })).unwrap();
            console.log('[Auth] Login successful:', response);
            
            // 로그인 성공 후 WebSocket 연결이 완료될 때까지 대기
            const checkConnection = () => {
                if (WebSocketService.checkConnection()) {
                    navigate('/cves');
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            checkConnection();
        } catch (error) {
            // ... 에러 처리 ...
        }
    };

    return (
        <div>
            {/* 폼 부분을 여기에 추가 */}
        </div>
    );
};

export default LoginForm; 