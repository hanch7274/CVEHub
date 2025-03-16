// cveService.js
import api from '../../api/config/axios';
import { API_BASE_URL } from '../../config';
import logger from '../../utils/logger';

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
        params.page = Number(filters.page) + 1; // 0부터 시작하는 페이지를 1부터 시작하는 페이지로 변환
      }
      
      if (filters.rowsPerPage !== undefined) {
        params.limit = filters.rowsPerPage;
      }
      
      // 검색어 처리
      if (filters.search) {
        params.search = filters.search;
      }
      
      // 정렬 처리
      if (filters.sortBy) {
        params.sortBy = filters.sortBy;
        params.sortOrder = filters.sortOrder || 'desc';
      }
      
      // 필터 처리 (severity, status 등)
      if (filters.filters) {
        Object.entries(filters.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params[key] = value;
          }
        });
      }
      
      // API 엔드포인트 선택 (/cves/list 사용)
      const endpoint = `${API_BASE_URL}/cves/list`;
      
      logger.info('cveService', '변환된 API 요청 파라미터', params);
      const response = await api.get(endpoint, {
        params
      });
      
      logger.info('cveService', '목록 조회 성공', { 
        count: response.data?.results?.length || 0,
        total: response.data?.pagination?.total || 0
      });
      return response.data;
    } catch (error) {
      logger.error('cveService', '목록 조회 실패', { error: error.message, filters });
      throw this._handleError(error, '목록 조회 실패');
    }
  }

  /**
   * CVE 상세 정보 조회
   * @param {string} cveId - CVE ID
   * @returns {Promise<Object>} 응답 데이터
   */
  async getCVEById(cveId) {
    if (!cveId) {
      logger.warn('cveService', 'getCVEById 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 상세 조회 요청', { cveId });
      const response = await api.get(`${API_BASE_URL}/cves/${cveId}`);
      logger.info('cveService', 'CVE 상세 조회 성공', { cveId });
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 상세 조회 실패', { cveId, error: error.message });
      throw this._handleError(error, `CVE #${cveId} 조회 실패`);
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
      const response = await api.get(`${API_BASE_URL}/cves/${cveId}`, {
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
   * CVE 생성
   * @param {Object} cveData - 생성할 CVE 데이터
   * @returns {Promise<Object>} 생성된 CVE 데이터
   */
  async createCVE(cveData) {
    if (!cveData) {
      logger.warn('cveService', 'createCVE 호출 시 cveData가 없습니다');
      throw new Error('CVE 데이터는 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 생성 요청', { data: cveData });
      const response = await api.post(`${API_BASE_URL}/cves`, cveData);
      logger.info('cveService', 'CVE 생성 성공', { id: response.data.id });
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 생성 실패', { error: error.message, data: cveData });
      throw this._handleError(error, 'CVE 생성 실패');
    }
  }

  /**
   * CVE 업데이트 (전체)
   * @param {string} cveId - CVE ID
   * @param {Object} updateData - 업데이트할 데이터
   * @returns {Promise<Object>} 업데이트된 CVE 데이터
   */
  async updateCVE(cveId, updateData) {
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
      // 백엔드에서 PATCH 메서드 사용하므로 일관성 유지
      const response = await api.patch(`${API_BASE_URL}/cves/${cveId}`, updateData);
      logger.info('cveService', 'CVE 업데이트 성공', { cveId });
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 업데이트 실패', { cveId, error: error.message, data: updateData });
      throw this._handleError(error, `CVE #${cveId} 업데이트 실패`);
    }
  }

  /**
   * CVE 필드 단위 업데이트
   * @param {string} cveId - CVE ID
   * @param {string} fieldName - 필드 이름
   * @param {any} fieldValue - 필드 값
   * @returns {Promise<Object>} 업데이트된 CVE 데이터
   */
  async updateCVEField(cveId, fieldName, fieldValue) {
    if (!cveId) {
      logger.warn('cveService', 'updateCVEField 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    if (!fieldName) {
      logger.warn('cveService', 'updateCVEField 호출 시 fieldName이 없습니다');
      throw new Error('필드 이름은 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 필드 업데이트 요청', { cveId, fieldName, fieldValue });
      // 백엔드에서 PATCH 메서드 사용하므로 일관성 유지
      const response = await api.patch(
        `${API_BASE_URL}/cves/${cveId}/fields/${fieldName}`,
        { value: fieldValue }
      );
      logger.info('cveService', 'CVE 필드 업데이트 성공', { cveId, fieldName });
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 필드 업데이트 실패', { 
        cveId, 
        fieldName, 
        fieldValue, 
        error: error.message 
      });
      throw this._handleError(error, `CVE #${cveId} ${fieldName} 필드 업데이트 실패`);
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
      // 필드 업데이트 API를 활용하여 상태만 업데이트
      const response = await api.patch(
        `${API_BASE_URL}/cves/${cveId}/fields/status`,
        { value: status }
      );
      logger.info('cveService', 'CVE 상태 업데이트 성공', { cveId, status });
      return response.data;
    } catch (error) {
      logger.error('cveService', 'CVE 상태 업데이트 실패', { 
        cveId, 
        status, 
        error: error.message 
      });
      throw this._handleError(error, `CVE #${cveId} 상태 업데이트 실패`);
    }
  }

  /**
   * CVE 삭제
   * @param {string} cveId - CVE ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async deleteCVE(cveId) {
    if (!cveId) {
      logger.warn('cveService', 'deleteCVE 호출 시 cveId가 없습니다');
      throw new Error('CVE ID는 필수 항목입니다');
    }

    try {
      logger.info('cveService', 'CVE 삭제 요청', { cveId });
      // DELETE 메서드 사용 (HTTP 메서드 일관성 유지)
      const response = await api.delete(`${API_BASE_URL}/cves/${cveId}`);
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
      throw this._handleError(error, `CVE #${cveId} 삭제 실패`);
    }
  }

  /**
   * CVE 검색
   * @param {string} searchTerm - 검색어
   * @param {Object} options - 검색 옵션 (페이지, 정렬 등)
   * @returns {Promise<Object>} 검색 결과
   */
  async searchCVEs(searchTerm, options = {}) {
    if (!searchTerm && Object.keys(options).length === 0) {
      logger.warn('cveService', 'searchCVEs 호출 시 검색어와 옵션이 모두 없습니다');
      throw new Error('검색어 또는 검색 옵션이 필요합니다');
    }

    try {
      // 검색 파라미터 구성
      const params = {
        q: searchTerm
      };

      // 옵션 처리
      if (options.page !== undefined) {
        params.page = Number(options.page) + 1; // 0부터 시작하는 페이지를 1부터 시작하는 페이지로 변환
      }
      
      if (options.limit !== undefined) {
        params.limit = options.limit;
      }
      
      if (options.sortBy) {
        params.sortBy = options.sortBy;
        params.sortOrder = options.sortOrder || 'desc';
      }
      
      // 필터 처리
      if (options.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params[key] = value;
          }
        });
      }

      // 검색 요청 파라미터 로깅 (디버깅 용이성 향상)
      logger.info('cveService', 'CVE 검색 요청', { 
        searchTerm, 
        params,
        endpoint: `${API_BASE_URL}/cves/search`
      });
      
      // GET 메서드 사용 (HTTP 메서드 일관성 유지)
      const response = await api.get(`${API_BASE_URL}/cves/search`, { params });
      
      // 검색 결과 로깅 (성공 케이스)
      logger.info('cveService', 'CVE 검색 성공', { 
        count: response.data?.results?.length || 0,
        total: response.data?.pagination?.total || 0,
        searchTerm,
        params // 요청 파라미터도 함께 로깅하여 디버깅 용이성 향상
      });
      
      return response.data;
    } catch (error) {
      // 검색 실패 로깅 (실패 케이스 - 상세 정보 포함)
      logger.error('cveService', 'CVE 검색 실패', { 
        searchTerm, 
        options, 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data, // 서버에서 반환한 오류 데이터 추가
        url: `${API_BASE_URL}/cves/search`, // 요청 URL 추가
        stack: error.stack // 스택 트레이스 추가 (디버깅 용이성 향상)
      });
      
      throw this._handleError(error, '검색 실패');
    }
  }

  /**
   * 전체 CVE 개수 조회 (필터링 없이 DB에 존재하는 모든 CVE 개수)
   * @returns {Promise<number>} 전체 CVE 개수
   */
  async getTotalCVECount() {
    try {
      logger.info('cveService', '전체 CVE 개수 조회 요청');
      const response = await api.get(`${API_BASE_URL}/cves/total-count`);
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
export const cveService = new CVEService();

// 클래스 자체도 내보내서 테스트에서 목킹하거나 커스텀 인스턴스 생성 가능하게 함
export default CVEService;
