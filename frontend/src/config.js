// API 기본 URL
export const API_BASE_URL = process.env.REACT_APP_API_URL;

// WebSocket 기본 URL
export const WS_BASE_URL = process.env.REACT_APP_WS_URL;

// 기타 설정
export const DEFAULT_ERROR_MESSAGE = '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
export const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5분 (밀리초)
