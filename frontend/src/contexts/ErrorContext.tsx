import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuthStorage } from '../utils/storage/tokenStorage';
import { useAuthQuery } from '../api/hooks/useAuthQuery';
import { AxiosError } from 'axios';

// 응답 데이터 타입 정의
interface ErrorResponseData {
  message?: string;
  [key: string]: any;
}

interface ErrorState {
  type: 'error';
  message: string;
}

interface ErrorContextValue {
  error: ErrorState | null;
  handleError: (error: AxiosError | Error | any) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [error, setError] = useState<ErrorState | null>(null);
  const navigate = useNavigate();
  const { logout } = useAuthQuery();

  const handleError = useCallback((err: AxiosError | Error | any) => {
    const error = err as AxiosError<ErrorResponseData>; // 타입 assertion 수정
    const status = error?.response?.status;
    const message = error?.response?.data?.message || error?.message || '알 수 없는 오류가 발생했습니다.';

    // 401 Unauthorized 에러 처리
    if (status === 401) {
      // 토큰 만료 또는 인증 실패
      clearAuthStorage();
      logout();
      navigate('/login', {
        state: {
          from: window.location.pathname,
          message: '세션이 만료되었습니다. 다시 로그인해주세요.',
        },
      });
      return;
    }

    // 403 Forbidden 에러 처리
    if (status === 403) {
      setError({
        type: 'error',
        message: '접근 권한이 없습니다.',
      });
      return;
    }

    // 404 Not Found 에러 처리
    if (status === 404) {
      setError({
        type: 'error',
        message: '요청하신 리소스를 찾을 수 없습니다.',
      });
      return;
    }

    // 500 Internal Server Error 처리
    if (status >= 500) {
      setError({
        type: 'error',
        message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      });
      return;
    }

    // 기타 오류 처리
    setError({
      type: 'error',
      message,
    });
  }, [navigate, logout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []); // 빈 의존성 배열 추가

  return (
    <ErrorContext.Provider value={{ error, handleError, clearError }}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

export default ErrorContext;