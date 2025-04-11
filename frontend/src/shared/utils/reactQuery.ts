import { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS as API_QUERY_KEYS } from 'shared/api/queryKeys';

// 쿼리 키 재사용
export const QUERY_KEYS = {
  ...API_QUERY_KEYS,
  // 추가 키 정의
  CVE_SUBSCRIBERS: 'cve-subscribers',
};

// 글로벌 QueryClient 인스턴스 (싱글턴)
let queryClientInstance: QueryClient | null = null;

/**
 * 글로벌 QueryClient 인스턴스를 가져옵니다.
 * App 컴포넌트에서 초기화되어야 합니다.
 */
export function getQueryClient(): QueryClient | null {
  return queryClientInstance;
}

/**
 * 글로벌 QueryClient 인스턴스를 설정합니다.
 * App 컴포넌트에서 한 번만 호출해야 합니다.
 */
export function setQueryClient(client: QueryClient): void {
  queryClientInstance = client;
}
