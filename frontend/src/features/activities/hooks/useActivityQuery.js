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
          if (action) params.activity_type = action;
          if (target_type) params.target_type = target_type;
          if (start_date) params.start_date = start_date.toISOString();
          if (end_date) params.end_date = end_date.toISOString();
        }

        // 디버깅 로그는 개발 모드에서만 출력
        if (process.env.NODE_ENV === 'development') {
          console.log(`활동 이력 API 요청: ${url}`, params);
        }
        
        const { data } = await axios.get(url, { params });
        
        // 데이터 가공 및 정렬
        const processedData = {
          ...data,
          items: Array.isArray(data.items) 
            ? data.items.map(item => ({
                ...item,
                // 타임스탬프가 문자열로 오는 경우 Date 객체로 변환
                timestamp: item.timestamp ? new Date(item.timestamp) : new Date()
              }))
            : []
        };
        
        return processedData;
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
        
        // 데이터 가공 및 정렬
        const processedData = {
          ...data,
          items: Array.isArray(data.items) 
            ? data.items.map(item => ({
                ...item,
                timestamp: item.timestamp ? new Date(item.timestamp) : new Date()
              }))
            : []
        };
        
        return processedData;
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
        
        // 데이터 가공 및 정렬
        const processedData = {
          ...data,
          items: Array.isArray(data.items) 
            ? data.items.map(item => ({
                ...item,
                timestamp: item.timestamp ? new Date(item.timestamp) : new Date()
              }))
            : []
        };
        
        return processedData;
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