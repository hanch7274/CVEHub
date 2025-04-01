import { useMutation, useQueryClient } from '@tanstack/react-query';

import debounce from 'lodash/debounce';
import { useCallback, useEffect, useRef } from 'react';
import { LoginRequest, LoginResponse, RefreshTokenResponse } from '../types';
import { refreshToken, login, logout } from 'features/auth/services/authService';
import { getAccessToken, setAccessToken, setRefreshToken, clearAuthStorage } from 'shared/utils/storage/tokenStorage';
import logger from 'shared/utils/logging';
import { useCurrentUser } from './useUsersQuery';

/**
 * 인증 관련 React Query 훅
 */
export const useAuthQuery = () => {
  const queryClient = useQueryClient();
  
  // 현재 사용자 정보 조회 쿼리 (useUsersQuery에서 가져옴)
  const userQuery = useCurrentUser();

  // 로그인 뮤테이션
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginRequest) => login(credentials),
    onSuccess: (data: LoginResponse) => {
      logger.info('AuthQuery', '로그인 성공', data);
      
      // 토큰 저장
      if (data.tokens?.accessToken) setAccessToken(data.tokens.accessToken);
      if (data.tokens?.refreshToken) setRefreshToken(data.tokens.refreshToken);
    }
  });

  // 로그아웃 뮤테이션
  const logoutMutation = useMutation({
    mutationFn: logout,
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
  const refreshTokenMutation = useMutation({
    mutationFn: refreshToken,
    onSuccess: (data: RefreshTokenResponse) => {
      logger.info('AuthQuery', '토큰 갱신 성공', data);
      
      // 토큰 저장
      if (data.accessToken) setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
    }
  });

  // 토큰 갱신 요청 중인지 추적하는 플래그
  const isRefreshingRef = useRef(false);

  // 디바운스된 토큰 갱신 함수 (300ms)
  const debouncedRefreshToken = useCallback(
    debounce((callback?: () => void) => {
      // 이미 갱신 중이면 중복 요청 방지
      if (isRefreshingRef.current) {
        logger.info('AuthQuery', '토큰 갱신 이미 진행 중, 요청 무시');
        return;
      }

      isRefreshingRef.current = true;
      logger.info('AuthQuery', '디바운스된 토큰 갱신 요청 실행');
      
      refreshTokenMutation.mutate(undefined, {
        onSuccess: () => {
          isRefreshingRef.current = false;
          if (callback) callback();
        },
        onError: () => {
          isRefreshingRef.current = false;
        }
      });
    }, 300),
    [refreshTokenMutation]
  );
  
  // 컴포넌트 언마운트 시 디바운스 함수 취소
  useEffect(() => {
    return () => {
      // @ts-ignore - TypeScript에서 cancel 메서드를 인식하지 못할 수 있음
      debouncedRefreshToken.cancel && debouncedRefreshToken.cancel();
    };
  }, [debouncedRefreshToken]);

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
    refreshToken: debouncedRefreshToken,
    refreshTokenAsync: refreshTokenMutation.mutateAsync, // 비동기 버전은 그대로 유지
    isRefreshingToken: isRefreshingRef.current
  } as const;
};