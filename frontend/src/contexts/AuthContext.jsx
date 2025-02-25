import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginThunk, getCurrentUserThunk, logout as logoutAction } from '../store/slices/authSlice';
import WebSocketService from '../services/websocket';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const dispatch = useDispatch();
  const { user, loading: reduxLoading, isAuthenticated: reduxIsAuthenticated, error, token } = useSelector(state => state.auth);
  
  // 로컬 상태 추가
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(reduxIsAuthenticated);
  const [accessToken, setAccessToken] = useState(token);

  // Redux 상태가 변경될 때 로컬 상태 동기화
  useEffect(() => {
    setIsAuthenticated(reduxIsAuthenticated);
    setAccessToken(token);
  }, [reduxIsAuthenticated, token]);

  useEffect(() => {
    const initAuth = async () => {
      if (token && !user) {
        try {
          await dispatch(getCurrentUserThunk());
        } catch (error) {
          console.error('사용자 정보 초기화 오류:', error);
        }
      }
    };

    initAuth();
  }, [dispatch, token, user]);

  const login = async (email, password) => {
    try {
      setLoading(true);
      const result = await dispatch(loginThunk({ email, password })).unwrap();
      
      // WebSocket 연결 초기화
      try {
        await WebSocketService.connect();
      } catch (error) {
        console.error('WebSocket 초기 연결 실패:', error);
        // WebSocket 연결 실패는 로그인 실패로 처리하지 않음
      }
      
      setLoading(false);
      return result;
    } catch (error) {
      setLoading(false);
      console.error('로그인 오류:', error);
      throw error;
    }
  };

  const logout = () => {
    WebSocketService.disconnect();  // WebSocket 연결 해제
    dispatch(logoutAction());
  };

  const value = {
    user,
    loading: loading || reduxLoading,
    isAuthenticated,
    error,
    login,
    logout,
    accessToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
