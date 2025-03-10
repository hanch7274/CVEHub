import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  TextField,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  ClickAwayListener
} from '@mui/material';
import { api } from '../../../utils/auth';
import { debounce } from 'lodash';

// ResizeObserver 오류 방지 함수
const preventResizeObserverError = () => {
  // ResizeObserver 루프 오류 방지를 위한 전역 핸들러
  window.addEventListener('error', (e) => {
    if (e.message === 'ResizeObserver loop limit exceeded' ||
        e.message.includes('ResizeObserver') ||
        e.message.includes('loop completed with undelivered notifications')) {
      e.stopImmediatePropagation();
      return true;
    }
    return false;
  });
};

const MentionInput = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  loading = false,
  fullWidth = true,
  multiline = true,
  rows = 3,
  variant = "outlined",
  size = "small"
}) => {
  const [query, setQuery] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [mentionSearchActive, setMentionSearchActive] = useState(false);
  const [popperWidth, setPopperWidth] = useState('auto');
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const popperRef = useRef(null);

  // 컴포넌트 마운트 시 ResizeObserver 오류 방지 함수 실행
  useEffect(() => {
    preventResizeObserverError();
  }, []);

  // 멘션 팝업 위치 설정을 위한 디바운스 함수
  const debouncedSetAnchorEl = useCallback(
    debounce((el) => {
      if (el) {
        setAnchorEl(el);
      }
    }, 150),
    [setAnchorEl]
  );

  // 멘션 검색 디바운스 처리 (300ms)
  const searchUsers = useCallback(
    debounce(async (searchQuery) => {
      try {
        const cleanQuery = searchQuery.trim();
        if (!cleanQuery) {
          setSuggestions([]);
          return;
        }

        const response = await api.get('/users/search', {
          params: { query: cleanQuery }
        });
        
        // 개발 환경에서만 로그 출력
        if (process.env.NODE_ENV === 'development') {
          console.log('[MentionInput] Search query:', cleanQuery);
          console.log('[MentionInput] Search results:', response.data);
        }
        
        if (Array.isArray(response.data)) {
          setSuggestions(response.data);
        } else {
          console.error('Invalid response format:', response.data);
          setSuggestions([]);
        }
      } catch (error) {
        console.error('Error searching users:', error);
        setSuggestions([]);
      }
    }, 300),
    [setSuggestions]
  );

  // 입력 요소의 너비를 측정하여 Popper 너비 설정
  useLayoutEffect(() => {
    if (inputRef.current && mentionSearchActive) {
      try {
        const width = inputRef.current.offsetWidth;
        setPopperWidth(width > 0 ? width : 'auto');
      } catch (e) {
        setPopperWidth('auto');
      }
    }
  }, [mentionSearchActive]);

  // 입력 처리
  const handleInputChange = useCallback((e) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    onChange(e);
    setCursorPosition(cursorPos);

    // @ 문자 이후의 텍스트 추출
    const textBeforeCursor = newText.slice(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtSymbol !== -1 && lastAtSymbol < cursorPos) {
      const searchText = textBeforeCursor.slice(lastAtSymbol + 1);
      // 한글, 영문, 숫자만 허용하는 정규식
      const validSearchPattern = /^[가-힣a-zA-Z0-9\s]*$/;
      
      if (validSearchPattern.test(searchText)) {
        setQuery(searchText);
        setMentionSearchActive(true);
        searchUsers(searchText);
        
        // requestAnimationFrame을 사용하여 브라우저 렌더링 사이클에 맞춰 실행
        requestAnimationFrame(() => {
          debouncedSetAnchorEl(inputRef.current);
        });
      } else {
        setMentionSearchActive(false);
        setAnchorEl(null);
        setSuggestions([]);
      }
    } else {
      setMentionSearchActive(false);
      setAnchorEl(null);
      setSuggestions([]);
    }
  }, [onChange, searchUsers, debouncedSetAnchorEl]);

  // 멘션 클릭 처리
  const handleMentionClick = useCallback((username) => {
    const textBeforeMention = value.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeMention.lastIndexOf('@');
    const textAfterMention = value.slice(cursorPosition);
    
    const newText = 
      textBeforeMention.slice(0, lastAtSymbol) + 
      `@${username} ` + 
      textAfterMention;
    
    onChange({ target: { value: newText } });
    setMentionSearchActive(false);
    setAnchorEl(null);
    setSuggestions([]);
  }, [value, cursorPosition, onChange]);

  // 포커스가 외부로 이동했을 때 팝업 닫기
  const handleClickAway = useCallback(() => {
    setMentionSearchActive(false);
    setAnchorEl(null);
    setSuggestions([]);
  }, []);

  // Enter 키 처리 함수 추가
  const handleKeyDown = useCallback((e) => {
    // multiline이 true일 때는 Shift + Enter로 줄바꿈
    // multiline이 false일 때는 Enter로 제출
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      if (onSubmit && value.trim()) {
        onSubmit(value);
      }
    }
    
    // ESC 키로 멘션 팝업 닫기
    if (e.key === 'Escape' && mentionSearchActive) {
      e.preventDefault();
      setMentionSearchActive(false);
      setAnchorEl(null);
      setSuggestions([]);
    }
  }, [onSubmit, value, multiline, mentionSearchActive]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      // searchTimeoutRef.current를 로컬 변수에 저장하지 않고 직접 참조해도 됨
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      // 디바운스 함수 취소
      debouncedSetAnchorEl.cancel();
      searchUsers.cancel();
    };
  }, [debouncedSetAnchorEl, searchUsers]);

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <div style={{ position: 'relative' }}>
        <TextField
          fullWidth={fullWidth}
          multiline={multiline}
          rows={rows}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          variant={variant}
          size={size}
          inputRef={inputRef}
          disabled={loading}
        />
        {mentionSearchActive && Boolean(anchorEl) && suggestions.length > 0 && (
          <Popper
            open={true}
            anchorEl={anchorEl}
            placement="bottom-start"
            style={{ width: popperWidth, zIndex: 1300 }}
            ref={popperRef}
            modifiers={[
              {
                name: 'preventOverflow',
                options: {
                  boundary: document.body,
                  altAxis: true
                }
              },
              {
                name: 'flip',
                options: {
                  fallbackPlacements: ['top-start', 'bottom-end', 'top-end']
                }
              },
              {
                name: 'offset',
                options: {
                  offset: [0, 2]
                }
              }
            ]}
            transition
            disablePortal={false}
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
                {loading ? (
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
    </ClickAwayListener>
  );
};

export default MentionInput;
