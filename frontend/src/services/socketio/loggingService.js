/**
 * 중앙화된 로깅 시스템으로 리디렉션
 * 기존 코드와의 호환성을 위해 유지됨
 * 
 * @deprecated 대신 utils/logging을 사용하세요.
 */

import logger, { LOG_LEVEL } from '../../utils/logging';

// 기존 코드와의 호환성을 위해 LOG_LEVEL 내보내기
export { LOG_LEVEL };

// 기존 코드와의 호환성을 위해 로거 객체 내보내기
export default logger;
