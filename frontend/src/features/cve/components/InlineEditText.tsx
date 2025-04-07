// InlineEditText.tsx
import React, { useState, useEffect, useRef, ChangeEvent, KeyboardEvent } from 'react';
import { TextField, Typography, Box, TextFieldProps } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';

interface InlineEditTextProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  maxHeight?: string | number;
  fontSize?: string | number;
  externalEdit?: boolean; // 외부에서 편집 모드를 제어하는 prop
  onEditingStart?: () => void;
  onEditingEnd?: () => void;
}

const InlineEditText: React.FC<InlineEditTextProps> = ({
  value,
  onSave,
  placeholder = '입력하세요...',
  multiline = false,
  disabled = false,
  maxHeight,
  fontSize = 'inherit',
  externalEdit = false,
  onEditingStart = () => {},
  onEditingEnd = () => {}
}) => {
  const [isEditing, setIsEditing] = useState(externalEdit);
  const [editedValue, setEditedValue] = useState(value || '');
  const textFieldRef = useRef<HTMLDivElement | null>(null);

  // 외부 prop이 변경되면 내부 상태를 업데이트
  useEffect(() => {
    setIsEditing(externalEdit);
  }, [externalEdit]);

  useEffect(() => {
    setEditedValue(value || '');
  }, [value]);

  // 텍스트 필드의 높이를 조정하는 함수
  const adjustTextFieldHeight = (): void => {
    if (multiline && textFieldRef.current) {
      const inputElement = textFieldRef.current.querySelector('textarea');
      if (inputElement) {
        // 자동 높이 조정 로직
        inputElement.style.height = 'auto';
        inputElement.style.height = `${inputElement.scrollHeight}px`;
      }
    }
  };

  // 편집 모드 변경 시 높이 조정
  useEffect(() => {
    if (isEditing) {
      adjustTextFieldHeight();
    }
  }, [isEditing, editedValue]);

  const handleClick = (e: React.MouseEvent): void => {
    if (!disabled && !isEditing) {
      setIsEditing(true);
      onEditingStart();
    }
  };

  const handleBlur = (): void => {
    if (editedValue !== value) {
      onSave(editedValue);
    }
    setIsEditing(false);
    onEditingEnd();
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && !multiline) {
      if (editedValue !== value) {
        onSave(editedValue);
      }
      setIsEditing(false);
      onEditingEnd();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setEditedValue(e.target.value);
    // 값이 변경될 때마다 높이 조정 (멀티라인인 경우)
    if (multiline) {
      setTimeout(adjustTextFieldHeight, 0);
    }
  };

  return (
    <Box
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        width: '100%',
        height: '100%',
      }}
    >
      {isEditing ? (
        <TextField
          inputRef={textFieldRef}
          fullWidth
          multiline={multiline}
          value={editedValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyPress={handleKeyPress}
          autoFocus
          variant="standard"
          InputProps={{
            sx: {
              fontSize: fontSize,
              '&:before, &:after': { display: 'none' },
            },
          }}
          sx={{
            '& .MuiInputBase-root': {
              padding: '4px 8px',
              bgcolor: 'background.paper',
              borderRadius: 1,
              width: '100%',
              overflow: multiline ? 'hidden' : 'auto',
            },
          }}
        />
      ) : (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            p: '4px 8px',
            height: '100%',
            overflow: 'hidden', // 스크롤 표시 안함
          }}
        >
          <Typography
            sx={{
              flex: 1,
              fontSize: fontSize,
              whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value || placeholder}
          </Typography>
          {!disabled && (
            <EditIcon
              className="edit-icon"
              sx={{
                fontSize: 16,
                opacity: 0,
                transition: 'opacity 0.2s',
                color: 'text.secondary',
                mt: 0.5,
                flexShrink: 0,
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default InlineEditText;