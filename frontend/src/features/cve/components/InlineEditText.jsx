// InlineEditText.jsx
import React, { useState, useEffect } from 'react';
import { TextField, Typography, Box } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';

const InlineEditText = ({
  value,
  onSave,
  placeholder,
  multiline = false,
  disabled = false,
  maxHeight,
  fontSize = 'inherit',
  externalEdit = false,         // 외부에서 편집 모드를 제어하는 prop
  onEditingStart = () => {},
  onEditingEnd = () => {}
}) => {
  const [isEditing, setIsEditing] = useState(externalEdit);
  const [editedValue, setEditedValue] = useState(value || '');

  // 외부 prop이 변경되면 내부 상태를 업데이트
  useEffect(() => {
    setIsEditing(externalEdit);
  }, [externalEdit]);

  useEffect(() => {
    setEditedValue(value || '');
  }, [value]);

  const handleClick = (e) => {
    if (!disabled && !isEditing) {
      setIsEditing(true);
      onEditingStart();
    }
  };

  const handleBlur = () => {
    if (editedValue !== value) {
      onSave(editedValue);
    }
    setIsEditing(false);
    onEditingEnd();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !multiline) {
      if (editedValue !== value) {
        onSave(editedValue);
      }
      setIsEditing(false);
      onEditingEnd();
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
          fullWidth
          multiline={multiline}
          value={editedValue}
          onChange={(e) => setEditedValue(e.target.value)}
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
              height: '100%',
              overflow: 'auto',
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
