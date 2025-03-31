import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import debounce from 'lodash/debounce';
import { useCallback, useEffect, useRef } from 'react';
import { LoginRequest, LoginResponse, RefreshTokenResponse, User } from '../types';
import { refreshToken, login, logout, getCurrentUser } from 'features/auth/services/authService';
import {getAccessToken, setUser, setAccessToken, setRefreshToken, clearAuthStorage } from 'shared/utils/storage/tokenStorage';
import logger from 'shared/utils/logging';

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
    mutationFn: (credentials) => login(credentials),
    onSuccess: (data) => {
      logger.info('AuthQuery', '로그인 성공', data);
      
      // 토큰 저장
      if (data.tokens?.accessToken) setAccessToken(data.tokens.accessToken);
      if (data.tokens?.refreshToken) setRefreshToken(data.tokens.refreshToken);
      
      // 사용자 정보 저장
      if (data.user) setUser(data.user);
      
      // 사용자 정보 쿼리 갱신
      queryClient.setQueryData(['auth', 'user'], data.user);
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    }
  });

  // 로그아웃 뮤테이션
  const logoutMutation = useMutation<void, Error>({
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
  const refreshTokenMutation = useMutation<RefreshTokenResponse, Error, void>({
    mutationFn: refreshToken,
    onSuccess: (data) => {
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
        onSuccess: (data) => {
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
  
  // 디바운스된 사용자 정보 다시 가져오기 (200ms)
  const debouncedRefetchUser = useCallback(
    debounce(() => {
      logger.info('AuthQuery', '디바운스된 사용자 정보 갱신 요청 실행');
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    }, 200),
    [queryClient]
  );
  
  // 컴포넌트 언마운트 시 디바운스 함수 취소
  useEffect(() => {
    return () => {
      // @ts-ignore - TypeScript에서 cancel 메서드를 인식하지 못할 수 있음
      debouncedRefreshToken.cancel && debouncedRefreshToken.cancel();
      debouncedRefetchUser.cancel && debouncedRefetchUser.cancel();
    };
  }, [debouncedRefreshToken, debouncedRefetchUser]);

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
    refetchUser: debouncedRefetchUser,
    isRefreshingToken: isRefreshingRef.current
  } as const;
};