/**
 * API 관련 타입 정의 파일
 */

/**
 * API 응답 기본 인터페이스
 */
export interface ApiResponse<T = any> {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
    errorCode?: string;
  }
  
  /**
   * 페이지네이션 정보 인터페이스
   */
  export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
  }
  
  /**
   * 페이지네이션 응답 인터페이스
   */
  export interface PaginatedResponse<T = any> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    pagination?: PaginationInfo;
  }
  
  /**
   * API 요청 옵션 인터페이스
   */
  export interface ApiRequestOptions {
    skipAuthRefresh?: boolean;
    bypassCache?: boolean;
    headers?: Record<string, string>;
    meta?: Record<string, any>;
  }
  
  /**
   * API 에러 인터페이스
   */
  export interface ApiError extends Error {
    status?: number;
    code?: number | string;
    response?: {
      data?: {
        detail?: string;
        message?: string;
        errorCode?: string;
      };
      status?: number;
    };
  }
  
  /**
   * API 상태 코드 타입
   */
  export type StatusCode = 
    | 200 // OK
    | 201 // Created
    | 204 // No Content
    | 400 // Bad Request
    | 401 // Unauthorized
    | 403 // Forbidden
    | 404 // Not Found
    | 409 // Conflict
    | 422 // Unprocessable Entity
    | 500 // Internal Server Error
    | 503; // Service Unavailable