/**
 * React Query에서 사용할 query key 상수
 * 모든 query key를 한 곳에서 관리하여 일관성 유지
 */
export const QUERY_KEYS = {
  // CVE 관련 query keys
  CVE_LIST: 'cve-list',
  CVE_DETAIL: 'cve-detail',
  
  // CVE 관련 함수형 쿼리 키 구조 (useCVEQuery.js와 일치)
  CVE: {
    all: ['cves'],
    lists: () => [...QUERY_KEYS.CVE.all, 'list'],
    list: (filters) => [...QUERY_KEYS.CVE.lists(), filters],
    details: () => [...QUERY_KEYS.CVE.all, 'detail'],
    detail: (id) => [...QUERY_KEYS.CVE.details(), id],
    totalCount: () => [...QUERY_KEYS.CVE.all, 'totalCount'],
  },
  
  // 사용자 관련 query keys
  USER: 'user',
  USER_PROFILE: 'user-profile',
  
  // 설정 관련 query keys
  SETTINGS: 'settings',
  
  // 기타 query keys
  NOTIFICATION: 'notification',
};

export default QUERY_KEYS;