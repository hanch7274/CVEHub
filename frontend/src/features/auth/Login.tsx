import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { 
  Container,
  Box,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  IconButton,
  InputAdornment,
  Paper,
  CircularProgress,
  Alert,
  Divider,
  Link
} from '@mui/material';
import { Email, Lock, Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { LoginRequest, AuthContextType, LoginResponse } from 'features/auth/types';

interface FormData {
  email: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const auth = useAuth();
  const { loginAsync, loading: authLoading, error: authError } = auth as AuthContextType;
  
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [saveId, setSaveId] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // 컴포넌트 마운트 상태를 추적하는 ref
  const isMounted = useRef<boolean>(true);
  // 타이머 참조를 저장하는 ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    // 컴포넌트 마운트 시 이벤트 리스너 정리
    window.addEventListener('beforeunload', cleanupBeforeUnload);
    
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setSaveId(true);
    }
    
    return () => {
      isMounted.current = false;
      window.removeEventListener('beforeunload', cleanupBeforeUnload);
      
      // 타이머가 있으면 정리
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // 페이지 언로드 전 정리 함수
  const cleanupBeforeUnload = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  // 입력 필드 변경 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // 입력 시 에러 메시지 초기화
    if (error) setError('');
  };

  // 아이디 저장 체크박스 변경 핸들러
  const handleSaveIdChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSaveId(e.target.checked);
  };

  // 비밀번호 표시 토글 핸들러
  const handleTogglePasswordVisibility = (): void => {
    setShowPassword(prev => !prev);
  };

  // 로그인 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    // 필수 입력 필드 검증
    if (!formData.email || !formData.password) {
      setError('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    
    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('유효한 이메일 주소를 입력해주세요.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // 로그인 요청
      const loginRequest: LoginRequest = {
        username: formData.email, // API는 이메일을 username으로 받음
        password: formData.password
      };

      const response: LoginResponse = await loginAsync(loginRequest);
      
      // 아이디 저장 설정에 따라 저장 또는 삭제
      if (saveId) {
        localStorage.setItem('savedEmail', formData.email);
      } else {
        localStorage.removeItem('savedEmail');
      }
      
      // 로그인 성공 메시지 표시
      enqueueSnackbar('로그인에 성공했습니다.', { 
        variant: 'success',
        autoHideDuration: 3000
      });
      
      // 메인 페이지로 이동 (지연 적용)
      timerRef.current = setTimeout(() => {
        if (isMounted.current) {
          navigate('/');
        }
      }, 1000);
      
    } catch (err) {
      console.error('로그인 오류:', err);
      
      // 오류 메시지 설정
      const error = err as any; // 타입 단언
      
      if (error.response) {
        // 서버 응답이 있는 경우
        const status = error.response.status;
        
        if (status === 401) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (status === 429) {
          setError('너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.');
        } else {
          setError(error.response.data?.message || '로그인 중 오류가 발생했습니다.');
        }
      } else if (error.request) {
        // 요청은 보냈지만 응답이 없는 경우
        setError('서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.');
      } else {
        // 요청 설정 중 오류 발생
        setError('로그인 요청을 처리할 수 없습니다.');
      }
      
      // 오류 알림 표시
      enqueueSnackbar('로그인에 실패했습니다.', { 
        variant: 'error',
        autoHideDuration: 5000
      });
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  return (
    <Container maxWidth="sm" sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: '100vh',
      py: 4
    }}>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 4, 
          display: 'flex', 
          flexDirection: 'column',
          borderRadius: 2
        }}
      >
        <Box sx={{ mb: 3, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            로그인
          </Typography>
          <Typography variant="body2" color="text.secondary">
            CVE Hub에 오신 것을 환영합니다
          </Typography>
        </Box>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="이메일"
            name="email"
            autoComplete="email"
            autoFocus
            value={formData.email}
            onChange={handleChange}
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
                    onClick={handleTogglePasswordVisibility}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          
          <FormControlLabel
            control={
              <Checkbox 
                value="remember" 
                color="primary" 
                checked={saveId}
                onChange={handleSaveIdChange}
              />
            }
            label="아이디 저장"
          />
          
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2, py: 1.5 }}
            disabled={loading || authLoading}
          >
            {(loading || authLoading) ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              '로그인'
            )}
          </Button>
          
          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              또는
            </Typography>
          </Divider>
          
          <Box sx={{ mt: 1, textAlign: 'center' }}>
            <RouterLink to="/signup" style={{ textDecoration: 'none' }}>
              <Button
                fullWidth
                variant="outlined"
                color="primary"
              >
                회원가입
              </Button>
            </RouterLink>
            
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              <RouterLink to="/forgot-password" style={{ color: 'inherit' }}>
                비밀번호를 잊으셨나요?
              </RouterLink>
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default Login;