import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import authReducer from './slices/authSlice';
import notificationReducer from './slices/notificationSlice';
import cveReducer from './slices/cveSlice';
import websocketReducer from './slices/websocketSlice';
import { injectStore } from '../utils/auth';
import { createTransform } from 'redux-persist';

// RESET_STORE 액션을 처리하는 루트 리듀서 생성
const appReducer = combineReducers({
  auth: authReducer,
  notifications: notificationReducer,
  cve: cveReducer,
  websocket: websocketReducer,
});

// 스토어 초기화를 위한 루트 리듀서 래퍼
const rootReducer = (state, action) => {
  if (action.type === 'RESET_STORE') {
    state = undefined;
  }
  return appReducer(state, action);
};

// Redux Persist 설정
const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  whitelist: ['auth'],
  transforms: [
    createTransform(
      (inboundState, key) => inboundState,
      (outboundState, key) => {
        if (key === 'auth' && !localStorage.getItem('accessToken')) {
          return {
            ...outboundState,
            user: null,
            isAuthenticated: false,
            isInitialized: true
          };
        }
        return outboundState;
      }
    )
  ]
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// Store 설정
export const store = configureStore({
  reducer: persistedReducer,
  devTools: process.env.NODE_ENV !== 'production',
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    }),
});

// auth.js에 store 주입
injectStore(store);

// persistor export
export const persistor = persistStore(store);

// 상태 정규화 및 정리
const preloadedState = {
  cves: {
    byId: {}, // ID를 키로 사용하는 객체
    allIds: [], // ID 목록
    status: 'idle',
    error: null
  }
};

// API 응답을 정규화하는 유틸리티 함수 추가
const normalizeData = (items) => {
  const byId = {};
  const allIds = [];
  
  items.forEach(item => {
    byId[item.cveId] = item;
    allIds.push(item.cveId);
  });
  
  return { byId, allIds };
};
