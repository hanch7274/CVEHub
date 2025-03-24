import api from '../api/config/axios';
import { setAccessToken, setRefreshToken, getRefreshToken, getAccessToken, clearAuthStorage, setUser, getUser } from '../utils/storage/tokenStorage';
import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config';

// 전역 오류 핸들러와 QueryClient 참조 저장
let globalErrorHandler = null;
let globalQueryClient = null;

/**
 * 오류 핸들러 주입 - API 오류 처리를 위한 전역 핸들러 설정
 * @param {Function} handler - 오류 처리 함수 (error) => void
 */
export const injectErrorHandler = (handler) => {
  if (typeof handler !== 'function') {
    console.warn('유효하지 않은 오류 핸들러입니다. 함수를 전달해주세요.');
    return;
  }
  
  globalErrorHandler = handler;
  console.log('오류 핸들러가 성공적으로 주입되었습니다.');
};

/**
 * React Query Client 주입 - 인증 관련 쿼리 캐시 관리
 * @param {Object} queryClient - React Query의 QueryClient 인스턴스
 */
export const injectQueryClient = (queryClient) => {
  if (!queryClient || typeof queryClient.invalidateQueries !== 'function') {
    console.warn('유효하지 않은 QueryClient입니다. React Query의 QueryClient 인스턴스를 전달해주세요.');
    return;
  }
  
  globalQueryClient = queryClient;
  console.log('QueryClient가 성공적으로 주입되었습니다.');
};

/**
 * 내부용 오류 처리 함수
 * @param {Error} error - 처리할 오류 객체
 * @param {string} context - 오류 발생 컨텍스트
 */
const handleError = (error, context = '') => {
  // 개발 환경에서는 콘솔 로그 출력
  if (process.env.NODE_ENV === 'development') {
    console.error(`Auth 오류 [${context}]:`, error);
  }
  
  // 글로벌 오류 핸들러가 있으면 호출
  if (globalErrorHandler) {
    try {
      globalErrorHandler(error, context);
    } catch (handlerError) {
      console.error('오류 핸들러 실행 중 예외 발생:', handlerError);
    }
  }
  
  // 401 오류는 자동으로 인증 관련 캐시 무효화
  if (error?.response?.status === 401 && globalQueryClient) {
    globalQueryClient.invalidateQueries(['auth']);
  }
};

/**
 * 현재 사용자 정보 조회
 * @returns {Promise<Object>} 사용자 정보
 */
export const getCurrentUser = async () => {
  try {
    // 로컬 스토리지에서 사용자 정보 확인
    const cachedUser = getUser();
    
    // 캐시된 사용자 정보가 있으면 반환
    if (cachedUser) {
      return cachedUser;
    }
    
    // 서버에서 사용자 정보 조회
    const response = await api.get('/auth/me');
    
    // 사용자 정보 캐시 업데이트
    if (response.data) {
      setUser(response.data);
    }
    
    return response.data;
  } catch (error) {
    handleError(error, 'getCurrentUser');
    throw error;
  }
};

/**
 * 토큰 갱신 (자동 갱신 로직 적용)
 * @returns {Promise<string>} 새로 발급된 액세스 토큰
 */
export const refreshToken = async () => {
  const currentRefreshToken = getRefreshToken();
  
  if (!currentRefreshToken) {
    const error = new Error('사용 가능한 리프레시 토큰이 없습니다');
    handleError(error, 'refreshToken');
    throw error;
  }

  try {
    // api 인스턴스 대신 기본 axios 사용하여 순환 참조 방지
    const response = await axios.post(
      `${API_BASE_URL}${API_ENDPOINTS.AUTH.REFRESH}`, 
      {
        refresh_token: currentRefreshToken
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        skipAuthRefresh: true
      }
    );

    // 카멜케이스/스네이크케이스 필드명 모두 지원
    const accessToken = response.data.accessToken || response.data.access_token;
    const refreshTokenValue = response.data.refreshToken || response.data.refresh_token;
    const user = response.data.user;
    
    if (!accessToken) {
      const error = new Error('응답에 새 액세스 토큰이 없습니다');
      handleError(error, 'refreshToken');
      throw error;
    }

    setAccessToken(accessToken);
    if (refreshTokenValue) {
      setRefreshToken(refreshTokenValue);
    }
    if (user) {
      setUser(user);
    }

    // QueryClient가 있으면 관련 쿼리 갱신
    if (globalQueryClient) {
      globalQueryClient.invalidateQueries(['auth', 'user']);
    }

    return accessToken;
  } catch (error) {
    handleError(error, 'refreshToken');

    if (error.response?.status === 401 || error.response?.status === 403) {
      clearAuthStorage();
      
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
    }

    throw error;
  }
};

/**
 * 사용자 로그인
 * @param {Object} credentials - 로그인 정보 (email, password)
 * @returns {Promise<Object>} 로그인 결과 및 사용자 정보
 */
export const login = async (credentials) => {
  try {
    const formData = new URLSearchParams();
    formData.append('username', credentials.email);
    formData.append('password', credentials.password);

    const response = await api.post('/auth/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      skipTransform: true
    });

    // 카멜케이스/스네이크케이스 필드명 모두 지원
    const accessToken = response.data.accessToken || response.data.access_token;
    const refreshToken = response.data.refreshToken || response.data.refresh_token;
    const user = response.data.user;

    // 토큰 유효성 검사
    if (!accessToken || !user) {
      const error = new Error('유효하지 않은 응답 데이터: 액세스 토큰 또는 사용자 데이터 누락');
      handleError(error, 'login');
      throw error;
    }

    try {
      setAccessToken(accessToken);
      if (refreshToken) {
        setRefreshToken(refreshToken);
      }
      setUser(user);
      
      // QueryClient가 있으면 관련 쿼리 갱신
      if (globalQueryClient) {
        globalQueryClient.invalidateQueries(['auth', 'user']);
      }
    } catch (storageError) {
      handleError(storageError, 'login:storage');
      clearAuthStorage();
      throw new Error('인증 데이터 저장 실패');
    }

    return {
      user,
      isAuthenticated: true
    };
  } catch (error) {
    handleError(error, 'login');
    throw error.response?.data?.detail || error.message || '로그인 중 오류가 발생했습니다.';
  }
};

/**
 * 사용자 로그아웃
 * @returns {Promise<void>}
 */
export const logout = async () => {
  try {
    const refreshToken = getRefreshToken();
    // 서버에 로그아웃 요청 (토큰 무효화)
    await api.post('/auth/logout', { refresh_token: refreshToken });
    
    // 로컬 스토리지 초기화
    clearAuthStorage();
    
    // QueryClient가 있으면 관련 쿼리 초기화
    if (globalQueryClient) {
      globalQueryClient.clear();
    }
  } catch (error) {
    handleError(error, 'logout');
    // 오류가 발생해도 로컬 스토리지는 초기화
    clearAuthStorage();
    throw error;
  }
};

/**
 * 인증 상태 확인
 * @returns {boolean} 인증 여부
 */
export const isAuthenticated = () => {
  return !!getAccessToken();
};

/**
 * 사용자 토큰 확인 및 유효성 검증
 * @returns {Object|null} 디코딩된 토큰 정보 또는 null
 */
export const checkTokenValidity = () => {
  try {
    const token = getAccessToken();
    
    if (!token) {
      return null;
    }
    
    // JWT 토큰 파싱 (헤더.페이로드.서명)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('유효하지 않은 토큰 형식');
      return null;
    }
    
    // Base64 디코딩 및 JSON 파싱
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    // 만료 시간 확인
    if (payload.exp && payload.exp < now) {
      console.warn('토큰이 만료되었습니다');
      return null;
    }
    
    return payload;
  } catch (error) {
    handleError(error, 'checkTokenValidity');
    return null;
  }
};

/**
 * 사용자 회원가입
 * @param {Object} userData - 회원가입 정보
 * @returns {Promise<Object>} 회원가입 결과
 */
export const register = async (userData) => {
  try {
    const response = await api.post('/auth/signup', userData);
    return response.data;
  } catch (error) {
    handleError(error, 'register');
    throw error.response?.data?.detail || error.message || '회원가입 중 오류가 발생했습니다.';
  }
};

/**
 * 사용자 권한 확인
 * @param {Array<string>} requiredRoles - 필요한 권한 목록
 * @returns {boolean} 권한 보유 여부
 */
export const hasPermission = (requiredRoles = []) => {
  try {
    const user = getUser();
    
    // 사용자 정보가 없으면 권한 없음
    if (!user || !user.roles) {
      return false;
    }
    
    // 필요한 권한이 지정되지 않았으면 인증만 확인
    if (!requiredRoles.length) {
      return isAuthenticated();
    }
    
    // 사용자가 필요한 권한을 하나라도 가지고 있는지 확인
    return requiredRoles.some(role => user.roles.includes(role));
  } catch (error) {
    handleError(error, 'hasPermission');
    return false;
  }
};

/**
 * 비밀번호 재설정 요청
 * @param {string} email - 사용자 이메일
 * @returns {Promise<Object>} 요청 결과
 */
export const requestPasswordReset = async (email) => {
  try {
    const response = await api.post('/auth/reset-password', { email });
    return response.data;
  } catch (error) {
    handleError(error, 'requestPasswordReset');
    throw error.response?.data?.detail || error.message || '비밀번호 재설정 요청 중 오류가 발생했습니다.';
  }
};

/**
 * 비밀번호 변경
 * @param {Object} data - 비밀번호 변경 데이터 (token, password)
 * @returns {Promise<Object>} 요청 결과
 */
export const resetPassword = async (data) => {
  try {
    const response = await api.post('/auth/confirm-reset-password', data);
    return response.data;
  } catch (error) {
    handleError(error, 'resetPassword');
    throw error.response?.data?.detail || error.message || '비밀번호 변경 중 오류가 발생했습니다.';
  }
};

// 통합된 인증 서비스 내보내기
export default {
  injectErrorHandler,
  injectQueryClient,
  getCurrentUser,
  refreshToken,
  login,
  logout,
  isAuthenticated,
  register,
  checkTokenValidity,
  hasPermission,
  requestPasswordReset,
  resetPassword
};