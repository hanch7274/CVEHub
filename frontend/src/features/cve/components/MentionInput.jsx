import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  TextField,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Box
} from '@mui/material';
import api from 'shared/api/config/axios';
import logger from 'shared/utils/logging';
import { useQueryClient } from '@tanstack/react-query';
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
  const [inputValue, setInputValue] = useState(value || '');
  const [mentionState, setMentionState] = useState({ active: false, query: '', startPos: 0 });
  const [suggestions, setSuggestions] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const lastSearchRef = useRef('');

  // 디바운스된 검색 함수 생성
  const debouncedSearch = useRef(
    debounce(async (query) => {
      if (!query || query.length < 2 || query === lastSearchRef.current) {
        return;
      }
      
      lastSearchRef.current = query;
      setSearchLoading(true);
      
      try {
        // 캐시에서 검색 결과 확인
        const cacheKey = ['users', 'search', query];
        const cachedResults = queryClient.getQueryData(cacheKey);
        
        if (cachedResults) {
          setSuggestions(cachedResults);
          setSearchLoading(false);
          return;
        }
        
        const response = await api.get('/users/search', {
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
          // 결과를 캐시에 저장 (5분 동안 유효)
          queryClient.setQueryData(cacheKey, responseData, {
            cacheTime: 5 * 60 * 1000
          });
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
  const handleInputChange = useCallback((e) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart;
    
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
  }, []);

  // 멘션 클릭 처리
  const handleMentionClick = useCallback((username) => {
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
  }, [inputValue, mentionState.startPos]);

  // 포커스가 외부로 이동했을 때 팝업 닫기
  const handleClickAway = useCallback(() => {
    setMentionState((prev) => ({ ...prev, active: false, query: '' }));
    setAnchorEl(null);
    setSuggestions([]);
  }, []);

  // Enter 키 처리 함수 추가
  const handleKeyDown = useCallback((e) => {
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
