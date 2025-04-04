import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'shared/api/config/axios';
import { userService } from '../services/userService';
import { getCurrentUser } from '../services/authService';
import { getAccessToken } from 'shared/utils/storage/tokenStorage';
import { User, UserUpdate } from '../types/index';

/**
 * 사용자 목록 조회 응답 타입
 */
export interface UserListResponse {
  items: User[];
  total: number;
}

/**
 * 현재 사용자 정보 조회 훅
 * 
 * @returns 현재 사용자 정보 쿼리 결과
 */
export const useCurrentUser = () => {
  // 액세스 토큰이 있는지 확인
  const hasToken = Boolean(getAccessToken());
  
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000, // 5분
    retry: 1,
    // 토큰이 있을 때만 쿼리 실행
    enabled: hasToken
  });
};

/**
 * 전체 사용자 목록을 조회하는 훅
 * 
 * @returns 사용자 목록 쿼리 결과
 */
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/auth/');
        return data;
      } catch (error) {
        console.error('사용자 목록 조회 중 오류 발생:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5분
    retry: 1
  });
};

/**
 * 사용자 검색을 위한 훅
 * 
 * @param query 검색어
 * @returns 검색 결과 쿼리
 */
export const useSearchUsers = (query: string) => {
  return useQuery({
    queryKey: ['users', 'search', query],
    queryFn: async () => {
      try {
        if (!query || query.length < 2) {
          return { items: [] };
        }
        
        const { data } = await axios.get(`/auth/search`, {
          params: { query }
        });
        return data;
      } catch (error) {
        console.error('사용자 검색 중 오류 발생:', error);
        throw error;
      }
    },
    enabled: !!query && query.length >= 2,
    staleTime: 60 * 1000, // 1분
    retry: 1
  });
};

/**
 * 사용자 정보 업데이트 훅
 * 
 * @returns 사용자 정보 업데이트 뮤테이션
 */
export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userData: UserUpdate) => userService.updateCurrentUser(userData),
    onSuccess: (updatedUser) => {
      // 사용자 정보 캐시 업데이트
      queryClient.setQueryData(['auth', 'user'], updatedUser);
      // 사용자 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
};

/**
 * 사용자 계정 삭제 훅
 * 
 * @returns 사용자 계정 삭제 뮤테이션
 */
export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => userService.deleteCurrentUser(),
    onSuccess: () => {
      // 사용자 정보 캐시 초기화
      queryClient.setQueryData(['auth', 'user'], null);
      // 사용자 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
};

export default useUsers;
