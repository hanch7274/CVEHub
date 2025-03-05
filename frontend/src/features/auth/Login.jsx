import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useSnackbar } from 'notistack';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  FormControlLabel,
  Checkbox,
  Paper,
  InputAdornment,
  IconButton,
  Divider
} from '@mui/material';
import { Email, Lock, Visibility, VisibilityOff } from '@mui/icons-material';
import { loginThunk } from '../../store/slices/authSlice';

const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const { loading: authLoading, error: authError } = useSelector(state => state.auth);
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveId, setSaveId] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // 컴포넌트 마운트 상태를 추적하는 ref
  const isMounted = useRef(true);
  // 타이머 참조를 저장하는 ref
  const timerRef = useRef(null);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    // 컴포넌트 마운트 시 이벤트 리스너 정리
    window.addEventListener('beforeunload', cleanupBeforeUnload);
    
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setSaveId(true);
    }
    
    // 컴포넌트 언마운트 시 정리 작업
    return () => {
      isMounted.current = false;
      window.removeEventListener('beforeunload', cleanupBeforeUnload);
      
      // 타이머 정리
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      // 디버깅 정보
      console.log('[Login] 컴포넌트 언마운트, 리소스 정리 완료');
    };
  }, []);

  // 페이지 이탈 시 정리 함수
  const cleanupBeforeUnload = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  useEffect(() => {
    if (authError && isMounted.current) {
      setError(authError);
    }
  }, [authError]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSaveIdChange = (e) => {
    const checked = e.target.checked;
    setSaveId(checked);
    if (!checked) {
      localStorage.removeItem('savedEmail');
    } else {
      localStorage.setItem('savedEmail', formData.email);
    }
  };

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isMounted.current) return;
    
    setError('');
    setLoading(true);

    try {
      const result = await dispatch(loginThunk(formData)).unwrap();
      
      if (!isMounted.current) return;
      
      if (saveId) {
        localStorage.setItem('savedEmail', formData.email);
      }
      
      enqueueSnackbar('로그인에 성공했습니다.', {
        variant: 'success',
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'center',
        },
        autoHideDuration: 2000
      });
      
      // 메시지 채널이 닫히기 전에 비동기 작업을 완료하도록 타이머 설정
      timerRef.current = setTimeout(() => {
        if (isMounted.current) {
          navigate('/', { replace: true });
        }
      }, 100);

    } catch (err) {
      if (!isMounted.current) return;
      
      console.error('Login Error:', err);
      setError(err || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      
      enqueueSnackbar(err || '로그인 중 오류가 발생했습니다.', {
        variant: 'error',
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'center',
        },
        autoHideDuration: 3000
      });
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        bgcolor: '#F8F9FA',
        py: 4
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={3}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
            로그인
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="이메일"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={formData.email}
              onChange={handleChange}
              error={!!error}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Email />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="비밀번호"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              error={!!error}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={handleClickShowPassword}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            
            <FormControlLabel
              control={
                <Checkbox 
                  checked={saveId}
                  onChange={handleSaveIdChange}
                  color="primary"
                />
              }
              label="이메일 저장"
              sx={{ mt: 1 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading || authLoading}
            >
              {(loading || authLoading) ? <CircularProgress size={24} /> : '로그인'}
            </Button>

            <Divider sx={{ my: 2 }}>
              <Typography color="textSecondary" variant="body2">
                또는
              </Typography>
            </Divider>

            <Button
              component={Link}
              to="/signup"
              fullWidth
              variant="outlined"
              sx={{ mt: 1 }}
            >
              회원가입
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default Login;
