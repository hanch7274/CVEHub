/**
 * CVE 관련 mutation 훅 모음
 */
import { useMutation, useQueryClient, UseMutationOptions, UseMutationResult, QueryClient } from '@tanstack/react-query';
import cveService from '../services/cveService';
import { useSnackbar } from 'notistack';
import { 
  get, 
  merge, 
  defaultsDeep, 
  debounce, 
  set,
  isArray
} from 'lodash';
import { 
  CVEDetail, 
  CVEData, 
  CVEUpdateRequest, 
  OperationResponse 
} from '../types/cve';
import { QUERY_KEYS } from 'shared/api/queryKeys'
import { ApiResponse, ApiError } from 'shared/api/types/api';
import logger from 'shared/utils/logging';
import { SOCKET_EVENTS } from 'core/socket/services/constants';
/**
 * CVE 생성 요청 타입
 */
export type CreateCVERequest = CVEData;

/**
 * CVE 업데이트 요청 타입
 */
export interface UpdateCVEParams {
  cveId: string;
  data: CVEUpdateRequest;
}

/**
 * CVE 필드 업데이트 요청 타입
 */
export interface UpdateCVEFieldParams {
  cveId: string;
  fieldName: string;
  fieldValue: any;
}

/**
 * CVE 상태 업데이트 요청 타입
 */
export interface UpdateCVEStatusParams {
  cveId: string;
  status: string;
}

/**
 * 실시간 CVE 업데이트 이벤트 타입
 */
export interface RealtimeCVEUpdateEvent {
  type: string;
  cveId?: string;
  data?: any;
}

/**
 * 낙관적 업데이트를 위한 컨텍스트 타입
 */
export interface UpdateCVEFieldContext {
  previousData?: ApiResponse<CVEDetail>;
}

/**
 * CVE 생성을 위한 mutation 훅
 * 성공 시 CVE 목록 쿼리를 무효화하여 자동으로 최신 데이터를 가져옴
 * @param options - React Query 옵션
 * @returns useMutation 훅에서 반환되는 결과 객체
 */
export const useCreateCVE = (
  options: UseMutationOptions<
    ApiResponse<CVEDetail>, 
    ApiError, 
    CreateCVERequest
  > = {}
): UseMutationResult<
  ApiResponse<CVEDetail>, 
  ApiError, 
  CreateCVERequest
> => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation<ApiResponse<CVEDetail>, ApiError, CreateCVERequest>({
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
        } as ApiError;
        throw enhancedError;
      }
    },
    onSuccess: (data, variables, context) => {
      // CVE 목록 쿼리 무효화 (자동으로 다시 가져옴)
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE가 성공적으로 생성되었습니다.', { variant: 'success' });
      }
      
      logger.info('useCreateCVE', '생성 성공', { 
        id: data?.data?.id,
        cveId: data?.data?.cveId,
        title: data?.data?.title
      });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        optionsOnSuccess(data, variables, context);
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
        optionsOnError(safeError, variables, context);
      }
      
      throw safeError;
    },
    ...restOptions
  });
};

/**
 * CVE 업데이트 훅
 * @param options - 훅 옵션
 * @returns 뮤테이션 결과
 */
export const useUpdateCVE = (
  options: UseMutationOptions<
    ApiResponse<CVEDetail>, 
    ApiError, 
    UpdateCVEParams
  > = {}
): UseMutationResult<
  ApiResponse<CVEDetail>, 
  ApiError, 
  UpdateCVEParams
> => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation<ApiResponse<CVEDetail>, ApiError, UpdateCVEParams>({
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
        } as ApiError;
        throw enhancedError;
      }
    },
    onSuccess: (data, variables, context) => {
      const { cveId } = variables;
      // CVE 목록 및 상세 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['cves'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cve', cveId],
        refetchType: 'active'
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
        optionsOnSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
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
        optionsOnError(safeError, variables, context);
      }
      
      throw safeError;
    },
    ...restOptions
  });
};

/**
 * CVE 삭제 훅
 * @param options - 훅 옵션
 * @returns 뮤테이션 결과
 */
export const useDeleteCVE = (
  options: UseMutationOptions<
    ApiResponse<OperationResponse>, 
    ApiError, 
    string
  > = {}
): UseMutationResult<
  ApiResponse<OperationResponse>, 
  ApiError, 
  string
> => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation<ApiResponse<OperationResponse>, ApiError, string>({
    mutationFn: (cveId) => {
      logger.info('useDeleteCVE', '삭제 요청', { cveId });
      
      try {
        // boolean 대신 ApiResponse<OperationResponse> 형태로 반환하도록 수정
        return cveService.deleteCVE(cveId, {
          skipAuthRefresh: false
        }).then(success => {
          // boolean 결과를 ApiResponse<OperationResponse> 형태로 변환
          return {
            success: true,
            message: 'CVE가 성공적으로 삭제되었습니다.',
            data: {
              success: true,
              message: 'CVE가 성공적으로 삭제되었습니다.'
            }
          } as ApiResponse<OperationResponse>;
        });
      } catch (error) {
        // 에러 발생 시 config 정보 보존
        const enhancedError = {
          ...error,
          config: {
            ...(error?.config || {}),
            skipAuthRefresh: false
          }
        } as ApiError;
        throw enhancedError;
      }
    },
    onSuccess: (data, cveId, context) => {
      // CVE 목록 및 상세 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['cves'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cve', cveId],
        refetchType: 'active'
      });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE가 성공적으로 삭제되었습니다.', { variant: 'success' });
      }
      
      logger.info('useDeleteCVE', '삭제 성공', { cveId });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        optionsOnSuccess(data, cveId, context);
      }
    },
    onError: (error, cveId, context) => {
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
        optionsOnError(safeError, cveId, context);
      }
      
      throw safeError;
    },
    ...restOptions
  });
};

/**
 * CVE 필드 단위 업데이트 Hook (상태, PoC, 코멘트 등)
 * @param options - React Query 옵션
 * @param customService - 선택적으로 주입할 서비스 객체
 * @returns useMutation 훅에서 반환되는 결과 객체
 */
export const useUpdateCVEField = (
  options: UseMutationOptions<
    ApiResponse<CVEDetail>, 
    ApiError, 
    UpdateCVEFieldParams,
    UpdateCVEFieldContext
  > = {}, 
  customService = cveService
): UseMutationResult<
  ApiResponse<CVEDetail>, 
  ApiError, 
  UpdateCVEFieldParams,
  UpdateCVEFieldContext
> => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  
  // options에서 onSuccess와 onError 추출
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation<ApiResponse<CVEDetail>, ApiError, UpdateCVEFieldParams, UpdateCVEFieldContext>({
    mutationFn: ({ cveId, fieldName, fieldValue }) => {
      logger.info('useUpdateCVEField', '필드 업데이트 요청', { cveId, fieldName, fieldValue });
      
      // PoC 필드 업데이트 시 last_modified_at과 last_modified_by 필드 자동 설정
      if (fieldName === 'poc' && isArray(fieldValue)) {
        // 현재 시간과 사용자 정보 설정
        const now = new Date().toISOString();
        const currentUser = localStorage.getItem('username') || 'unknown';
        
        // 각 PoC 항목에 last_modified_at과 last_modified_by 필드 설정
        const updatedPoc = fieldValue.map(poc => {
          // 새로 추가된 PoC인 경우 (last_modified_at이 없는 경우)
          if (!poc.last_modified_at) {
            return {
              ...poc,
              last_modified_at: now,
              last_modified_by: currentUser
            };
          }
          return poc;
        });
        
        logger.info('useUpdateCVEField', 'PoC 필드 자동 업데이트', { 
          cveId, 
          pocCount: updatedPoc.length 
        });
        
        return customService.updateCVEField(cveId, fieldName, updatedPoc);
      }
      
      return customService.updateCVEField(cveId, fieldName, fieldValue);
    },
    onMutate: async ({ cveId, fieldName, fieldValue }): Promise<UpdateCVEFieldContext> => {
      // 이전 쿼리를 취소하여 낙관적 업데이트 충돌 방지
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      
      // 이전 상태 스냅샷 저장
      const previousData = queryClient.getQueryData<ApiResponse<CVEDetail>>(QUERY_KEYS.CVE.detail(cveId));
      
      // 낙관적 업데이트
      if (previousData?.data) {
        logger.info('useUpdateCVEField', '낙관적 업데이트 적용', { cveId, fieldName });
        
        // PoC 필드 업데이트 시 낙관적 업데이트에도 last_modified_at과 last_modified_by 필드 설정
        let updatedFieldValue = fieldValue;
        if (fieldName === 'poc' && isArray(fieldValue)) {
          const now = new Date().toISOString();
          const currentUser = localStorage.getItem('username') || 'unknown';
          
          updatedFieldValue = fieldValue.map(poc => {
            if (!poc.last_modified_at) {
              return {
                ...poc,
                last_modified_at: now,
                last_modified_by: currentUser
              };
            }
            return poc;
          });
        }
        
        // lodash의 set 함수를 사용하여 중첩된 필드도 안전하게 업데이트
        const updatedData = { ...previousData };
        set(updatedData, `data.${fieldName}`, updatedFieldValue);
        
        queryClient.setQueryData<ApiResponse<CVEDetail>>(
          QUERY_KEYS.CVE.detail(cveId),
          updatedData
        );
      }
      
      return { previousData };
    },
    onError: (error, variables, context) => {
      const { cveId, fieldName } = variables;
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
        optionsOnError(error, variables, context);
      }
    },
    onSuccess: (data, variables, context) => {
      const { cveId, fieldName } = variables;
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
          refetchType: 'active'
        });
      }
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        optionsOnSuccess(data, variables, context);
      }
    },
    ...restOptions
  });
};

/**
 * CVE 상태 업데이트를 위한 mutation 훅
 * @param options - React Query 옵션
 * @param customService - 선택적으로 주입할 서비스 객체
 * @returns useMutation 훅에서 반환되는 결과 객체
 */
export const useUpdateCVEStatus = (
  options: UseMutationOptions<
    ApiResponse<CVEDetail>, 
    ApiError, 
    UpdateCVEStatusParams
  > = {}, 
  customService = cveService
): UseMutationResult<
  ApiResponse<CVEDetail>, 
  ApiError, 
  UpdateCVEStatusParams
> => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  
  // options에서 onSuccess와 onError 추출
  const { onSuccess: optionsOnSuccess, onError: optionsOnError, ...restOptions } = options;
  
  return useMutation<ApiResponse<CVEDetail>, ApiError, UpdateCVEStatusParams>({
    mutationFn: ({ cveId, status }) => {
      logger.info('useUpdateCVEStatus', '상태 업데이트 요청', { cveId, status });
      return customService.updateCVEStatus(cveId, status);
    },
    onSuccess: (data, variables, context) => {
      const { cveId } = variables;
      // CVE 목록 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      // 해당 CVE 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId), refetchType: 'active' });
      
      // 기본 성공 메시지 (options에 onSuccess가 없을 경우에만)
      if (!optionsOnSuccess) {
        enqueueSnackbar('CVE 상태가 성공적으로 업데이트되었습니다.', { variant: 'success' });
      }
      
      logger.info('useUpdateCVEStatus', '상태 업데이트 성공', { cveId, status: data.data?.status });
      
      // options에 onSuccess가 있으면 그것을 호출
      if (optionsOnSuccess) {
        optionsOnSuccess(data, variables, context);
      }
      
      return data;
    },
    onError: (error, variables, context) => {
      // 기본 에러 메시지 (options에 onError가 없을 경우에만)
      if (!optionsOnError) {
        enqueueSnackbar(`CVE 상태 업데이트 중 오류가 발생했습니다: ${error?.message}`, { variant: 'error' });
      }
      
      logger.error('useUpdateCVEStatus', '상태 업데이트 중 오류 발생', { error: error?.message });
      
      // options에 onError가 있으면 그것을 호출
      if (optionsOnError) {
        optionsOnError(error, variables, context);
      }
      
      throw error;
    },
    ...restOptions
  });
};

/**
 * WebSocket을 통한 실시간 CVE 업데이트 처리 함수
 * 외부에서 socketIO 이벤트 핸들러로 사용
 * @param queryClient - QueryClient 인스턴스
 * @returns 이벤트 핸들러 함수
 */
export const handleRealtimeCVEUpdate = (queryClient: QueryClient) => {
  // 자주 발생할 수 있는 목록 쿼리 무효화를 디바운스 처리
  const debouncedInvalidateLists = debounce(() => {
    queryClient.invalidateQueries({ 
      queryKey: QUERY_KEYS.CVE.lists(),
      refetchType: 'active'
    });
  }, 300, { leading: true, trailing: true });

  // 특정 CVE 상세 정보 쿼리 무효화를 디바운스 처리
  const debouncedInvalidateDetail = debounce((cveId: string) => {
    queryClient.invalidateQueries({ 
      queryKey: QUERY_KEYS.CVE.detail(cveId), 
      refetchType: 'active' 
    });
  }, 300, { leading: true, trailing: true });

  return (event: RealtimeCVEUpdateEvent): void => {
    const { type, cveId } = event;
    
    logger.info('handleRealtimeCVEUpdate', '이벤트 수신', { type, cveId });
    
    // 이벤트 타입에 따라 적절한 쿼리 무효화
    switch (type) {
      case SOCKET_EVENTS.CVE_CREATED:
        debouncedInvalidateLists();
        break;
      case SOCKET_EVENTS.CVE_UPDATED:
        debouncedInvalidateLists();
        if (cveId) {
          debouncedInvalidateDetail(cveId);
        }
        break;
      case SOCKET_EVENTS.CVE_DELETED:
        debouncedInvalidateLists();
        if (cveId) {
          queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
        }
        break;
      case SOCKET_EVENTS.CACHE_INVALIDATED:
        // 캐시 무효화 이벤트 처리
        debouncedInvalidateLists();
        if (cveId) {
          debouncedInvalidateDetail(cveId);
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
 * @param error - 원본 에러 객체
 * @returns 안전하게 처리된 에러 객체
 */
const ensureSafeErrorObject = (error: any): ApiError => {
  // 이미 cveService에서 처리된 에러인 경우 그대로 반환
  if (get(error, 'isHandled', false)) {
    return error as ApiError;
  }
  
  // 기본 에러 응답 객체
  const defaultErrorResponse = { 
    status: 500, 
    data: { 
      detail: '알 수 없는 오류가 발생했습니다',
      errorCode: 'UNKNOWN_ERROR'
    } 
  };
  
  // lodash의 get을 사용하여 안전하게 속성에 접근
  const errorMessage = 
    get(error, 'response.data.detail') || 
    get(error, 'response.data.message') || 
    (get(error, 'message') && !get(error, 'message', '').includes('status code')) 
      ? get(error, 'message') 
      : '알 수 없는 오류가 발생했습니다';
  
  // 에러 객체 안전하게 구성 (lodash의 merge와 defaultsDeep 사용)
  const safeError: ApiError = merge({}, error, {
    name: get(error, 'name', 'Error'),
    code: get(error, 'response.status', get(error, 'code', 500)),
    message: errorMessage,
    response: defaultsDeep({}, get(error, 'response'), defaultErrorResponse)
  });
  
  // response.data가 없는 경우 생성
  if (!get(safeError, 'response.data')) {
    set(safeError, 'response.data', {
      detail: safeError.message,
      errorCode: `HTTP_${get(safeError, 'response.status', 500)}`
    });
  }
  
  // detail 필드가 없는 경우 생성
  if (!get(safeError, 'response.data.detail')) {
    set(safeError, 'response.data.detail', safeError.message);
  }
  
  // errorCode 필드가 없는 경우 생성
  if (!get(safeError, 'response.data.errorCode')) {
    set(safeError, 'response.data.errorCode', `HTTP_${get(safeError, 'response.status', 500)}`);
  }
  
  return safeError;
};
