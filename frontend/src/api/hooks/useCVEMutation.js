// frontend/src/api/hooks/useCVEMutation.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cveService } from '../services/cveService';
import { toast } from 'react-toastify';
import logger from '../../utils/logger';
import { QUERY_KEYS } from '../queryKeys';

/**
 * CVE 생성을 위한 mutation 훅
 * 성공 시 CVE 목록 쿼리를 무효화하여 자동으로 최신 데이터를 가져옴
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useCreateCVE = (options = {}, customService = cveService) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (cveData) => {
      logger.info('useCreateCVE', '생성 요청', { data: cveData });
      return customService.createCVE(cveData);
    },
    onSuccess: (data) => {
      // CVE 목록 쿼리 무효화 (자동으로 다시 가져옴)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      toast.success('CVE가 성공적으로 생성되었습니다.');
      logger.info('useCreateCVE', '생성 성공', { cveId: data.id });
      return data;
    },
    onError: (error) => {
      toast.error(`CVE 생성 중 오류가 발생했습니다: ${error.message}`);
      logger.error('useCreateCVE', '생성 중 오류 발생', { error: error.message });
      throw error;
    },
    ...options
  });
};

/**
 * CVE 수정을 위한 mutation 훅
 * 성공 시 CVE 목록 쿼리와 해당 CVE 상세 쿼리를 무효화
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useUpdateCVE = (options = {}, customService = cveService) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ cveId, updateData }) => {
      logger.info('useUpdateCVE', '업데이트 요청', { cveId, data: updateData });
      return customService.updateCVE(cveId, updateData);
    },
    onSuccess: (data, variables) => {
      const cveId = variables.cveId;
      // CVE 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      // 해당 CVE 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      toast.success('CVE가 성공적으로 업데이트되었습니다.');
      logger.info('useUpdateCVE', '업데이트 성공', { cveId });
      return data;
    },
    onError: (error) => {
      toast.error(`CVE 업데이트 중 오류가 발생했습니다: ${error.message}`);
      logger.error('useUpdateCVE', '업데이트 중 오류 발생', { error: error.message });
      throw error;
    },
    ...options
  });
};

/**
 * CVE 삭제를 위한 mutation 훅
 * 성공 시 CVE 목록 쿼리를 무효화하고 해당 CVE 상세 쿼리를 제거
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useDeleteCVE = (options = {}, customService = cveService) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (cveId) => {
      logger.info('useDeleteCVE', '삭제 요청', { cveId });
      return customService.deleteCVE(cveId);
    },
    onSuccess: (data, cveId) => {
      // CVE 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      // 해당 CVE 상세 쿼리 제거 (더 이상 존재하지 않으므로)
      queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      toast.success('CVE가 성공적으로 삭제되었습니다.');
      logger.info('useDeleteCVE', '삭제 성공', { cveId });
      return data;
    },
    onError: (error) => {
      toast.error(`CVE 삭제 중 오류가 발생했습니다: ${error.message}`);
      logger.error('useDeleteCVE', '삭제 중 오류 발생', { error: error.message });
      throw error;
    },
    ...options
  });
};

/**
 * CVE 필드 단위 업데이트 Hook (상태, PoC, 코멘트 등)
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useUpdateCVEField = (options = {}, customService = cveService) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cveId, fieldName, fieldValue }) => {
      logger.info('useUpdateCVEField', '필드 업데이트 요청', { cveId, fieldName, fieldValue });
      return customService.updateCVEField(cveId, fieldName, fieldValue);
    },
    onMutate: async ({ cveId, fieldName, fieldValue }) => {
      // 이전 쿼리를 취소하여 낙관적 업데이트 충돌 방지
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      
      // 이전 상태 스냅샷 저장
      const previousData = queryClient.getQueryData(QUERY_KEYS.CVE.detail(cveId));
      
      // 낙관적 업데이트
      if (previousData) {
        logger.info('useUpdateCVEField', '낙관적 업데이트 적용', { cveId, fieldName });
        queryClient.setQueryData(
          QUERY_KEYS.CVE.detail(cveId),
          {
            ...previousData,
            [fieldName]: fieldValue
          }
        );
      }
      
      return { previousData };
    },
    onError: (error, { cveId, fieldName }, context) => {
      logger.error('useUpdateCVEField', '필드 업데이트 실패', { cveId, fieldName, error: error.message });
      toast.error(`CVE 필드 업데이트 중 오류가 발생했습니다: ${error.message}`);
      
      // 오류 시 이전 상태로 롤백
      if (context?.previousData) {
        logger.info('useUpdateCVEField', '이전 상태로 롤백', { cveId });
        queryClient.setQueryData(
          QUERY_KEYS.CVE.detail(cveId),
          context.previousData
        );
      }
    },
    onSuccess: (data, { cveId, fieldName }) => {
      logger.info('useUpdateCVEField', '필드 업데이트 성공', { cveId, fieldName });
      toast.success(`CVE ${fieldName} 필드가 성공적으로 업데이트되었습니다.`);
      
      // 상세 정보 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), data);
      
      // 목록 쿼리 무효화 (필요한 경우)
      if (['status', 'severity', 'title'].includes(fieldName)) {
        logger.info('useUpdateCVEField', '목록 쿼리 무효화', { reason: '중요 필드 변경' });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      }
    },
    ...options
  });
};

/**
 * CVE 상태 업데이트를 위한 mutation 훅
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useUpdateCVEStatus = (options = {}, customService = cveService) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cveId, status }) => {
      logger.info('useUpdateCVEStatus', '상태 업데이트 요청', { cveId, status });
      return customService.updateCVEStatus(cveId, status);
    },
    onSuccess: (data, { cveId }) => {
      // CVE 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      // 해당 CVE 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      toast.success('CVE 상태가 성공적으로 업데이트되었습니다.');
      logger.info('useUpdateCVEStatus', '상태 업데이트 성공', { cveId, status: data.status });
      return data;
    },
    onError: (error) => {
      toast.error(`CVE 상태 업데이트 중 오류가 발생했습니다: ${error.message}`);
      logger.error('useUpdateCVEStatus', '상태 업데이트 중 오류 발생', { error: error.message });
      throw error;
    },
    ...options
  });
};

/**
 * WebSocket을 통한 실시간 CVE 업데이트 처리 함수
 * 외부에서 socketIO 이벤트 핸들러로 사용
 * @param {Object} queryClient - QueryClient 인스턴스
 * @returns {Function} 이벤트 핸들러 함수
 */
export const handleRealtimeCVEUpdate = (queryClient) => (event) => {
  const { type, cveId } = event;
  
  logger.info('handleRealtimeCVEUpdate', '이벤트 수신', { type, cveId });
  
  // 이벤트 타입에 따라 적절한 쿼리 무효화
  switch (type) {
    case 'cve_created':
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;
    case 'cve_updated':
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      if (cveId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      }
      break;
    case 'cve_deleted':
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      if (cveId) {
        queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      }
      break;
    default:
      logger.warn('handleRealtimeCVEUpdate', '알 수 없는 이벤트 타입', { type });
      break;
  }
};

// 이전 버전과의 호환성을 위한 별칭
export const useCreateCVEMutation = useCreateCVE;
export const useUpdateCVEMutation = useUpdateCVE;
export const useDeleteCVEMutation = useDeleteCVE;
export const useUpdateCVEFieldMutation = useUpdateCVEField;
export const useUpdateCVEStatusMutation = useUpdateCVEStatus;

// 모든 CVE 관련 mutation 훅을 기본 내보내기로 묶어서 제공
export default {
  useCreateCVE,
  useUpdateCVE,
  useDeleteCVE,
  useUpdateCVEField,
  useUpdateCVEStatus,
  handleRealtimeCVEUpdate,
  // 이전 버전과의 호환성을 위한 별칭
  useCreateCVEMutation,
  useUpdateCVEMutation,
  useDeleteCVEMutation,
  useUpdateCVEFieldMutation,
  useUpdateCVEStatusMutation
};
