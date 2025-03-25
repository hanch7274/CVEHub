/**
 * 크롤러 관련 타입 정의 파일
 */
import { CVEBase } from './cve';

/** 
 * 단일 크롤러 정보 
 */
export interface Crawler {
  id: string;
  name: string;
  type: string;
}

/** 
 * 진행 상태 인터페이스 
 */
export interface ProgressState {
  stage: string;
  percent: number;
  message: string;
}

/** 
 * 업데이트된 CVEs 구조 
 */
export interface UpdatedCVEs {
  count: number;
  items: CVEBase[];
}

/** 
 * 크롤러 상태 API에서 가져온 구조
 */
export interface CrawlerStatusResponse {
  isRunning: boolean;
  lastUpdate: unknown;
  currentStatus?: {
    stage: string;
    stage_label?: string;
    percent?: number;
    message?: string;
  };
  results?: Record<string, any>;
}

/** 
 * 단계 정의 
 */
export interface StageInfo {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  backendValues: string[];
}

/**
 * 웹소켓 연결 상태 변경 이벤트 데이터
 */
export interface ConnectionStateChangeData {
  state: string;
  timestamp?: string;
  message?: string;
}
