import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  login as authLogin, 
  logout as authLogout, 
  getCurrentUser, 
  refreshToken as refreshAuthToken
} from '../../services/authService';
import { 
  getAccessToken, 
  setAccessToken, 
  setRefreshToken, 
  clearAuthStorage, 
  setUser as setStoredUser 
} from '../../utils/storage/tokenStorage';
import logger from '../../utils/logging';
import { 
  User, 
  LoginRequest, 
  LoginResponse, 
  RefreshTokenResponse 
} from '../../types/auth';

/**
 * 인증 관련 React Query 훅
 */
export const useAuthQuery = () => {
  const queryClient = useQueryClient();

  // 현재 사용자 정보 조회 쿼리
  const userQuery = useQuery<User | null, Error>({
    queryKey: ['auth', 'user'],
    queryFn: getCurrentUser,
    enabled: !!getAccessToken(),
    staleTime: 5 * 60 * 1000, // 5분
    retry: 1
  });

  // 로그인 뮤테이션
  const loginMutation = useMutation<LoginResponse, Error, LoginRequest>({
    mutationFn: (credentials) => authLogin(credentials),
    onSuccess: (data) => {
      logger.info('AuthQuery', '로그인 성공', data);
      
      // 토큰 저장
      if (data.tokens?.accessToken) setAccessToken(data.tokens.accessToken);
      if (data.tokens?.refreshToken) setRefreshToken(data.tokens.refreshToken);
      
      // 사용자 정보 저장
      if (data.user) setStoredUser(data.user);
      
      // 사용자 정보 쿼리 갱신
      queryClient.setQueryData(['auth', 'user'], data.user);
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    }
  });

  // 로그아웃 뮤테이션
  const logoutMutation = useMutation<void, Error>({
    mutationFn: authLogout,
    onSuccess: () => {
      logger.info('AuthQuery', '로그아웃 성공', null);
      
      // 인증 정보 초기화
      clearAuthStorage();
      
      // 쿼리 캐시 초기화
      queryClient.setQueryData(['auth', 'user'], null);
      queryClient.invalidateQueries();
    }
  });

  // 토큰 갱신 뮤테이션
  const refreshTokenMutation = useMutation<RefreshTokenResponse, Error, void>({
    mutationFn: refreshAuthToken,
    onSuccess: (data) => {
      logger.info('AuthQuery', '토큰 갱신 성공', data);
      
      // 토큰 저장
      if (data.accessToken) setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
    }
  });

  // 인증 상태 확인
  const isAuthenticated = !!getAccessToken() && !!userQuery.data;
  
  // 로딩 상태 확인
  const isLoading = 
    userQuery.isLoading || 
    loginMutation.isPending || 
    logoutMutation.isPending || 
    refreshTokenMutation.isPending;

  return {
    user: userQuery.data,
    isAuthenticated,
    isLoading,
    error: userQuery.error || loginMutation.error || logoutMutation.error,
    login: loginMutation.mutate,
    loginAsync: loginMutation.mutateAsync,
    logout: logoutMutation.mutate,
    logoutAsync: logoutMutation.mutateAsync,
    refreshToken: refreshTokenMutation.mutate,
    refreshTokenAsync: refreshTokenMutation.mutateAsync,
    refetchUser: () => queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
  } as const;
};