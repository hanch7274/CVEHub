// frontend/src/api/hooks/useCVEMutation.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import cveService from '../services/cveService';
import { useSnackbar } from 'notistack';
import logger from '../../utils/logging';
import { QUERY_KEYS } from '../queryKeys';
import { SOCKET_EVENTS } from '../../services/socketio/constants';

/**
 * CVE 생성을 위한 mutation 훅
 * 성공 시 CVE 목록 쿼리를 무효화하여 자동으로 최신 데이터를 가져옴
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useCreateCVE = (options = {}) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation({
    mutationFn: (cveData) => {
      logger.info('useCreateCVE', '생성 요청', { data: cveData });
      
      try {
        // 기본 옵션 설정
        return cveService.createCVE(cveData, { 
          meta: {
            source: 'useCreateCVE',
            skipAuthRefresh: false // 인증 갱신 허용
          }
        });
      } catch (error) {
        // 에러 발생 시 config 정보 보존
        const enhancedError = {
          ...error,
          config: {
            ...(error?.config || {}),
            skipAuthRefresh: false
          }
        };
        throw enhancedError;
      }
    },
    onSuccess: (data, variables, context) => {
      // CVE 목록 쿼리 무효화 (자동으로 다시 가져옴)
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchActive: true
      });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE가 성공적으로 생성되었습니다.', { variant: 'success' });
      }
      
      logger.info('useCreateCVE', '생성 성공', { 
        id: data?.id,
        cveId: data?.cveId,
        title: data?.title
      });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        return optionsOnSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      // 에러 객체 안전하게 처리
      const safeError = ensureSafeErrorObject(error);
      
      // 기본 에러 메시지 (options에 onError가 없을 경우에만)
      if (!optionsOnError) {
        enqueueSnackbar(`CVE 생성 실패: ${safeError.message}`, { 
          variant: 'error',
          anchorOrigin: {
            vertical: 'bottom',
            horizontal: 'center',
          }
        });
      }
      
      // 409 에러 (중복 CVE)인 경우 경고 로그, 그 외에는 에러 로그
      if (safeError?.response?.status === 409) {
        logger.warn('useCreateCVE', 'CVE 중복 생성 시도', { 
          message: safeError.message,
          errorCode: safeError?.response?.data?.errorCode || 'DUPLICATE_CVE'
        });
      } else {
        logger.error('useCreateCVE', '생성 중 오류 발생', { 
          message: safeError.message,
          status: safeError.response?.status,
          errorCode: safeError?.response?.data?.errorCode
        });
      }
      
      // options에 onError가 있으면 그것을 호출
      if (optionsOnError) {
        return optionsOnError(safeError, variables, context);
      }
      
      throw safeError;
    },
    ...restOptions
  });
};

/**
 * CVE 업데이트 훅
 * @param {Object} options - 훅 옵션
 * @returns {UseMutationResult} 뮤테이션 결과
 */
export const useUpdateCVE = (options = {}) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation({
    mutationFn: ({ cveId, data }) => {
      logger.info('useUpdateCVE', '업데이트 요청', { cveId, data });
      
      try {
        return cveService.updateCVE(cveId, data, {
          skipAuthRefresh: false
        });
      } catch (error) {
        // 에러 발생 시 config 정보 보존
        const enhancedError = {
          ...error,
          config: {
            ...(error?.config || {}),
            skipAuthRefresh: false
          }
        };
        throw enhancedError;
      }
    },
    onSuccess: (data, { cveId }) => {
      // CVE 목록 및 상세 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['cves'],
        refetchActive: true
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cve', cveId],
        refetchActive: true
      });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE가 성공적으로 업데이트되었습니다.', { variant: 'success' });
      }
      
      logger.info('useUpdateCVE', '업데이트 성공', { 
        cveId,
        data: data
      });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        return optionsOnSuccess(data);
      }
    },
    onError: (error) => {
      // 에러 객체 안전하게 처리
      const safeError = ensureSafeErrorObject(error);
      
      // 기본 에러 메시지 (options에 onError가 없을 경우에만)
      if (!optionsOnError) {
        enqueueSnackbar(`CVE 업데이트 중 오류가 발생했습니다: ${safeError?.message}`, { variant: 'error' });
      }
      
      logger.error('useUpdateCVE', '업데이트 중 오류 발생', { 
        error: safeError?.message,
        code: safeError?.code,
        status: safeError?.response?.status
      });
      
      // options에 onError가 있으면 그것을 호출
      if (optionsOnError) {
        return optionsOnError(safeError);
      }
      
      throw safeError;
    },
    ...restOptions
  });
};

/**
 * CVE 삭제 훅
 * @param {Object} options - 훅 옵션
 * @returns {UseMutationResult} 뮤테이션 결과
 */
export const useDeleteCVE = (options = {}) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation({
    mutationFn: (cveId) => {
      logger.info('useDeleteCVE', '삭제 요청', { cveId });
      
      try {
        return cveService.deleteCVE(cveId, {
          skipAuthRefresh: false
        });
      } catch (error) {
        // 에러 발생 시 config 정보 보존
        const enhancedError = {
          ...error,
          config: {
            ...(error?.config || {}),
            skipAuthRefresh: false
          }
        };
        throw enhancedError;
      }
    },
    onSuccess: (data, cveId) => {
      // CVE 목록 및 상세 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['cves'],
        refetchActive: true
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cve', cveId],
        refetchActive: true
      });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE가 성공적으로 삭제되었습니다.', { variant: 'success' });
      }
      
      logger.info('useDeleteCVE', '삭제 성공', { cveId });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        return optionsOnSuccess(data, cveId);
      }
    },
    onError: (error) => {
      // 에러 객체 안전하게 처리
      const safeError = ensureSafeErrorObject(error);
      
      // 기본 에러 메시지 (options에 onError가 없을 경우에만)
      if (!optionsOnError) {
        enqueueSnackbar(`CVE 삭제 중 오류가 발생했습니다: ${safeError?.message}`, { variant: 'error' });
      }
      
      logger.error('useDeleteCVE', '삭제 중 오류 발생', { 
        error: safeError?.message,
        code: safeError?.code,
        status: safeError?.response?.status
      });
      
      // options에 onError가 있으면 그것을 호출
      if (optionsOnError) {
        return optionsOnError(safeError);
      }
      
      throw safeError;
    },
    ...restOptions
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
  const { enqueueSnackbar } = useSnackbar();
  
  // options에서 onSuccess와 onError 추출
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
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
      logger.error('useUpdateCVEField', '필드 업데이트 실패', { cveId, fieldName, error: error?.message });
      
      // 기본 에러 메시지 (options에 onError가 없을 경우에만)
      if (!optionsOnError) {
        enqueueSnackbar(`CVE 필드 업데이트 중 오류가 발생했습니다: ${error?.message}`, { variant: 'error' });
      }
      
      // 오류 시 이전 상태로 롤백
      if (context?.previousData) {
        logger.info('useUpdateCVEField', '이전 상태로 롤백', { cveId });
        queryClient.setQueryData(
          QUERY_KEYS.CVE.detail(cveId),
          context.previousData
        );
      }
      
      // options에 onError가 있으면 그것을 호출
      if (optionsOnError) {
        return optionsOnError(error, { cveId, fieldName }, context);
      }
    },
    onSuccess: (data, { cveId, fieldName }) => {
      logger.info('useUpdateCVEField', '필드 업데이트 성공', { cveId, fieldName });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar(`CVE ${fieldName} 필드가 성공적으로 업데이트되었습니다.`, { variant: 'success' });
      }
      
      // 상세 정보 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), data);
      
      // 목록 쿼리 무효화 (필요한 경우)
      if (['status', 'severity', 'title'].includes(fieldName)) {
        logger.info('useUpdateCVEField', '목록 쿼리 무효화', { reason: '중요 필드 변경' });
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.CVE.lists(),
          refetchActive: true
        });
      }
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        return optionsOnSuccess(data, { cveId, fieldName });
      }
    },
    ...restOptions
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
  const { enqueueSnackbar } = useSnackbar();
  
  // options에서 onSuccess와 onError 추출
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation({
    mutationFn: ({ cveId, status }) => {
      logger.info('useUpdateCVEStatus', '상태 업데이트 요청', { cveId, status });
      return customService.updateCVEStatus(cveId, status);
    },
    onSuccess: (data, { cveId }) => {
      // CVE 목록 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchActive: true
      });
      // 해당 CVE 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE 상태가 성공적으로 업데이트되었습니다.', { variant: 'success' });
      }
      
      logger.info('useUpdateCVEStatus', '상태 업데이트 성공', { cveId, status: data.status });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        return optionsOnSuccess(data, { cveId });
      }
      
      return data;
    },
    onError: (error) => {
      // 기본 에러 메시지 (options에 onError가 없을 경우에만)
      if (!optionsOnError) {
        enqueueSnackbar(`CVE 상태 업데이트 중 오류가 발생했습니다: ${error?.message}`, { variant: 'error' });
      }
      
      logger.error('useUpdateCVEStatus', '상태 업데이트 중 오류 발생', { error: error?.message });
      
      // options에 onError가 있으면 그것을 호출
      if (optionsOnError) {
        return optionsOnError(error);
      }
      
      throw error;
    },
    ...restOptions
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
    case SOCKET_EVENTS.CVE_CREATED:
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchActive: true
      });
      break;
    case SOCKET_EVENTS.CVE_UPDATED:
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchActive: true
      });
      if (cveId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      }
      break;
    case SOCKET_EVENTS.CVE_DELETED:
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchActive: true
      });
      if (cveId) {
        queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      }
      break;
    case SOCKET_EVENTS.CVE_CACHE_INVALIDATED:
      // 캐시 무효화 이벤트 처리
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchActive: true
      });
      if (cveId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      } else {
        // 특정 CVE ID가 없는 경우 전체 CVE 관련 쿼리 무효화
        queryClient.invalidateQueries({ 
          predicate: (query) => 
            query.queryKey[0] === QUERY_KEYS.CVE.all
        });
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

/**
 * 안전한 에러 객체 생성 헬퍼 함수
 * @param {Error} error - 원본 에러 객체
 * @returns {Object} 안전하게 처리된 에러 객체
 */
const ensureSafeErrorObject = (error) => {
  // 이미 cveService에서 처리된 에러인 경우 그대로 반환
  if (error?.isHandled) {
    return error;
  }
  
  // 에러 객체 안전하게 구성
  const safeError = {
    ...error,
    code: error?.response?.status || error?.code || 500,
    message: error?.response?.data?.detail || 
             error?.response?.data?.message || 
             (error?.message && !error?.message.includes('status code')) ? error.message : 
             '알 수 없는 오류가 발생했습니다',
    response: error?.response || { 
      status: 500, 
      data: { 
        detail: '알 수 없는 오류가 발생했습니다',
        errorCode: 'UNKNOWN_ERROR'
      } 
    }
  };
  
  // response.data가 없는 경우 생성
  if (!safeError.response.data) {
    safeError.response.data = {
      detail: safeError.message,
      errorCode: `HTTP_${safeError.response.status}`
    };
  }
  
  // detail 필드가 없는 경우 생성
  if (!safeError.response.data.detail) {
    safeError.response.data.detail = safeError.message;
  }
  
  // errorCode 필드가 없는 경우 생성
  if (!safeError.response.data.errorCode) {
    safeError.response.data.errorCode = `HTTP_${safeError.response.status}`;
  }
  
  return safeError;
};
