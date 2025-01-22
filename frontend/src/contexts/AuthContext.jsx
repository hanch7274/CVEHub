import React, { createContext, useContext, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginThunk, getCurrentUserThunk, logout as logoutAction } from '../store/authSlice';

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
  const { user, loading, isAuthenticated, error, token } = useSelector(state => state.auth);

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
      const result = await dispatch(loginThunk({ email, password })).unwrap();
      if (!result.accessToken) {
        throw new Error('로그인 응답에 토큰이 없습니다.');
      }
      return result;
    } catch (error) {
      console.error('로그인 오류:', error);
      throw error?.message || '로그인 중 오류가 발생했습니다.';
    }
  };

  const logout = () => {
    dispatch(logoutAction());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        error,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
