import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import {
  TextField,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Box,
  TextFieldProps
} from '@mui/material';
import api from 'shared/api/config/axios';
import logger from 'shared/utils/logging';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash';

// 사용자 타입 정의
interface User {
  username: string;
  displayName?: string;
  [key: string]: any;
}

// 멘션 사용자 타입 정의
export interface MentionUser {
  id: string;
  display: string;
}

// 컴포넌트 Props 타입 정의
interface MentionInputProps {
  value: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
  variant?: TextFieldProps['variant'];
  size?: TextFieldProps['size'];
  users?: MentionUser[];
  inputRef?: React.RefObject<HTMLDivElement>;
}

// 멘션 상태 타입 정의
interface MentionState {
  active: boolean;
  query: string;
  startPos: number;
}

// ResizeObserver 오류 방지 함수
const preventResizeObserverError = (): void => {
  // ResizeObserver 루프 오류 방지를 위한 전역 핸들러
  window.addEventListener('error', (e: ErrorEvent) => {
    if (e.message === 'ResizeObserver loop limit exceeded' ||
        e.message.includes('ResizeObserver') ||
        e.message.includes('loop completed with undelivered notifications')) {
      e.stopImmediatePropagation();
      return true;
    }
    return false;
  });
};

const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  loading = false,
  fullWidth = true,
  multiline = true,
  rows = 3,
  variant = "outlined",
  size = "small",
  users = [],
  inputRef: externalInputRef
}) => {
  const [inputValue, setInputValue] = useState<string>(value || '');
  const [mentionState, setMentionState] = useState<MentionState>({ active: false, query: '', startPos: 0 });
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const internalInputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = externalInputRef || internalInputRef;
  const queryClient = useQueryClient();
  const lastSearchRef = useRef<string>('');

  // 디바운스된 검색 함수 생성
  const debouncedSearch = useRef(
    debounce(async (query: string) => {
      if (!query || query.length < 2 || query === lastSearchRef.current) {
        return;
      }
      
      lastSearchRef.current = query;
      setSearchLoading(true);
      
      try {
        // 외부에서 전달받은 users가 있는 경우 사용
        if (users && users.length > 0) {
          const filteredUsers = users
            .filter(user => user.id.toLowerCase().includes(query.toLowerCase()) || 
                           user.display.toLowerCase().includes(query.toLowerCase()))
            .map(user => ({
              username: user.id,
              displayName: user.display
            }));
          
          setSuggestions(filteredUsers);
          setSearchLoading(false);
          return;
        }
        
        // 외부 users가 없는 경우 API 호출
        // 캐시에서 검색 결과 확인
        const cacheKey = ['auth', 'search', query];
        const cachedResults = queryClient.getQueryData<User[]>(cacheKey);
        
        if (cachedResults) {
          setSuggestions(cachedResults);
          setSearchLoading(false);
          return;
        }
        
        const response = await api.get('/auth/search', {
          params: { query }
        });
        
        // 개발 환경에서만 로그 출력
        if (process.env.NODE_ENV === 'development') {
          logger.debug('[MentionInput] Search query:', query);
          logger.debug('[MentionInput] Search results:', response.data);
        }
        
        // 응답 데이터 안전하게 처리
        const responseData = response.data || [];
        
        if (Array.isArray(responseData)) {
          setSuggestions(responseData);
          // 결과를 캐시에 저장
          queryClient.setQueryData(cacheKey, responseData);
        } else {
          logger.error('[MentionInput] Invalid response format:', response.data);
          setSuggestions([]);
        }
      } catch (error) {
        logger.error('[MentionInput] Search error:', error);
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300) // 300ms 디바운스
  ).current;

  // 멘션 쿼리가 변경될 때 검색 실행
  useEffect(() => {
    if (mentionState.active && mentionState.query) {
      const cleanQuery = mentionState.query.trim();
      if (cleanQuery.length >= 2) {
        debouncedSearch(cleanQuery);
      } else if (cleanQuery.length === 0) {
        setSuggestions([]);
      }
    }
    
    return () => {
      debouncedSearch.cancel(); // 컴포넌트 언마운트 시 디바운스 취소
    };
  }, [mentionState.query, debouncedSearch]);

  // 컴포넌트 마운트 시 ResizeObserver 오류 방지 함수 실행
  useEffect(() => {
    preventResizeObserverError();
  }, []);

  // 입력 요소의 너비를 측정하여 Popper 너비 설정
  useLayoutEffect(() => {
    if (inputRef.current && mentionState.active) {
      try {
        const width = inputRef.current.offsetWidth;
        setAnchorEl(inputRef.current);
      } catch (e) {
        setAnchorEl(null);
      }
    }
  }, [mentionState.active]);

  // 입력 처리
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setInputValue(newText);
    setMentionState((prev) => ({ ...prev, startPos: cursorPos }));

    // @ 문자 이후의 텍스트 추출
    const textBeforeCursor = newText.slice(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtSymbol !== -1 && lastAtSymbol < cursorPos) {
      const searchText = textBeforeCursor.slice(lastAtSymbol + 1);
      // 한글, 영문, 숫자만 허용하는 정규식
      const validSearchPattern = /^[가-힣a-zA-Z0-9\s]*$/;
      
      if (validSearchPattern.test(searchText)) {
        setMentionState((prev) => ({ ...prev, active: true, query: searchText }));
      } else {
        setMentionState((prev) => ({ ...prev, active: false, query: '' }));
        setAnchorEl(null);
        setSuggestions([]);
      }
    } else {
      setMentionState((prev) => ({ ...prev, active: false, query: '' }));
      setAnchorEl(null);
      setSuggestions([]);
    }
    
    if (onChange) {
      onChange(newText);
    }
  }, [onChange]);

  // 멘션 클릭 처리
  const handleMentionClick = useCallback((username: string) => {
    const textBeforeMention = inputValue.slice(0, mentionState.startPos);
    const lastAtSymbol = textBeforeMention.lastIndexOf('@');
    const textAfterMention = inputValue.slice(mentionState.startPos);
    
    const newText = 
      textBeforeMention.slice(0, lastAtSymbol) + 
      `@${username} ` + 
      textAfterMention;
    
    setInputValue(newText);
    setMentionState((prev) => ({ ...prev, active: false, query: '' }));
    setAnchorEl(null);
    setSuggestions([]);
    
    if (onChange) {
      onChange(newText);
    }
  }, [inputValue, mentionState.startPos, onChange]);

  // 포커스가 외부로 이동했을 때 팝업 닫기
  const handleClickAway = useCallback(() => {
    setMentionState((prev) => ({ ...prev, active: false, query: '' }));
    setAnchorEl(null);
    setSuggestions([]);
  }, []);

  // Enter 키 처리 함수 추가
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    // multiline이 true일 때는 Shift + Enter로 줄바꿈
    // multiline이 false일 때는 Enter로 제출
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      if (onSubmit && inputValue.trim()) {
        onSubmit(inputValue);
      }
    }
    
    // ESC 키로 멘션 팝업 닫기
    if (e.key === 'Escape' && mentionState.active) {
      e.preventDefault();
      setMentionState((prev) => ({ ...prev, active: false, query: '' }));
      setAnchorEl(null);
      setSuggestions([]);
    }
  }, [onSubmit, inputValue, multiline, mentionState.active]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      debouncedSearch.cancel(); // 컴포넌트 언마운트 시 디바운스 취소
    };
  }, [debouncedSearch]);

  return (
    <Box onClick={handleClickAway}>
      <div style={{ position: 'relative' }}>
        <TextField
          fullWidth={fullWidth}
          multiline={multiline}
          rows={rows}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          variant={variant}
          size={size}
          inputRef={inputRef}
          disabled={loading}
        />
        {mentionState.active && Boolean(anchorEl) && suggestions.length > 0 && (
          <Popper
            open={true}
            anchorEl={anchorEl}
            placement="bottom-start"
            style={{ width: 'auto', zIndex: 1300 }}
          >
            <Paper 
              elevation={3}
              sx={{
                maxHeight: '200px',
                overflow: 'auto',
                mt: 1
              }}
            >
              <List>
                {searchLoading ? (
                  <ListItem>
                    <CircularProgress size={20} />
                  </ListItem>
                ) : suggestions.length > 0 ? (
                  suggestions.map((user) => (
                    <ListItem
                      key={user.username}
                      button
                      onClick={() => handleMentionClick(user.username)}
                      sx={{
                        '&:hover': {
                          backgroundColor: 'action.hover'
                        }
                      }}
                    >
                      <ListItemText 
                        primary={user.username}
                        secondary={user.displayName || user.username}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: 'medium'
                        }}
                        secondaryTypographyProps={{
                          variant: 'caption'
                        }}
                      />
                    </ListItem>
                  ))
                ) : (
                  <ListItem>
                    <ListItemText 
                      primary="검색 결과가 없습니다."
                      sx={{ textAlign: 'center', color: 'text.secondary' }}
                    />
                  </ListItem>
                )}
              </List>
            </Paper>
          </Popper>
        )}
      </div>
    </Box>
  );
};

export default MentionInput;