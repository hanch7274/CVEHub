import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.jsx';  // .jsx 확장자 명시
import logger, { LOG_LEVEL } from './utils/logging';

// 로그 레벨 설정 (개발 환경에서 INFO 레벨로 설정하여 로그 양 감소)
if (process.env.NODE_ENV === 'development') {
  logger.setLogLevel(LOG_LEVEL.DEBUG);
  logger.setEnabled(true);
  console.log('[App] 로깅 시스템 초기화 - 개발 환경에서 INFO 레벨로 설정됨');
} else {
  logger.setLogLevel(LOG_LEVEL.WARN);
  logger.setEnabled(true);
  console.log('[App] 로깅 시스템 초기화 - 프로덕션 환경에서 WARN 레벨로 설정됨');
}

// 로컬 스토리지 초기화
// localStorage.clear();

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
