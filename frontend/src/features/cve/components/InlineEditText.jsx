import React, { useState, useEffect } from 'react';
import { TextField, Typography, Box } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';

const InlineEditText = ({ value, onSave, placeholder, multiline = false, disabled = false }) => {
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
          onChange={(e) => {
            console.log('TextField value changing:', e.target.value);
            setEditedValue(e.target.value);
          }}
          onBlur={handleBlur}
          onKeyPress={handleKeyPress}
          autoFocus
          variant="standard"
          InputProps={{
            sx: {
              fontSize: 'inherit',
              '&:before, &:after': {
                display: 'none'
              }
            }
          }}
          sx={{
            '& .MuiInputBase-root': {
              padding: '4px 8px',
              bgcolor: 'background.paper',
              borderRadius: 1
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
            minHeight: '32px'
          }}
        >
          <Typography
            sx={{
              flex: 1,
              minHeight: multiline ? '3em' : 'auto',
              whiteSpace: multiline ? 'pre-wrap' : 'normal'
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
                mt: 0.5
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default InlineEditText; 