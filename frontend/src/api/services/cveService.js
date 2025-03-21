// cveService.js
import api from '../config/axios';
import { CASE_CONVERSION_CONFIG } from '../../config';
import logger from '../../utils/logging';
import { camelToSnake, snakeToCamel } from '../../utils/caseConverter';

// 변환에서 제외할 필드 목록
const EXCLUDED_FIELDS = CASE_CONVERSION_CONFIG.EXCLUDED_FIELDS;

/**
 * CVE 데이터를 관리하는 서비스 클래스
 * 백엔드 API와 통신하여 CVE 데이터의 CRUD 작업을 처리
 * @class CVEService
 */
class CVEService {
  /**
   * CVE 목록 조회
   * @param {Object} filters - 페이지네이션, 검색, 필터링 옵션
   * @returns {Promise<Object>} 응답 데이터 (results, pagination 포함)
   */
  async getCVEs(filters = {}) {
    try {
      logger.info('cveService', '목록 조회 요청', filters);
      
      // 백엔드 API와 호환되는 파라미터로 변환
      const params = {};
      
      // 페이지네이션 처리
      if (filters.page !== undefined) {
        params.page = Number(filters.page); // 페이지 번호 그대로 전달
      }
      
      if (filters.rowsPerPage !== undefined) {
        params.limit = filters.rowsPerPage;
      }
      
      // 검색어 처리
      if (filters.search) {
        // 검색어는 'search' 파라미터로 전달 (백엔드 API에 맞춤)
        params.search = filters.search;
        logger.info('cveService', '검색어 추가', { search: filters.search });
      }
      
      // 정렬 처리
      if (filters.sortBy) {
        params.sort_by = filters.sortBy; // 스네이크 케이스 사용 (백엔드 API에 맞춤)
        params.sort_order = filters.sortOrder || 'desc';
      }
      
      // 필터 처리 (severity, status 등)
      if (filters.filters) {
        Object.entries(filters.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            // 스네이크 케이스로 변환 없이 그대로 전달
            params[key] = value;
          }
        });
      }
      
      // API 엔드포인트 선택 (/cves/list 사용)
      const endpoint = '/cves/list';
      
      logger.info('cveService', '변환된 API 요청 파라미터', params);
      
      // 캐시 우회를 위한 헤더 추가 (검색어가 있는 경우)
      const headers = filters.search ? {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'x-refresh': 'true'
      } : {};
      
      const response = await api.get(endpoint, {
        params,
        headers
      });
      
      // 응답 형식 표준화
      const result = {
        items: response.data?.results || response.data?.items || [],
        total: response.data?.pagination?.total || response.data?.total || 0,
        page: filters.page || 1, 
        limit: filters.rowsPerPage || 10
      };
      
      logger.info('cveService', '목록 조회 성공', { 
        count: result.items.length || 0,
        total: result.total || 0,
        search: filters.search || ''
      });
      
      return result;
    } catch (error) {
      logger.error('cveService', '목록 조회 실패', { error: error.message, filters });
      throw this._handleError(error, '목록 조회 실패');
    }
  }

  /**
   * CVE 상세 정보 조회
   * @param {string} cveId - 조회할 CVE ID
   * @param {Object} options - 요청 옵션
   * @returns {Promise<Object>} - CVE 상세 정보
   */
  async getCVEById(cveId, options = {}) {
    if (!cveId) {
      throw new Error('CVE ID가 필요합니다');
    }
    
    try {
      // 캐시 우회 옵션 추가
      const headers = options.bypassCache ? {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'x-refresh': 'true'
      } : {};
      
      logger.info('cveService', 'CVE 상세 정보 요청', { 
        cveId,
        bypassCache: !!options.bypassCache,
        headers
      });
      
      const response = await api.get(`/cves/${cveId}`, { headers });
      
      logger.info('cveService', 'CVE 상세 정보 응답', {
        cveId,
        status: response.status,
        dataSize: JSON.stringify(response.data).length
      });
      
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 상세 정보 조회 실패', { 
        cveId, 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      throw this._handleError(error, '상세 정보 조회 실패');
    }
  }

  /**
   * 캐시 우회 CVE 상세 정보 조회 (강제 새로고침)
   * @param {string} cveId - CVE ID
   * @returns {Promise<Object>} 응답 데이터
   */
  async getCVEByIdNoCache(cveId) {
    if (!cveId) {
      logger.warn('cveService', 'getCVEByIdNoCache 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 강제 새로고침 요청', { cveId });
      const response = await api.get(`/cves/${cveId}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'x-refresh': 'true'
        }
      });
      logger.info('cveService', 'CVE 강제 새로고침 성공', { cveId });
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 강제 새로고침 실패', { cveId, error: error.message });
      throw this._handleError(error, `CVE #${cveId} 새로고침 실패`);
    }
  }

  /**
   * 새로운 CVE를 생성합니다.
   * @param {Object} cveData - 생성할 CVE 데이터
   * @param {Object} options - 요청 옵션
   * @param {Object} options.meta - 메타 정보
   * @returns {Promise<Object>} 생성된 CVE 객체
   */
  async createCVE(cveData, options = {}) {
    try {
      const url = '/cves';
      
      // 요청 옵션 준비
      const requestOptions = {
        skipAuthRefresh: false, // 기본값: 인증 갱신 허용
        ...(options || {})
      };
      
      // API 호출
      const response = await api.post(url, cveData, requestOptions);
      
      // 응답 로깅
      logger.info('cveService.createCVE', '생성 성공', { 
        id: response.data?.id,
        status: response.status
      });
      
      return response.data;
    } catch (error) {
      // 에러 처리 강화
      logger.error('cveService.createCVE', '생성 실패', { 
        error: error?.message,
        status: error?.response?.status,
        code: error?.code
      });
      
      // 에러 객체 구조 확인
      const statusCode = error?.response?.status || error?.code || 500;
      
      // 409 에러 (중복 CVE) 처리
      if (statusCode === 409) {
        // 백엔드에서 전달된 상세 에러 메시지 사용
        const detailMessage = error?.response?.data?.detail || '이미 존재하는 CVE입니다.';
        
        const enhancedError = new Error(detailMessage);
        enhancedError.code = 409;
        enhancedError.status = 409;
        enhancedError.originalError = error;
        enhancedError.isHandled = true; // 이미 처리된 에러임을 표시
        
        // response 객체 구성
        enhancedError.response = {
          status: 409,
          data: {
            detail: detailMessage,
            errorCode: error?.response?.data?.errorCode || 'DUPLICATE_CVE'
          }
        };
        
        throw enhancedError;
      }
      
      // 기타 에러 처리
      const errorMessage = error?.response?.data?.detail || 
                          error?.response?.data?.message || 
                          (error?.message && !error?.message.includes('status code')) ? error.message : 
                          'CVE 생성 중 오류가 발생했습니다.';
      
      const enhancedError = new Error(errorMessage);
      enhancedError.code = statusCode;
      enhancedError.status = statusCode;
      enhancedError.originalError = error;
      enhancedError.isHandled = true; // 이미 처리된 에러임을 표시
      
      // response 객체 구성
      enhancedError.response = {
        status: statusCode,
        data: {
          detail: errorMessage,
          errorCode: error?.response?.data?.errorCode || 'UNKNOWN_ERROR'
        }
      };
      
      throw enhancedError;
    }
  }

  /**
   * CVE 업데이트 (전체)
   * @param {string} cveId - CVE ID
   * @param {Object} updateData - 업데이트할 데이터
   * @param {Object} options - 요청 옵션
   * @returns {Promise<Object>} 업데이트된 CVE 데이터
   */
  async updateCVE(cveId, updateData, options = {}) {
    if (!cveId) {
      logger.warn('cveService', 'updateCVE 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    if (!updateData) {
      logger.warn('cveService', 'updateCVE 호출 시 updateData가 없습니다');
      throw new Error('업데이트 데이터는 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 업데이트 요청', { cveId, data: updateData });
      
      // 요청 옵션 설정
      const requestOptions = {
        ...(options || {}),
        skipAuthRefresh: options?.skipAuthRefresh ?? false
      };
      
      // 백엔드에서 PATCH 메서드 사용하므로 일관성 유지
      const response = await api.patch(`/cves/${cveId}`, updateData, requestOptions);
      
      logger.info('cveService', 'CVE 업데이트 성공', { 
        cveId,
        status: response.status,
        statusText: response.statusText
      });
      
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 업데이트 실패', { 
        cveId, 
        data: updateData,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // 에러 객체 강화 (config 정보 보존)
      const enhancedError = {
        ...error,
        code: error?.response?.status || 500,
        message: error?.response?.data?.detail || error?.response?.data?.message || error?.message || `CVE #${cveId} 업데이트 실패`,
        config: {
          ...(error?.config || {}),
          skipAuthRefresh: options?.skipAuthRefresh ?? false
        }
      };
      
      throw enhancedError;
    }
  }

  /**
   * CVE의 특정 필드를 업데이트합니다.
   * @param {string} cveId - CVE ID
   * @param {string} fieldName - 필드 이름
   * @param {any} fieldValue - 필드 값
   * @param {Object} options - 요청 옵션
   * @returns {Promise<Object>} 업데이트된 CVE 데이터
   */
  async updateCVEField(cveId, fieldName, fieldValue, options = {}) {
    if (!cveId) {
      logger.warn('cveService', 'updateCVEField 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    if (!fieldName) {
      logger.warn('cveService', 'updateCVEField 호출 시 fieldName이 없습니다');
      throw new Error('필드 이름은 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 필드 업데이트 요청', { 
        cveId, 
        field: fieldName, 
        value: fieldValue 
      });
      
      // 업데이트할 데이터 구성
      const updateData = {
        [fieldName]: fieldValue
      };
      
      // 요청 옵션 설정
      const requestOptions = {
        ...(options || {}),
        skipAuthRefresh: options?.skipAuthRefresh ?? false
      };
      
      // PATCH 요청 보내기
      const response = await api.patch(`/cves/${cveId}`, updateData, requestOptions);
      
      logger.info('cveService', 'CVE 필드 업데이트 성공', { 
        cveId,
        field: fieldName,
        status: response.status,
        statusText: response.statusText
      });
      
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 필드 업데이트 실패', { 
        cveId, 
        field: fieldName,
        value: fieldValue,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // 에러 객체 강화 (config 정보 보존)
      const enhancedError = {
        ...error,
        code: error?.response?.status || 500,
        message: error?.response?.data?.detail || error?.response?.data?.message || error?.message || `CVE #${cveId} 필드 업데이트 실패`,
        config: {
          ...(error?.config || {}),
          skipAuthRefresh: options?.skipAuthRefresh ?? false
        }
      };
      
      throw enhancedError;
    }
  }

  /**
   * CVE 상태 업데이트
   * @param {string} cveId - CVE ID
   * @param {string} status - 업데이트할 상태 값
   * @returns {Promise<Object>} 업데이트된 CVE 데이터
   */
  async updateCVEStatus(cveId, status) {
    if (!cveId) {
      logger.warn('cveService', 'updateCVEStatus 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    if (!status) {
      logger.warn('cveService', 'updateCVEStatus 호출 시 status가 없습니다');
      throw new Error('상태 값은 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 상태 업데이트 요청', { cveId, status });
      
      // MongoDB ObjectId 형식인지 확인
      const isObjectId = cveId.length === 24 && /^[0-9a-f]+$/.test(cveId);
      
      // CVE ID 형식인지 확인 (CVE-YYYY-NNNNN)
      const isCveIdFormat = /^CVE-\d{4}-\d+$/.test(cveId);
      
      // 실제 사용할 ID 결정
      let actualId = cveId;
      let mongoId = null;
      
      // CVE ID 형식이고 MongoDB ObjectId가 아닌 경우, 먼저 CVE 상세 정보를 조회하여 MongoDB ObjectId를 얻습니다.
      if (isCveIdFormat && !isObjectId) {
        try {
          // CVE 상세 정보 조회
          const detailResponse = await api.get(`/cves/${cveId}`);
          if (detailResponse.data && detailResponse.data.id) {
            mongoId = detailResponse.data.id;
            logger.debug('cveService', 'CVE ID를 MongoDB ObjectId로 변환', { 
              cveId, 
              mongoId 
            });
          }
        } catch (detailError) {
          logger.warn('cveService', 'CVE 상세 정보 조회 실패', { 
            cveId, 
            error: detailError.message 
          });
        }
      } else if (isObjectId) {
        // 이미 MongoDB ObjectId 형식인 경우
        mongoId = cveId;
      }
      
      // 상태 필드만 업데이트하는 데이터 구조 생성
      const updateData = {
        status: status
      };
      
      // MongoDB ObjectId가 있는 경우 _id 필드 추가
      if (mongoId) {
        updateData._id = mongoId;
      }
      
      // 디버그 로깅 추가
      logger.debug('cveService', '상태 업데이트 요청 세부 정보', {
        cveId,
        isObjectId,
        isCveIdFormat,
        actualId,
        mongoId,
        url: `/cves/${actualId}`,
        method: 'PATCH',
        data: updateData
      });
      
      // axios 대신 fetch API 사용 (인터셉터 문제 우회)
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('인증 토큰이 없습니다');
      }
      
      const url = `/cves/${actualId}`;
      
      // 데이터를 스네이크 케이스로 변환
      const snakeCaseData = camelToSnake(updateData, { excludeFields: EXCLUDED_FIELDS });
      
      logger.debug('cveService', '실제 요청 정보', { 
        url, 
        method: 'PATCH',
        data: snakeCaseData
      });
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(snakeCaseData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `서버 오류: ${response.status}`);
      }
      
      const responseData = await response.json();
      
      // 응답 데이터를 카멜 케이스로 변환
      const camelCaseData = snakeToCamel(responseData, { excludeFields: EXCLUDED_FIELDS });
      
      logger.info('cveService', 'CVE 상태 업데이트 성공', { 
        cveId, 
        actualId,
        mongoId,
        status,
        responseStatus: response.status
      });
      
      return camelCaseData;
    } catch (error) {
      // 더 자세한 오류 로깅
      logger.error('cveService', 'CVE 상태 업데이트 실패', { 
        cveId, 
        status, 
        error: error.message,
        stack: error.stack
      });
      
      // 오류 메시지 개선
      const errorMessage = error.message || `CVE #${cveId} 상태 업데이트 실패`;
      throw new Error(errorMessage);
    }
  }

  /**
   * CVE 삭제
   * @param {string} cveId - CVE ID
   * @param {Object} options - 요청 옵션
   * @returns {Promise<boolean>} 성공 여부
   */
  async deleteCVE(cveId, options = {}) {
    if (!cveId) {
      logger.warn('cveService', 'deleteCVE 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 삭제 요청', { cveId });
      
      // 요청 옵션 설정
      const requestOptions = {
        ...(options || {}),
        skipAuthRefresh: options?.skipAuthRefresh ?? false
      };
      
      // DELETE 요청 보내기
      const response = await api.delete(`/cves/${cveId}`, { ...requestOptions });
      
      logger.info('cveService', 'CVE 삭제 성공', { 
        cveId,
        status: response.status,
        statusText: response.statusText
      });
      
      // 참고: 이 서비스 레이어에서는 캐시 무효화를 직접 처리하지 않음
      // React Query의 useMutation 훅에서 onSuccess 콜백을 통해 캐시 무효화 처리
      // queryClient.invalidateQueries([QUERY_KEYS.CVE_LIST]) 형태로 처리해야 함
      
      return true; // 삭제 성공 시 true 반환
    } catch (error) {
      logger.error('cveService', 'CVE 삭제 실패', { 
        cveId, 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data // 서버에서 반환한 오류 데이터 추가
      });
      
      // 에러 객체 강화 (config 정보 보존)
      const enhancedError = {
        ...error,
        code: error?.response?.status || 500,
        message: error?.response?.data?.detail || error?.response?.data?.message || error?.message || `CVE #${cveId} 삭제 실패`,
        config: {
          ...(error?.config || {}),
          skipAuthRefresh: options?.skipAuthRefresh ?? false
        }
      };
      
      throw enhancedError;
    }
  }

  /**
   * CVE 전체 개수 조회 (필터링 없이 DB에 존재하는 모든 CVE 개수)
   * @returns {Promise<number>} 전체 CVE 개수
   */
  async getTotalCVECount() {
    try {
      logger.info('cveService', '전체 CVE 개수 조회 요청');
      const response = await api.get('/cves/total-count');
      logger.info('cveService', '전체 CVE 개수 조회 성공', { count: response.data.count });
      return response.data.count;
    } catch (error) {
      logger.error('cveService', '전체 CVE 개수 조회 실패', { error: error.message });
      throw this._handleError(error, '전체 CVE 개수 조회 실패');
    }
  }

  /**
   * 에러 핸들링 공통 메서드
   * @private
   * @param {Error} error - 발생한 에러
   * @param {string} defaultMessage - 기본 에러 메시지
   * @returns {Error} 처리된 에러
   */
  _handleError(error, defaultMessage = '요청 실패') {
    // axios 오류 형태 확인
    if (error.response) {
      // 서버 응답이 있지만 2xx 외의 상태 코드
      const statusCode = error.response.status;
      const serverMessage = error.response.data?.message || error.response.data?.error || '알 수 없는 서버 오류';
      
      // 특정 상태 코드에 따른 처리
      switch (statusCode) {
        case 400:
          return new Error(`잘못된 요청: ${serverMessage}`);
        case 401:
          return new Error('인증이 필요합니다');
        case 403:
          return new Error('권한이 없습니다');
        case 404:
          return new Error('자원을 찾을 수 없습니다');
        case 409:
          return new Error(`충돌 발생: ${serverMessage}`);
        case 422:
          return new Error(`유효성 검사 실패: ${serverMessage}`);
        case 500:
          return new Error(`서버 오류: ${serverMessage}`);
        default:
          return new Error(`${defaultMessage}: ${serverMessage} (${statusCode})`);
      }
    } else if (error.request) {
      // 요청은 보냈지만 응답이 없음
      return new Error('서버에서 응답이 없습니다. 네트워크 연결을 확인하세요.');
    } else {
      // 요청 설정 중 오류
      return new Error(`${defaultMessage}: ${error.message}`);
    }
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
const cveService = new CVEService();
export default cveService;
