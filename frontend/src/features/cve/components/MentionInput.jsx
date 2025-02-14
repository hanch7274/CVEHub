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

const MentionInput = React.memo(({ value, onChange, onSubmit, placeholder, loading, users }) => {
  const [search, setSearch] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // 멘션 검색 디바운스 처리 (300ms)
  const searchUsers = useCallback(
    debounce(async (query) => {
      // 검색어가 2자 미만이면 API 호출하지 않음
      if (!query || query.length < 2) {
        setSuggestions(users || []);
        return;
      }

      try {
        const response = await api.get('/user/search', {
          params: { query: query.replace('@', '') }
        });
        setSuggestions(response.data);
      } catch (error) {
        console.error('사용자 검색 중 오류 발생:', error);
        setSuggestions([]);
      }
    }, 300),
    [users]
  );

  // 팝업 위치 계산 함수 수정
  const calculatePopperPosition = useCallback((input, cursorPos, lastAtSymbol) => {
    if (!input) return null;

    // 텍스트 영역의 정보 가져오기
    const inputElement = input.querySelector('textarea');
    if (!inputElement) return null;

    // 캐럿 위치 계산을 위한 임시 요소 생성
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.padding = window.getComputedStyle(inputElement).padding;
    mirror.style.width = window.getComputedStyle(inputElement).width;
    mirror.style.font = window.getComputedStyle(inputElement).font;
    mirror.style.lineHeight = window.getComputedStyle(inputElement).lineHeight;

    // 캐럿 위치까지의 텍스트 복사
    const textBeforeCursor = inputElement.value.substring(0, cursorPos);
    mirror.textContent = textBeforeCursor;

    // 캐럿 위치 표시를 위한 span 요소 추가
    const caretSpan = document.createElement('span');
    mirror.appendChild(caretSpan);

    // 임시 요소를 body에 추가하여 위치 계산
    document.body.appendChild(mirror);
    const caretRect = caretSpan.getBoundingClientRect();
    const inputRect = inputElement.getBoundingClientRect();
    document.body.removeChild(mirror);

    // 실제 위치 반환
    return {
      getBoundingClientRect: () => ({
        top: inputRect.top + caretRect.height,
        left: inputRect.left + (caretRect.left - inputRect.left),
        right: inputRect.left + (caretRect.left - inputRect.left),
        bottom: inputRect.top + caretRect.height,
        width: 0,
        height: 0,
      }),
    };
  }, []);

  const handleInputChange = useCallback((event) => {
    // 즉시 onChange 호출하여 입력 지연 방지
    onChange(event);

    const newValue = event.target.value;
    const cursorPos = event.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    setCursorPosition(cursorPos);

    if (lastAtSymbol !== -1) {
      const searchText = textBeforeCursor.slice(lastAtSymbol);
      
      // 검색어가 변경된 경우에만 상태 업데이트
      setSearch(prevSearch => {
        if (prevSearch !== searchText) {
          // 검색어가 2자 이상일 때만 검색 실행
          if (searchText.length >= 2) {
            if (searchTimeoutRef.current) {
              clearTimeout(searchTimeoutRef.current);
            }
            searchTimeoutRef.current = setTimeout(() => {
              searchUsers(searchText);
            }, 300);
          }
          return searchText;
        }
        return prevSearch;
      });
      
      // 팝업 위치가 실제로 변경된 경우에만 업데이트
      setAnchorEl(prev => {
        const newAnchorEl = calculatePopperPosition(inputRef.current, cursorPos, lastAtSymbol);
        return newAnchorEl && prev?.getBoundingClientRect().left !== newAnchorEl.getBoundingClientRect().left
          ? newAnchorEl
          : prev;
      });
    } else {
      setSearch('');
      setAnchorEl(null);
    }
  }, [onChange, searchUsers, calculatePopperPosition]);

  const handleMentionClick = useCallback((username) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = value.slice(cursorPosition);
    const newText = textBeforeCursor.slice(0, lastAtSymbol) + 
                   `@${username} ` + 
                   textAfterCursor;

    setAnchorEl(null);
    onChange({ target: { value: newText } });
  }, [value, cursorPosition, onChange]);

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
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          value={value}
          onChange={handleInputChange}
          ref={inputRef}
          multiline
          fullWidth
          placeholder={placeholder}
          minRows={2}
          sx={{ 
            '& .MuiInputBase-root': { 
              minHeight: '80px'
            } 
          }}
        />
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={!value.trim() || loading}
          sx={{ 
            minHeight: '80px',
            alignSelf: 'stretch',
            width: '80px'
          }}
        >
          {loading ? <CircularProgress size={24} /> : '작성'}
        </Button>
      </Box>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ 
          zIndex: 1300,
          width: '200px',
        }}
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [200, 10],  // [x축, y축] - x축 값을 50px로 증가
            },
          },
          {
            name: 'preventOverflow',
            options: {
              boundary: 'viewport',
              padding: 8,
              altAxis: true,
            },
          },
          {
            name: 'flip',
            options: {
              fallbackPlacements: ['top-start'],
            },
          }
        ]}
      >
        <Paper 
          elevation={3}
          sx={{
            maxHeight: '200px',
            overflow: 'auto',
            width: '100%',
            backgroundColor: 'background.paper',
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
                      backgroundColor: 'action.hover',
                    }
                  }}
                >
                  <ListItemText primary={user.username} />
                </ListItem>
              ))
            ) : (
              <ListItem>
                <ListItemText primary="검색 결과가 없습니다." />
              </ListItem>
            )}
          </List>
        </Paper>
      </Popper>
    </div>
  );
});

export default MentionInput;
