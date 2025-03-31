/**
 * 캐시 관련 API 서비스
 */
import axios from 'axios';
import { API_BASE_URL } from 'config';

/**
 * Redis 캐시 서버 정보 조회
 * @returns {Promise<Object>} 캐시 서버 정보
 */
export const getCacheInfo = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/cache/info`);
    return response.data;
  } catch (error) {
    console.error('캐시 서버 정보 조회 실패:', error);
    throw error;
  }
};

/**
 * Redis 캐시 통계 정보 조회
 * @returns {Promise<Object>} 캐시 통계 정보
 */
export const getCacheStats = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/cache/stats`);
    return response.data;
  } catch (error) {
    console.error('캐시 통계 정보 조회 실패:', error);
    throw error;
  }
};

/**
 * Redis 캐시 키 목록 조회
 * @param {Object} params 조회 파라미터
 * @param {string} [params.prefix] 캐시 키 프리픽스
 * @param {string} [params.pattern] 검색 패턴
 * @param {number} [params.limit] 최대 조회 개수
 * @returns {Promise<Object>} 캐시 키 목록
 */
export const getCacheKeys = async (params = {}) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/cache/keys`, { params });
    return response.data;
  } catch (error) {
    console.error('캐시 키 목록 조회 실패:', error);
    throw error;
  }
};

/**
 * Redis 캐시 값 조회
 * @param {Object} params 조회 파라미터
 * @param {string} [params.prefix] 캐시 키 프리픽스
 * @param {string} [params.pattern] 검색 패턴
 * @param {number} [params.limit] 최대 조회 개수
 * @returns {Promise<Object>} 캐시 값 목록
 */
export const getCacheValues = async (params = {}) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/cache/values`, { params });
    return response.data;
  } catch (error) {
    console.error('캐시 값 조회 실패:', error);
    throw error;
  }
};

/**
 * Redis 캐시 삭제
 * @param {Object} params 삭제 파라미터
 * @param {string} [params.prefix] 캐시 키 프리픽스
 * @param {string} [params.pattern] 삭제할 키 패턴
 * @returns {Promise<Object>} 삭제 결과
 */
export const clearCache = async (params = {}) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/cache/clear`, { params });
    return response.data;
  } catch (error) {
    console.error('캐시 삭제 실패:', error);
    throw error;
  }
};
