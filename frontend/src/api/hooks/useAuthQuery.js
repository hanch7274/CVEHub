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

/**
 * 인증 관련 React Query 훅
 */
export const useAuthQuery = () => {
  const queryClient = useQueryClient();

  // 현재 사용자 정보 조회 쿼리
  const userQuery = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: getCurrentUser,
    enabled: !!getAccessToken(),
    staleTime: 5 * 60 * 1000, // 5분
    retry: 1,
    onError: (error) => {
      logger.error('AuthQuery', '사용자 정보 조회 실패:', error);
    }
  });

  // 로그인 뮤테이션
  const loginMutation = useMutation({
    mutationFn: (credentials) => authLogin(credentials),
    onSuccess: (data) => {
      logger.info('AuthQuery', '로그인 성공');
      
      // 토큰 저장
      if (data.accessToken) setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      
      // 사용자 정보 저장
      if (data.user) setStoredUser(data.user);
      
      // 사용자 정보 쿼리 갱신
      queryClient.setQueryData(['auth', 'user'], data.user);
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    },
    onError: (error) => {
      logger.error('AuthQuery', '로그인 실패:', error);
    }
  });

  // 로그아웃 뮤테이션
  const logoutMutation = useMutation({
    mutationFn: authLogout,
    onSuccess: () => {
      logger.info('AuthQuery', '로그아웃 성공');
      
      // 인증 정보 초기화
      clearAuthStorage();
      
      // 쿼리 캐시 초기화
      queryClient.setQueryData(['auth', 'user'], null);
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      logger.error('AuthQuery', '로그아웃 실패:', error);
      // 실패해도 로컬 스토리지는 초기화
      clearAuthStorage();
      queryClient.setQueryData(['auth', 'user'], null);
    }
  });

  // 토큰 갱신 뮤테이션
  const refreshTokenMutation = useMutation({
    mutationFn: refreshAuthToken,
    onSuccess: (data) => {
      logger.info('AuthQuery', '토큰 갱신 성공');
      
      // 토큰 저장
      if (data.accessToken) setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
    },
    onError: (error) => {
      logger.error('AuthQuery', '토큰 갱신 실패:', error);
      // 갱신 실패 시 로그아웃 처리
      clearAuthStorage();
      queryClient.setQueryData(['auth', 'user'], null);
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
  };
};
