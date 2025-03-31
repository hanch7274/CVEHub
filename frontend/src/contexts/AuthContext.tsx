import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import { getAccessToken, getRefreshToken } from '../utils/storage/tokenStorage';
import logger from '../utils/logging';
import socketIOWithStore from '../services/socketio/socketioWithStore';
import { useAuthQuery } from '../api/hooks/useAuthQuery';
import { TOKEN_REFRESH_THRESHOLD } from '../config';
import { User, LoginRequest, LoginResponse, RefreshTokenResponse, AuthContextType } from '../types/auth';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import isEqual from 'lodash/isEqual';
import memoize from 'lodash/memoize';

// Provider Props 인터페이스
interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    error, 
    login, 
    loginAsync, 
    logout, 
    logoutAsync, 
    refreshToken: refreshTokenMutation, 
    refreshTokenAsync: refreshTokenAsyncMutation 
  } = useAuthQuery();
  
  // 로컬 상태 추가
  const [loading, setLoading] = useState<boolean>(true);
  const [accessToken, setAccessToken] = useState<string | null>(getAccessToken());
  const initRef = useRef<boolean>(false);
  const prevUserRef = useRef<User | null>(null);

  // JWT 토큰 디코딩 함수 메모이제이션
  const decodeToken = useMemo(() => memoize((token: string) => {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      logger.error('AuthContext', '토큰 디코딩 실패', e);
      return null;
    }
  }), []);

  // 초기 인증 상태 확인
  useEffect(() => {
    const checkInitialAuth = async (): Promise<void> => {
      try {
        const hasAccessToken = !!getAccessToken()?.trim();
        const hasRefreshToken = !!getRefreshToken()?.trim();
        
        logger.info('AuthContext', '초기 인증 상태 확인', { 
          hasAccessToken, 
          hasRefreshToken,
          isLoading,
          isAuthenticated
        });
        
        // 토큰이 없으면 로딩 상태 즉시 해제
        if (!hasAccessToken) {
          setLoading(false);
          return;
        }
        
        // 토큰이 있으면 사용자 정보 로딩 상태 유지
        // useAuthQuery의 쿼리가 완료되면 isLoading이 false가 됨
        if (!isLoading) {
          setLoading(false);
        }
      } catch (error) {
        logger.error('AuthContext', '초기 인증 상태 확인 중 오류', error);
        setLoading(false);
      }
    };
    
    checkInitialAuth();
  }, [isLoading, isAuthenticated]);

  // 디바운스된 토큰 상태 업데이트 함수
  const debouncedSetAccessToken = useCallback(
    debounce((newToken: string | null) => {
      setAccessToken(newToken);
    }, 300),
    []
  );

  // 토큰 상태 정기 확인 (1초마다)
  useEffect(() => {
    if (initRef.current) return;
    
    logger.info('AuthContext', '초기화됨', {});
    initRef.current = true;
    
    // 정기적으로 토큰 상태 확인
    const tokenCheckInterval = setInterval(() => {
      const currentAccessToken = getAccessToken();
      if (currentAccessToken !== accessToken) {
        logger.info('AuthContext', '토큰 상태 변경 감지', {});
        debouncedSetAccessToken(currentAccessToken);
      }
    }, 1000);
    
    return () => {
      clearInterval(tokenCheckInterval);
    };
  }, [accessToken, debouncedSetAccessToken]);

  // 스로틀된 토큰 갱신 함수
  const throttledRefreshToken = useCallback(
    throttle(async () => {
      try {
        logger.info('AuthContext', '토큰 갱신 시도 (스로틀)', {});
        await refreshTokenAsyncMutation();
      } catch (error) {
        logger.error('AuthContext', '토큰 갱신 중 오류 발생', error);
      }
    }, 10000, { leading: true, trailing: false }),
    [refreshTokenAsyncMutation]
  );

  // 토큰 자동 갱신 설정
  useEffect(() => {
    if (!isAuthenticated) return;
    
    logger.info('AuthContext', '토큰 자동 갱신 설정', {});
    
    // 토큰 만료 시간 확인 및 갱신 함수
    const checkTokenExpiration = async (): Promise<void> => {
      try {
        const token = getAccessToken();
        if (!token) return;
        
        // JWT 토큰에서 만료 시간 추출 (메모이제이션 활용)
        const tokenData = decodeToken(token);
        if (!tokenData) return;
        
        const expirationTime = tokenData.exp * 1000; // 초 -> 밀리초
        const currentTime = Date.now();
        const timeUntilExpiration = expirationTime - currentTime;
        
        // 만료 임계값(5분) 이내면 토큰 갱신
        if (timeUntilExpiration < TOKEN_REFRESH_THRESHOLD) {
          logger.info('AuthContext', '토큰 만료 임박, 갱신 시도', {
            expiresIn: Math.floor(timeUntilExpiration / 1000)
          });
          throttledRefreshToken();
        }
      } catch (error) {
        logger.error('AuthContext', '토큰 갱신 중 오류 발생', error);
      }
    };
    
    // 초기 실행 및 주기적 실행 설정 (1분마다)
    checkTokenExpiration();
    const refreshInterval = setInterval(checkTokenExpiration, 60 * 1000);
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [isAuthenticated, throttledRefreshToken, decodeToken]);

  // Socket.IO 연결 관리 (사용자 변경 시에만 재연결)
  useEffect(() => {
    // isEqual을 사용하여 깊은 비교 수행
    if (!isEqual(prevUserRef.current, user)) {
      prevUserRef.current = user;
      
      if (isAuthenticated && user) {
        logger.info('AuthContext', 'Socket.IO 연결 요청', {});
        // 직접 연결하지 않고 SocketIOContext에 인증 상태 변경을 알림
        if (socketIOWithStore && socketIOWithStore.handleAuthStateChange) {
          socketIOWithStore.handleAuthStateChange(true);
        }
      } else {
        logger.info('AuthContext', 'Socket.IO 연결 해제 요청', {});
        // 직접 연결 해제하지 않고 SocketIOContext에 인증 상태 변경을 알림
        if (socketIOWithStore && socketIOWithStore.handleAuthStateChange) {
          socketIOWithStore.handleAuthStateChange(false);
        }
      }
    }
    
    return () => {
      // 컴포넌트 언마운트 시 연결 해제 요청
      if (socketIOWithStore && socketIOWithStore.handleAuthStateChange) {
        socketIOWithStore.handleAuthStateChange(false);
      }
    };
  }, [isAuthenticated, user]);

  // 로그인 핸들러 (useCallback으로 메모이제이션)
  const handleLogin = useCallback(async (credentials: LoginRequest): Promise<LoginResponse> => {
    setLoading(true);
    try {
      const result = await loginAsync(credentials);
      logger.info('AuthContext', '로그인 성공', {});
      return result;
    } catch (error) {
      logger.error('AuthContext', '로그인 실패', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loginAsync]);

  // 로그아웃 핸들러 (useCallback으로 메모이제이션)
  const handleLogout = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await logoutAsync();
      logger.info('AuthContext', '로그아웃 성공', {});
    } catch (error) {
      logger.error('AuthContext', '로그아웃 실패', error);
    } finally {
      setLoading(false);
    }
  }, [logoutAsync]);

  // refreshToken 래퍼 함수 (useCallback으로 메모이제이션)
  const handleRefreshToken = useCallback(async (refreshToken?: string): Promise<void> => {
    try {
      // refreshTokenMutation은 매개변수를 사용하지 않지만, 인터페이스 일관성을 위해 래퍼 함수 제공
      await refreshTokenMutation();
    } catch (error) {
      logger.error('AuthContext', '토큰 갱신 실패', error);
      throw error;
    }
  }, [refreshTokenMutation]);

  // refreshTokenAsync 래퍼 함수 (useCallback으로 메모이제이션)
  const handleRefreshTokenAsync = useCallback(async (refreshToken?: string): Promise<void> => {
    try {
      // refreshTokenAsyncMutation은 매개변수를 사용하지 않지만, 인터페이스 일관성을 위해 래퍼 함수 제공
      await refreshTokenAsyncMutation();
    } catch (error) {
      logger.error('AuthContext', '토큰 갱신 실패', error);
      throw error;
    }
  }, [refreshTokenAsyncMutation]);

  // Context 값 (useMemo로 메모이제이션)
  const value = useMemo<AuthContextType>(() => ({
    user: user || null,
    isAuthenticated,
    loading: loading || isLoading,
    error,
    login: handleLogin,
    logout: handleLogout,
    accessToken: getAccessToken(),
    loginAsync,
    logoutAsync,
    refreshToken: handleRefreshToken,
    refreshTokenAsync: handleRefreshTokenAsync
  }), [
    user, 
    isAuthenticated, 
    loading, 
    isLoading, 
    error, 
    handleLogin, 
    handleLogout, 
    loginAsync, 
    logoutAsync, 
    handleRefreshToken, 
    handleRefreshTokenAsync
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
