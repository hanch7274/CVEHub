import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuthStorage } from '../utils/storage/tokenStorage';
import { useAuthQuery } from '../api/hooks/useAuthQuery';
import { AxiosError } from 'axios';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';

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

  // 디바운스된 에러 상태 업데이트 함수
  const debouncedSetError = useCallback(
    debounce((newError: ErrorState | null) => {
      setError(newError);
    }, 300),
    []
  );

  // 스로틀된 에러 처리 함수
  const handleError = useCallback(
    throttle((err: AxiosError | Error | any) => {
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
        debouncedSetError({
          type: 'error',
          message: '접근 권한이 없습니다.',
        });
        return;
      }

      // 404 Not Found 에러 처리
      if (status === 404) {
        debouncedSetError({
          type: 'error',
          message: '요청하신 리소스를 찾을 수 없습니다.',
        });
        return;
      }

      // 500 Internal Server Error 처리
      if (status >= 500) {
        debouncedSetError({
          type: 'error',
          message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        });
        return;
      }

      // 기타 오류 처리
      debouncedSetError({
        type: 'error',
        message,
      });
    }, 500, { leading: true, trailing: false }),
    [navigate, logout, debouncedSetError]
  );

  const clearError = useCallback(() => {
    debouncedSetError(null);
  }, [debouncedSetError]);

  // 메모이제이션된 컨텍스트 값
  const contextValue = useMemo<ErrorContextValue>(
    () => ({
      error,
      handleError,
      clearError,
    }),
    [error, handleError, clearError]
  );

  return (
    <ErrorContext.Provider value={contextValue}>
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