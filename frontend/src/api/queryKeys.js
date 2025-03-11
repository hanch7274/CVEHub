/**
 * React Query에서 사용할 query key 상수
 * 모든 query key를 한 곳에서 관리하여 일관성 유지
 */
export const QUERY_KEYS = {
  // CVE 관련 query keys
  CVE_LIST: 'cve-list',
  CVE_DETAIL: 'cve-detail',
  
  // 사용자 관련 query keys
  USER: 'user',
  USER_PROFILE: 'user-profile',
  
  // 설정 관련 query keys
  SETTINGS: 'settings',
  
  // 기타 query keys
  NOTIFICATION: 'notification',
};

export default QUERY_KEYS; 