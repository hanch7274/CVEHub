import React from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  Button,
  Alert
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Launch as LaunchIcon
} from '@mui/icons-material';

const ReferencesTab = ({
  references = [],
  newReferenceUrl,
  setNewReferenceUrl,
  onAddReference,
  onDeleteReference,
  loading,
  error
}) => {
  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="URL을 입력하세요"
          value={newReferenceUrl}
          onChange={(e) => setNewReferenceUrl(e.target.value)}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddReference}
          disabled={loading || !newReferenceUrl}
        >
          추가
        </Button>
      </Box>
      <List>
        {references.map((url, index) => (
          <ListItem
            key={index}
            secondaryAction={
              <IconButton
                edge="end"
                onClick={() => onDeleteReference(index)}
                disabled={loading}
              >
                <DeleteIcon />
              </IconButton>
            }
          >
            <ListItemText
              primary={url}
              primaryTypographyProps={{
                component: 'a',
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer'
              }}
            />
            <IconButton
              size="small"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LaunchIcon />
            </IconButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default ReferencesTab;
