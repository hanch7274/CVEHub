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
        await dispatch(getCurrentUserThunk());
      }
    };

    initAuth();
  }, [dispatch, token, user]);

  const login = async (email, password) => {
    try {
      await dispatch(loginThunk({ email, password })).unwrap();
      await dispatch(getCurrentUserThunk());
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      dispatch(logoutAction());
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const value = {
    user,
    login,
    logout,
    loading,
    error,
    isAuthenticated
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
