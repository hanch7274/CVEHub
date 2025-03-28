/**
 * React Query에서 사용할 query key 상수
 * 모든 query key를 한 곳에서 관리하여 일관성 유지
 */

// 필터 타입 정의
export interface CVEFilters {
  page?: number;
  limit?: number;
  status?: string;
  severity?: string;
  search?: string;
  assigned_to?: string;
  [key: string]: any;
}

// 쿼리 키 타입 정의
export type QueryKeyType = string | readonly unknown[];

// CVE 관련 쿼리 키 타입
interface CVEQueryKeys {
  all: readonly string[];
  lists: () => readonly unknown[];
  list: (filters?: CVEFilters) => readonly unknown[];
  details: () => readonly unknown[];
  detail: (id: string) => readonly unknown[];
  totalCount: () => readonly unknown[];
  stats: () => readonly unknown[];
}

// 사용자 관련 쿼리 키 타입
interface UsersQueryKeys {
  all: readonly string[];
  search: readonly string[];
  searchByQuery: (query: string) => readonly unknown[];
}

// 전체 쿼리 키 타입
interface QueryKeys {
  CVE_LIST: string;
  CVE_DETAIL: string;
  CVE: CVEQueryKeys;
  USER: string;
  USER_PROFILE: string;
  USERS: UsersQueryKeys;
  SETTINGS: string;
  NOTIFICATION: string;
}

export const QUERY_KEYS: QueryKeys = {
  // CVE 관련 query keys
  CVE_LIST: 'cve-list',
  CVE_DETAIL: 'cve-detail',
  
  // CVE 관련 함수형 쿼리 키 구조 (useCVEQuery.ts와 일치)
  CVE: {
    all: ['cves'] as const,
    lists: () => [...QUERY_KEYS.CVE.all, 'list'] as const,
    list: (filters?: CVEFilters) => [...QUERY_KEYS.CVE.lists(), filters] as const,
    details: () => [...QUERY_KEYS.CVE.all, 'detail'] as const,
    detail: (id: string) => [...QUERY_KEYS.CVE.details(), id] as const,
    totalCount: () => [...QUERY_KEYS.CVE.all, 'totalCount'] as const,
    stats: () => [...QUERY_KEYS.CVE.all, 'stats'] as const,
  },
  
  // 사용자 관련 query keys
  USER: 'user',
  USER_PROFILE: 'user-profile',
  
  // 사용자 검색 관련 query keys
  USERS: {
    all: ['users'] as const,
    search: ['users', 'search'] as const,
    searchByQuery: (query: string) => ['users', 'search', query] as const,
  },
  
  // 설정 관련 query keys
  SETTINGS: 'settings',
  
  // 기타 query keys
  NOTIFICATION: 'notification',
};

export default QUERY_KEYS;