
import axios from 'axios';
import {
  User,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  SignUpRequest,
  TokenPayload,
  CustomAxiosRequestConfig,
  LoginResponseData
} from '../types';
import { QueryClient } from '@tanstack/react-query';
import api from 'shared/api/config/axios';
import { getRefreshToken, getUser, setUser } from 'shared/utils/storage/tokenStorage';
import { API_BASE_URL, API_ENDPOINTS } from 'config'
import {setAccessToken, setRefreshToken, clearAuthStorage, getAccessToken } from 'shared/utils/storage/tokenStorage'

// 전역 오류 핸들러와 QueryClient 참조 저장
let globalErrorHandler: ((error: Error, context?: string) => void) | null = null;
let globalQueryClient: QueryClient | null = null;

/**
 * 오류 핸들러 주입 - API 오류 처리를 위한 전역 핸들러 설정
 * @param handler - 오류 처리 함수 (error) => void
 */
export const injectErrorHandler = (handler: (error: Error, context?: string) => void): void => {
  if (typeof handler !== 'function') {
    console.warn('유효하지 않은 오류 핸들러입니다. 함수를 전달해주세요.');
    return;
  }
  
  globalErrorHandler = handler;
  console.log('오류 핸들러가 성공적으로 주입되었습니다.');
};

/**
 * React Query Client 주입 - 인증 관련 쿼리 캐시 관리
 * @param queryClient - React Query의 QueryClient 인스턴스
 */
export const injectQueryClient = (queryClient: QueryClient): void => {
  if (!queryClient || typeof queryClient.invalidateQueries !== 'function') {
    console.warn('유효하지 않은 QueryClient입니다. React Query의 QueryClient 인스턴스를 전달해주세요.');
    return;
  }
  
  globalQueryClient = queryClient;
  console.log('QueryClient가 성공적으로 주입되었습니다.');
};

/**
 * 내부용 오류 처리 함수
 * @param error - 처리할 오류 객체
 * @param context - 오류 발생 컨텍스트
 */
const handleError = (error: Error, context = ''): void => {
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
  const apiError = error as any;
  if (apiError?.response?.status === 401 && globalQueryClient) {
    globalQueryClient.invalidateQueries({queryKey: ['auth']});
  }
};

/**
 * 현재 사용자 정보 조회
 * @returns 사용자 정보
 */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    // 로컬 스토리지에서 사용자 정보 확인
    const cachedUser = getUser();
    
    // 캐시된 사용자 정보가 있으면 반환
    if (cachedUser) {
      return cachedUser as User;
    }
    
    // 서버에서 사용자 정보 조회
    const response = await api.get<User>('/auth/me');
    
    // 사용자 정보 캐시 업데이트
    if (response.data) {
      setUser(response.data);
    }
    
    return response.data;
  } catch (error) {
    handleError(error as Error, 'getCurrentUser');
    throw error;
  }
};

/**
 * 토큰 갱신 (자동 갱신 로직 적용)
 * @returns 새로 발급된 액세스 토큰
 */
export const refreshToken = async (): Promise<RefreshTokenResponse> => {
  const currentRefreshToken = getRefreshToken();
  
  if (!currentRefreshToken) {
    const error = new Error('사용 가능한 리프레시 토큰이 없습니다');
    handleError(error, 'refreshToken');
    throw error;
  }

  try {
    // api 인스턴스 대신 기본 axios 사용하여 순환 참조 방지
    const response = await axios.post<RefreshTokenResponse>(
      `${API_BASE_URL}${API_ENDPOINTS.AUTH.REFRESH}`, 
      {
        refresh_token: currentRefreshToken
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // 카멜케이스/스네이크케이스 필드명 모두 지원
    const accessToken = response.data.accessToken || (response.data as any).access_token;
    const refreshTokenValue = response.data.refreshToken || (response.data as any).refresh_token;
    const user = (response.data as any).user as User | undefined;
    
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
      globalQueryClient.invalidateQueries({queryKey: ['auth', 'user']});
    }

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: (response.data as any).expiresIn
    };
  } catch (error) {
    handleError(error as Error, 'refreshToken');

    const apiError = error as any;
    if (apiError.response?.status === 401 || apiError.response?.status === 403) {
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
 * 로그인 함수 타입 정의
 */
export type LoginFunction = (credentials: LoginRequest) => Promise<LoginResponse>;

/**
 * 사용자 로그인
 * @param credentials - 로그인 정보 (username, password)
 * @returns 로그인 결과 및 사용자 정보
 */
export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  try {
    // 디버깅용 로그 추가
    console.log('로그인 요청 데이터:', {
      username: credentials.username,
      password: '********' // 보안상 실제 비밀번호는 로깅하지 않음
    });

    // 로그인 요청 시 x-www-form-urlencoded 형식 사용
    // URLSearchParams 사용 (백엔드 API 요구사항)
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);
    // grant_type 필드 추가 (OAuth2 표준)
    formData.append('grant_type', 'password');
    
    // 요청 형식 로깅
    console.log('요청 형식:', formData.toString());
    console.log('요청 헤더:', {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    // 로그인 요청 전송 (axios 인터셉터 우회)
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      skipTransform: true,
      transformRequest: [(data: any) => data], // 데이터 변환 방지
      transformResponse: [(data: any) => {
        // 응답 데이터가 문자열인 경우 JSON으로 파싱
        if (typeof data === 'string') {
          try {
            return JSON.parse(data);
          } catch (e) {
            return data;
          }
        }
        return data;
      }]
    } as CustomAxiosRequestConfig;

    const response = await axios.post<LoginResponseData>(
      `${API_BASE_URL}/auth/token`, 
      formData, 
      axiosConfig
    );

    // 응답 데이터 로깅 (토큰 마스킹 처리)
    const responseData = response.data as LoginResponseData;
    console.log('로그인 응답 데이터:', {
      ...responseData,
      access_token: responseData.access_token ? '********' : undefined,
      accessToken: responseData.accessToken ? '********' : undefined,
      refresh_token: responseData.refresh_token ? '********' : undefined,
      refreshToken: responseData.refreshToken ? '********' : undefined,
      user: responseData.user || null
    });

    // 토큰 저장 (스네이크 케이스 또는 카멜 케이스 처리)
    const accessToken = responseData.access_token || responseData.accessToken;
    const refreshToken = responseData.refresh_token || responseData.refreshToken;

    if (!accessToken) {
      throw new Error('액세스 토큰이 응답에 없습니다.');
    }

    // 토큰 저장
    setAccessToken(accessToken);
    if (refreshToken) {
      setRefreshToken(refreshToken);
    }

    // 사용자 정보 저장
    const user = responseData.user;
    if (user) {
      setUser(user);
    }

    // 로그인 응답 반환
    return {
      user: user || {} as User,
      tokens: {
        accessToken,
        refreshToken: refreshToken || ''
      }
    };
  } catch (error) {
    // 에러 처리
    console.error('로그인 오류:', error);
    
    // HTTP 에러 처리
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      
      // 401 Unauthorized: 인증 실패 (잘못된 자격 증명)
      if (status === 401) {
        throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      }
      
      // 422 Unprocessable Entity: 필수 필드 누락 또는 잘못된 형식
      if (status === 422) {
        throw new Error('로그인 요청 형식이 올바르지 않습니다. 필수 필드가 누락되었거나 형식이 잘못되었습니다.');
      }
      
      // 기타 HTTP 에러
      throw new Error(`로그인 요청 실패 (${status}): ${error.response.data?.message || error.message}`);
    }
    
    // 네트워크 오류 등 기타 예외
    throw new Error(`로그인 중 오류가 발생했습니다: ${(error as Error).message}`);
  }
};

/**
 * 사용자 로그아웃
 */
export const logout = async (): Promise<void> => {
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
    handleError(error as Error, 'logout');
    // 오류가 발생해도 로컬 스토리지는 초기화
    clearAuthStorage();
    throw error;
  }
};

/**
 * 인증 상태 확인
 * @returns 인증 여부
 */
export const isAuthenticated = (): boolean => {
  return !!getAccessToken();
};

/**
 * 사용자 토큰 확인 및 유효성 검증
 * @returns 디코딩된 토큰 정보 또는 null
 */
export const checkTokenValidity = (): TokenPayload | null => {
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
    const payload = JSON.parse(atob(parts[1])) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    
    // 만료 시간 확인
    if (payload.exp && payload.exp < now) {
      console.warn('토큰이 만료되었습니다');
      return null;
    }
    
    return payload;
  } catch (error) {
    handleError(error as Error, 'checkTokenValidity');
    return null;
  }
};

/**
 * 사용자 회원가입
 * @param userData - 회원가입 정보
 * @returns 회원가입 결과
 */
export const register = async (userData: SignUpRequest): Promise<User> => {
  try {
    const response = await api.post<User>('/auth/signup', userData);
    return response.data;
  } catch (error) {
    handleError(error as Error, 'register');
    const apiError = error as any;
    throw apiError.response?.data?.detail || apiError.message || '회원가입 중 오류가 발생했습니다.';
  }
};

/**
 * 사용자 권한 확인
 * @param requiredRoles - 필요한 권한 목록
 * @returns 권한 보유 여부
 */
export const hasPermission = (requiredRoles: string[] = []): boolean => {
  try {
    const user = getUser() as User | null;
    
    // 사용자 정보가 없으면 권한 없음
    if (!user || !user.role) {
      return false;
    }
    
    // 필요한 권한이 지정되지 않았으면 인증만 확인
    if (!requiredRoles.length) {
      return isAuthenticated();
    }
    
    // 사용자가 필요한 권한을 하나라도 가지고 있는지 확인
    return requiredRoles.includes(user.role);
  } catch (error) {
    handleError(error as Error, 'hasPermission');
    return false;
  }
};

/**
 * 비밀번호 재설정 요청
 * @param email - 사용자 이메일
 * @returns 요청 결과
 */
export const requestPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post<{ success: boolean; message: string }>('/auth/reset-password', { email });
    return response.data;
  } catch (error) {
    handleError(error as Error, 'requestPasswordReset');
    const apiError = error as any;
    throw apiError.response?.data?.detail || apiError.message || '비밀번호 재설정 요청 중 오류가 발생했습니다.';
  }
};

/**
 * 비밀번호 변경
 * @param data - 비밀번호 변경 데이터 (token, password)
 * @returns 요청 결과
 */
export const resetPassword = async (data: { token: string; password: string }): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post<{ success: boolean; message: string }>('/auth/confirm-reset-password', data);
    return response.data;
  } catch (error) {
    handleError(error as Error, 'resetPassword');
    const apiError = error as any;
    throw apiError.response?.data?.detail || apiError.message || '비밀번호 변경 중 오류가 발생했습니다.';
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