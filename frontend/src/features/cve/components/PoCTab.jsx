import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Launch as LaunchIcon
} from '@mui/icons-material';

const POC_SOURCES = {
  Etc: { label: 'Etc', color: 'default' },
  Metasploit: { label: 'Metasploit', color: 'secondary' },
  'Nuclei-Templates': { label: 'Nuclei Templates', color: 'primary' }
};

const PoCTab = ({
  pocs = [],
  newPoc,
  setNewPoc,
  pocDialogOpen,
  setPocDialogOpen,
  onAddPoc,
  onDeletePoc,
  onUpdatePoc,
  loading,
  error,
  editingPocId,
  editingPocData,
  setEditingPocId,
  setEditingPocData
}) => {
  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setPocDialogOpen(true)}
          disabled={loading}
        >
          PoC 추가
        </Button>
      </Box>

      <List>
        {pocs.map((poc) => (
          <ListItem
            key={poc.id}
            secondaryAction={
              <>
                <IconButton
                  edge="end"
                  onClick={() => {
                    setEditingPocId(poc.id);
                    setEditingPocData({ ...poc });
                  }}
                  disabled={loading}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  edge="end"
                  onClick={() => onDeletePoc(poc.id)}
                  disabled={loading}
                >
                  <DeleteIcon />
                </IconButton>
              </>
            }
          >
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={POC_SOURCES[poc.source]?.label || poc.source}
                    color={POC_SOURCES[poc.source]?.color || 'default'}
                    size="small"
                  />
                  {poc.url && (
                    <>
                      <Box component="span" sx={{ mx: 1 }}>
                        {poc.url}
                      </Box>
                      <IconButton
                        size="small"
                        href={poc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <LaunchIcon />
                      </IconButton>
                    </>
                  )}
                </Box>
              }
              secondary={poc.description}
            />
          </ListItem>
        ))}
      </List>

      <Dialog open={pocDialogOpen} onClose={() => setPocDialogOpen(false)}>
        <DialogTitle>PoC 추가</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>소스</InputLabel>
            <Select
              value={newPoc.source}
              onChange={(e) => setNewPoc({ ...newPoc, source: e.target.value })}
              label="소스"
            >
              {Object.entries(POC_SOURCES).map(([value, { label }]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="URL"
            value={newPoc.url}
            onChange={(e) => setNewPoc({ ...newPoc, url: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="설명"
            value={newPoc.description}
            onChange={(e) => setNewPoc({ ...newPoc, description: e.target.value })}
            multiline
            rows={4}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPocDialogOpen(false)}>취소</Button>
          <Button onClick={onAddPoc} variant="contained" disabled={loading}>
            추가
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!editingPocId}
        onClose={() => {
          setEditingPocId(null);
          setEditingPocData(null);
        }}
      >
        <DialogTitle>PoC 수정</DialogTitle>
        <DialogContent>
          {editingPocData && (
            <>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>소스</InputLabel>
                <Select
                  value={editingPocData.source}
                  onChange={(e) =>
                    setEditingPocData({
                      ...editingPocData,
                      source: e.target.value
                    })
                  }
                  label="소스"
                >
                  {Object.entries(POC_SOURCES).map(([value, { label }]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="URL"
                value={editingPocData.url}
                onChange={(e) =>
                  setEditingPocData({
                    ...editingPocData,
                    url: e.target.value
                  })
                }
                sx={{ mt: 2 }}
              />
              <TextField
                fullWidth
                label="설명"
                value={editingPocData.description}
                onChange={(e) =>
                  setEditingPocData({
                    ...editingPocData,
                    description: e.target.value
                  })
                }
                multiline
                rows={4}
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditingPocId(null);
              setEditingPocData(null);
            }}
          >
            취소
          </Button>
          <Button onClick={onUpdatePoc} variant="contained" disabled={loading}>
            수정
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PoCTab;
