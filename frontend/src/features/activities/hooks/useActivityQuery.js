import { useQuery } from "@tanstack/react-query";
import axios from "../../../shared/api/config/axios";

/**
 * 캐시 키 생성 유틸리티 함수
 * 
 * @param {Object} options 필터 옵션
 * @returns {Array} 쿼리 키 배열
 */
const createActivitiesQueryKey = (options) => {
  const {
    username,
    target_type,
    target_id,
    action,
    start_date,
    end_date,
    page,
    limit,
  } = options;

  return [
    "activities",
    username,
    target_type,
    target_id,
    action,
    start_date ? start_date.toISOString() : null,
    end_date ? end_date.toISOString() : null,
    page,
    limit,
  ];
};

/**
 * 개선된 활동 이력 조회를 위한 쿼리 훅
 * - 쿼리 키 관리 최적화
 * - 성능 향상을 위한 옵션 조정
 * - 데이터 가공 통합
 * 
 * @param {Object} options 필터 및 페이지네이션 옵션
 * @param {string} options.username 사용자명 필터
 * @param {string} options.target_type 대상 유형 필터
 * @param {string} options.target_id 대상 ID 필터
 * @param {string} options.action 동작 필터
 * @param {Date} options.start_date 시작 날짜
 * @param {Date} options.end_date 종료 날짜
 * @param {number} options.page 페이지 번호
 * @param {number} options.limit 페이지당 항목 수
 * @returns {Object} 쿼리 결과
 */
export const useActivityQuery = (options = {}) => {
  const {
    username,
    target_type,
    target_id,
    action,
    start_date,
    end_date,
    page = 1,
    limit = 10,
  } = options;

  return useQuery({
    queryKey: createActivitiesQueryKey(options),
    queryFn: async () => {
      try {
        let url = "/activities";
        const params = {
          page,
          limit,
        };

        // 사용자명으로 필터링하는 경우 해당 엔드포인트 사용
        if (username) {
          url = `/activities/users/${username}`;
        } 
        // 대상 유형과 ID로 필터링하는 경우 해당 엔드포인트 사용
        else if (target_type && target_id) {
          url = `/activities/targets/${target_type}/${target_id}`;
        } else {
          // 기본 엔드포인트에서 필터 적용
          if (action) {
            // action이 배열인 경우, 쉼표로 구분된 문자열로 변환
            if (Array.isArray(action) && action.length > 0) {
              params.action = action.join(',');
            } else if (typeof action === 'string') {
              params.action = action;
            }
          }
          if (target_type) {
            // target_type이 배열인 경우, 쉼표로 구분된 문자열로 변환
            if (Array.isArray(target_type) && target_type.length > 0) {
              params.target_type = target_type.join(',');
            } else if (typeof target_type === 'string') {
              params.target_type = target_type;
            }
          }
          if (start_date) params.start_date = start_date.toISOString();
          if (end_date) params.end_date = end_date.toISOString();
        }

        // 디버깅 로그는 개발 모드에서만 출력
        if (process.env.NODE_ENV === 'development') {
          console.log(`활동 이력 API 요청: ${url}`, params);
        }
        
        const { data } = await axios.get(url, { params });
        
        // 날짜 필드는 이미 axios 인터셉터에서 normalizeDateFieldsFromApi를 통해 처리됨
        // 디버깅: 활동 내역 조회 결과 출력
        console.log(`[활동 내역 디버그] 데이터 조회 결과:`, {
          url,
          params,
          총건수: data.total,
          현재페이지: params.page,
          페이지당항목수: params.limit,
          필터: {
            사용자: username || '모든 사용자',
            대상유형: target_type || '전체',
            대상ID: target_id || '전체',
            액션: action || '전체',
            시작일: start_date ? new Date(start_date).toLocaleDateString() : '전체',
            종료일: end_date ? new Date(end_date).toLocaleDateString() : '전체'
          }
        });
        
        // 조회된 첫 5개 항목 샘플 출력 (항목이 많을 경우)
        if (Array.isArray(data.items) && data.items.length > 0) {
          console.log(`[활동 내역 디버그] 조회된 항목 샘플 (최대 5개):`, 
            data.items.slice(0, 5).map(item => ({
              ID: item.id,
              사용자: item.username,
              액션: item.action,
              대상: `${item.target_type}${item.target_id ? ` (${item.target_id})` : ''}`,
              시간: item.timestamp.toLocaleString(),
              상세: item.details
            }))
          );
        }
        
        return data;
      } catch (error) {
        console.error('활동 이력 조회 중 오류 발생:', error);
        throw error;
      }
    },
    keepPreviousData: true,
    staleTime: 30000, // 30초
    refetchOnWindowFocus: false,
    retry: 1, // 요청 실패 시 1번만 재시도
  });
};

/**
 * 특정 대상의 활동 이력 조회를 위한 쿼리 훅
 * 
 * @param {string} target_type 대상 유형
 * @param {string} target_id 대상 ID
 * @param {Object} options 페이지네이션 옵션
 * @returns {Object} 쿼리 결과
 */
export const useTargetActivities = (target_type, target_id, options = {}) => {
  const { page = 1, limit = 10 } = options;

  return useQuery({
    queryKey: ["targetActivities", target_type, target_id, page, limit],
    queryFn: async () => {
      try {
        const params = {
          page,
          limit,
        };

        const { data } = await axios.get(`/activities/targets/${target_type}/${target_id}`, { params });
        
        // 날짜 필드는 이미 axios 인터셉터에서 처리됨
        return data;
      } catch (error) {
        console.error(`${target_type} ${target_id}의 활동 이력 조회 중 오류 발생:`, error);
        throw error;
      }
    },
    keepPreviousData: true,
    enabled: Boolean(target_type && target_id),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};

/**
 * 현재 사용자의 활동 이력 조회를 위한 쿼리 훅
 * 
 * @param {string} username 사용자명
 * @param {Object} options 페이지네이션 옵션
 * @returns {Object} 쿼리 결과
 */
export const useUserActivities = (username, options = {}) => {
  const { page = 1, limit = 10 } = options;

  return useQuery({
    queryKey: ["userActivities", username, page, limit],
    queryFn: async () => {
      try {
        const params = {
          page,
          limit,
        };

        const { data } = await axios.get(`/activities/users/${username}`, { params });
        
        // 날짜 필드는 이미 axios 인터셉터에서 처리됨
        return data;
      } catch (error) {
        console.error(`사용자 ${username}의 활동 이력 조회 중 오류 발생:`, error);
        throw error;
      }
    },
    keepPreviousData: true,
    enabled: Boolean(username),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};