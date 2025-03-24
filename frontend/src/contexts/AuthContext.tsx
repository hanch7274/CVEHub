import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { getAccessToken, getRefreshToken } from '../utils/storage/tokenStorage';
import logger from '../utils/logging';
import socketIOService from '../services/socketio/socketio';
import { useAuthQuery } from '../api/hooks/useAuthQuery';
import { TOKEN_REFRESH_THRESHOLD } from '../config';
import { User, LoginRequest, LoginResponse, RefreshTokenResponse, AuthContextType } from '../types/auth';

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
        setAccessToken(currentAccessToken);
      }
    }, 1000);
    
    return () => {
      clearInterval(tokenCheckInterval);
    };
  }, [accessToken]);

  // 토큰 자동 갱신 설정
  useEffect(() => {
    if (!isAuthenticated) return;
    
    logger.info('AuthContext', '토큰 자동 갱신 설정', {});
    
    // 토큰 만료 시간 확인 및 갱신 함수
    const checkTokenExpiration = async (): Promise<void> => {
      try {
        const token = getAccessToken();
        if (!token) return;
        
        // JWT 토큰에서 만료 시간 추출
        const tokenData = JSON.parse(atob(token.split('.')[1]));
        const expirationTime = tokenData.exp * 1000; // 초 -> 밀리초
        const currentTime = Date.now();
        const timeUntilExpiration = expirationTime - currentTime;
        
        // 만료 임계값(5분) 이내면 토큰 갱신
        if (timeUntilExpiration < TOKEN_REFRESH_THRESHOLD) {
          logger.info('AuthContext', '토큰 만료 임박, 갱신 시도', {
            expiresIn: Math.floor(timeUntilExpiration / 1000)
          });
          await refreshTokenAsyncMutation();
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
  }, [isAuthenticated, refreshTokenAsyncMutation]);

  // Socket.IO 연결 관리
  useEffect(() => {
    if (isAuthenticated && user) {
      logger.info('AuthContext', 'Socket.IO 연결 요청', {});
      // 직접 연결하지 않고 SocketIOContext에 인증 상태 변경을 알림
      if (socketIOService && socketIOService.handleAuthStateChange) {
        socketIOService.handleAuthStateChange(true);
      }
    } else {
      logger.info('AuthContext', 'Socket.IO 연결 해제 요청', {});
      // 직접 연결 해제하지 않고 SocketIOContext에 인증 상태 변경을 알림
      if (socketIOService && socketIOService.handleAuthStateChange) {
        socketIOService.handleAuthStateChange(false);
      }
    }
    
    return () => {
      // 컴포넌트 언마운트 시 연결 해제 요청
      if (socketIOService && socketIOService.handleAuthStateChange) {
        socketIOService.handleAuthStateChange(false);
      }
    };
  }, [isAuthenticated, user]);

  // 로그인 핸들러
  const handleLogin = async (credentials: LoginRequest): Promise<LoginResponse> => {
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
  };

  // 로그아웃 핸들러
  const handleLogout = async (): Promise<void> => {
    setLoading(true);
    try {
      await logoutAsync();
      logger.info('AuthContext', '로그아웃 성공', {});
    } catch (error) {
      logger.error('AuthContext', '로그아웃 실패', error);
    } finally {
      setLoading(false);
    }
  };

  // refreshToken 래퍼 함수
  const handleRefreshToken = async (refreshToken?: string): Promise<void> => {
    try {
      // refreshTokenMutation은 매개변수를 사용하지 않지만, 인터페이스 일관성을 위해 래퍼 함수 제공
      await refreshTokenMutation();
    } catch (error) {
      logger.error('AuthContext', '토큰 갱신 실패', error);
      throw error;
    }
  };

  // refreshTokenAsync 래퍼 함수
  const handleRefreshTokenAsync = async (refreshToken?: string): Promise<void> => {
    try {
      // refreshTokenAsyncMutation은 매개변수를 사용하지 않지만, 인터페이스 일관성을 위해 래퍼 함수 제공
      await refreshTokenAsyncMutation();
    } catch (error) {
      logger.error('AuthContext', '토큰 갱신 실패', error);
      throw error;
    }
  };

  // Context 값
  const value: AuthContextType = {
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
