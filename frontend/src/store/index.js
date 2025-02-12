import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import authReducer from './slices/authSlice';
import notificationReducer from './slices/notificationSlice';
import cveReducer from './slices/cveSlice';
import { injectStore } from '../utils/auth';
import { createTransform } from 'redux-persist';

// RESET_STORE 액션을 처리하는 루트 리듀서 생성
const appReducer = combineReducers({
  auth: authReducer,
  notifications: notificationReducer,
  cve: cveReducer,
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
