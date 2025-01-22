import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  TextField,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress
} from '@mui/material';
import { api } from '../../../utils/auth';
import { debounce } from 'lodash';

const MentionInput = ({ value, onChange, ...props }) => {
  const [mentionSearch, setMentionSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [mentionAnchorEl, setMentionAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef(null);

  // 멘션 검색 디바운스 처리
  const searchUsers = useCallback(
    debounce(async (query) => {
      try {
        setLoading(true);
        const response = await api.get('/users/search', {
          params: { query }
        });
        setSuggestions(response.data);
      } catch (error) {
        console.error('사용자 검색 중 오류 발생:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const handleInputChange = (event) => {
    const newValue = event.target.value;
    const cursorPos = event.target.selectionStart;
    setCursorPosition(cursorPos);

    // 현재 커서 위치 이전의 텍스트에서 @ 찾기
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtSymbol !== -1) {
      // @ 기호가 있으면 검색어 추출
      const searchText = textBeforeCursor.slice(lastAtSymbol);
      setMentionSearch(searchText);
      searchUsers(searchText);
      
      // 멘션 제안 팝업 위치 설정
      const { current: input } = inputRef;
      if (input) {
        const { offsetLeft, offsetTop, offsetHeight } = input;
        const position = cursorPos - lastAtSymbol;
        const charWidth = 8; // 대략적인 문자 너비
        
        setMentionAnchorEl({
          clientWidth: 0,
          clientHeight: 0,
          getBoundingClientRect: () => ({
            top: offsetTop + offsetHeight,
            left: offsetLeft + (position * charWidth),
            right: offsetLeft + (position * charWidth),
            bottom: offsetTop + offsetHeight,
            width: 0,
            height: 0,
          }),
        });
      }
    } else {
      setMentionSearch('');
      setMentionAnchorEl(null);
    }

    onChange(event);
  };

  const handleMentionClick = async (username) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = value.slice(cursorPosition);

    const newText = textBeforeCursor.slice(0, lastAtSymbol) + 
                   `@${username} ` + 
                   textAfterCursor;

    onChange({ target: { value: newText } });
    setMentionAnchorEl(null);
  };

  // @ 입력 시 초기 사용자 목록 로드
  useEffect(() => {
    if (mentionAnchorEl) {
      searchUsers('');
    }
  }, [mentionAnchorEl]);

  return (
    <>
      <TextField
        {...props}
        value={value}
        onChange={handleInputChange}
        ref={inputRef}
        multiline
        fullWidth
      />
      <Popper
        open={Boolean(mentionAnchorEl)}
        anchorEl={mentionAnchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300, width: inputRef.current?.offsetWidth }}
      >
        <Paper elevation={3}>
          <List sx={{ maxHeight: '200px', overflow: 'auto' }}>
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
    </>
  );
};

export default MentionInput;
