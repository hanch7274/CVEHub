import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  TextField,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Box,
  Button
} from '@mui/material';
import { api } from '../../../utils/auth';
import { debounce } from 'lodash';

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
  const [search, setSearch] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [mentionSearchActive, setMentionSearchActive] = useState(false);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // 멘션 검색 디바운스 처리 (300ms)
  const searchUsers = useCallback(
    debounce(async (query) => {
      try {
        const cleanQuery = query.trim();
        if (!cleanQuery) {
          setSuggestions([]);
          return;
        }

        const response = await api.get('/user/search', {
          params: { query: cleanQuery }
        });
        console.log('[MentionInput] Search query:', cleanQuery);
        console.log('[MentionInput] Search results:', response.data);
        
        if (Array.isArray(response.data)) {
          setSuggestions(response.data);
        } else {
          console.error('Invalid response format:', response.data);
          setSuggestions([]);
        }
      } catch (error) {
        console.error('사용자 검색 중 오류 발생:', error);
        setSuggestions([]);
      }
    }, 300),
    []
  );

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
        setSearch(searchText);
        setMentionSearchActive(true);
        searchUsers(searchText);
        setAnchorEl(inputRef.current);
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
  }, [onChange, searchUsers]);

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
  }, [onSubmit, value, multiline]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
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
      <Popper
        open={mentionSearchActive && Boolean(anchorEl) && suggestions.length > 0}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{
          width: inputRef.current?.offsetWidth,
          zIndex: 1300
        }}
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
    </div>
  );
};

export default MentionInput;
