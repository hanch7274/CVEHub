import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Grid, Paper, TextField, Button, Typography, Box, CircularProgress } from '@mui/material';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { AuthContextType, LoginRequest } from 'features/auth/types';
import { useSocket } from 'core/socket/hooks/useSocket';
import logger from 'shared/utils/logging';


interface LoginFormProps {
  username: string;
  password: string;
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ 
  username, 
  password, 
  setUsername, 
  setPassword 
}) => {
  const navigate = useNavigate();
  const auth: AuthContextType = useAuth();
  const socket = useSocket();
  const { connected } = socket;
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const loginRequest: LoginRequest = {
        username,
        password
      };
      
      await auth.loginAsync(loginRequest);
      logger.info('Auth', '로그인 성공', { username });
      
      // 소켓 연결 상태 확인 - RxJS 기반 소켓은 자동으로 연결됨
      if (!connected) {
        logger.info('Auth', '소켓 연결 대기 중', {});
        // 소켓 연결은 자동으로 이루어지므로 별도 연결 요청 불필요
      }
      
      // 로그인 성공 후 대시보드로 이동
      navigate('/dashboard');
    } catch (error) {
      logger.error('Auth', '로그인 실패', error);
      // 오류 처리는 상위 컴포넌트에서 수행
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <button 
          type="submit" 
          className="btn btn-primary btn-block" 
          disabled={isSubmitting}
        >
          {isSubmitting ? '로그인 중...' : '로그인'}
        </button>
      </div>
    </form>
  );
};

export default LoginForm;