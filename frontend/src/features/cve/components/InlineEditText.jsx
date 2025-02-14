import React, { useState, useEffect } from 'react';
import { TextField, Typography, Box } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';

const InlineEditText = ({ value, onSave, placeholder, multiline = false, disabled = false, maxHeight, fontSize = 'inherit' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(value || '');

  useEffect(() => {
    setEditedValue(value || '');
  }, [value]);

  const handleClick = (e) => {
    console.log('Click event triggered');
    console.log('Disabled:', disabled);
    console.log('Current isEditing:', isEditing);
    
    if (!disabled) {
      console.log('Setting isEditing to true');
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    console.log('Blur event triggered');
    if (editedValue !== value) {
      console.log('Saving new value:', editedValue);
      onSave(editedValue);
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !multiline) {
      console.log('Enter key pressed');
      if (editedValue !== value) {
        console.log('Saving new value:', editedValue);
        onSave(editedValue);
      }
      setIsEditing(false);
    }
  };

  return (
    <Box
      onClick={handleClick}
      onMouseDown={(e) => {
        console.log('MouseDown event triggered');
        e.stopPropagation();
      }}
      sx={{
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        width: '100%',
        height: '100%',
        '&:hover': !disabled && {
          '& .edit-icon': {
            opacity: 1
          },
          bgcolor: 'action.hover',
          borderRadius: 1
        }
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
              '&:before, &:after': {
                display: 'none'
              }
            }
          }}
          sx={{
            '& .MuiInputBase-root': {
              padding: '4px 8px',
              bgcolor: 'background.paper',
              borderRadius: 1,
              width: '100%',
              height: '100%',
              overflow: 'auto'
            }
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
            overflow: 'auto'
          }}
        >
          <Typography
            sx={{
              flex: 1,
              fontSize: fontSize,
              whiteSpace: multiline ? 'pre-wrap' : 'normal',
              wordBreak: 'break-word'
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
                flexShrink: 0
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default InlineEditText; 