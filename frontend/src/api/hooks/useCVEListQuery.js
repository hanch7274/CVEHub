import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { QUERY_KEYS } from '../queryKeys';
import { getAccessToken } from '../../utils/storage/tokenStorage';

// API_BASE_URL 조정 - /api 경로를 포함하지 않도록 수정
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * CVE 목록을 가져오는 API 함수
 */
export const fetchCVEList = async (params = {}) => {
  const { 
    page = 0, 
    rowsPerPage = 10, 
    filters = {}, 
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = params;

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: rowsPerPage.toString(),
    sortBy,
    sortOrder,
    ...Object.entries(filters).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = value.toString();
      }
      return acc;
    }, {})
  });

  try {
    // 인증 토큰을 헤더에 추가
    const token = getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const url = `${API_BASE_URL}/cves?${queryParams}`;
    console.log('[useCVEListQuery] API 요청 URL:', url);
    
    const response = await axios.get(url, { headers });
    
    // 응답 데이터 로깅
    console.log('[useCVEListQuery] API 응답 데이터 (변환 후):', {
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      hasItems: response.data && response.data.items && Array.isArray(response.data.items),
      itemsCount: response.data && response.data.items ? response.data.items.length : 0,
      keys: response.data ? Object.keys(response.data) : [],
      sample: response.data
    });
    
    // 데이터 구조 확인 및 처리
    if (response.data && Array.isArray(response.data)) {
      // 배열 형태의 데이터 처리
      return response.data.map(item => ({
        ...item,
        // id와 cveId가 없을 경우 기본값 설정 (snake_case에서 변환 실패 가능성 대비)
        id: item.id || (item.cve_id ? `cve-${item.cve_id}` : null),
        cveId: item.cveId || item.cve_id || null
      }));
    } else if (response.data && response.data.items && Array.isArray(response.data.items)) {
      // 페이지네이션 구조 처리
      return {
        ...response.data,
        items: response.data.items.map(item => ({
          ...item,
          id: item.id || (item.cve_id ? `cve-${item.cve_id}` : null),
          cveId: item.cveId || item.cve_id || null
        }))
      };
    }
    
    return response.data;
  } catch (error) {
    console.error('CVE 목록 조회 중 오류 발생:', error);
    throw error;
  }
};

/**
 * CVE 목록을 가져오고 관리하는 React Query 훅
 */
export const useCVEListQuery = (params = {}) => {
  const { 
    page = 0, 
    rowsPerPage = 10, 
    filters = {}, 
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = params;

  return useQuery({
    queryKey: [QUERY_KEYS.CVE_LIST, page, rowsPerPage, filters, sortBy, sortOrder],
    queryFn: () => fetchCVEList({ page, rowsPerPage, filters, sortBy, sortOrder }),
    keepPreviousData: true, // 페이지 전환 시 이전 데이터 유지
    staleTime: 30000, // 30초 동안 데이터 신선 유지
  });
};

export default useCVEListQuery;