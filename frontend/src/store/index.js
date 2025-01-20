import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import authReducer from './authSlice';
import { injectStore } from '../utils/auth';

// 루트 리듀서 생성
const rootReducer = combineReducers({
  auth: authReducer,
});

// Redux Persist 설정
const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  whitelist: ['auth'], // auth 상태만 persist
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// Store 설정
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

// auth.js에 store 주입
injectStore(store);

export const persistor = persistStore(store);
