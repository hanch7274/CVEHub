import { AxiosRequestConfig } from 'axios';

/**
 * 인증 관련 타입 정의 파일
 */

/**
 * 사용자 인터페이스
 */
export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  profileImage?: string;
  role?: string;
  createdAt?: string | Date;
  lastLogin?: string | Date;
}

/**
 * 로그인 요청 인터페이스
 */
export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * 로그인 응답 인터페이스
 */
export interface LoginResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  expiresIn?: number;
}

/**
 * 로그인 응답 데이터 인터페이스
 */
export interface LoginResponseData {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  user?: User;
}

/**
 * 회원가입 요청 인터페이스
 */
export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}

/**
 * 토큰 갱신 요청 인터페이스
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * 토큰 갱신 응답 인터페이스
 */
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * 인증 컨텍스트 인터페이스
 */
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: Error | null;
  login: (credentials: LoginRequest) => Promise<LoginResponse>;
  loginAsync: (credentials: LoginRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  logoutAsync: () => Promise<void>;
  refreshToken: (refreshToken?: string) => Promise<void>;
  refreshTokenAsync: (refreshToken?: string) => Promise<void>;
  accessToken: string | null;
}

/**
 * 토큰 페이로드 인터페이스
 */
export interface TokenPayload {
  sub: string; // 사용자 ID
  username: string;
  exp: number; // 만료 시간 (timestamp)
  iat: number; // 발급 시간 (timestamp)
  role?: string;
}

/**
 * 사용자 정보 업데이트 인터페이스
 */
export interface UserUpdate {
  email?: string;
  displayName?: string;
  profileImage?: string;
  password?: string;
  currentPassword?: string;
}

/**
 * 커스텀 Axios 요청 설정 인터페이스
 */
export interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  skipTransform?: boolean;
  useCache?: boolean;
  cacheMaxAge?: number;
  skipAuthRefresh?: boolean;
  metadata?: {
    requestTime: Date;
  };
}