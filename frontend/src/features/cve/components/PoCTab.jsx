import React, { useState } from 'react';
import {
  Typography,
  Chip,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Fade,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Launch as LaunchIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import {
  StyledListItem,
  ActionButton,
  ActionIconButton,
  ListHeader,
  ChipLabel,
  EmptyState
} from './CommonStyles';
import { useDispatch } from 'react-redux';
import { updateCVEDetail } from '../../../store/cveSlice';

const POC_SOURCES = {
  Etc: { label: 'Etc', color: 'default' },
  Metasploit: { label: 'Metasploit', color: 'secondary' },
  'Nuclei-Templates': { label: 'Nuclei Templates', color: 'primary' }
};

const DEFAULT_POC = {
  source: 'Etc',
  url: '',
  description: ''
};

const PoCTab = ({ cve, setSuccessMessage, currentUser }) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedPoc, setSelectedPoc] = useState(null);
  const [newPoc, setNewPoc] = useState(DEFAULT_POC);

  const handleAddClick = () => {
    setSelectedPoc(null);
    setOpen(true);
  };

  const handleEditClick = (poc) => {
    setSelectedPoc(poc);
    setOpen(true);
  };

  const handleAddPoc = async () => {
    try {
      setLoading(true);
      setError(null);

      const updatedPocs = [...(cve.pocs || []), newPoc];
      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { pocs: updatedPocs }
      })).unwrap();

      setSuccessMessage('PoC가 추가되었습니다.');
      setOpen(false);
      setNewPoc(DEFAULT_POC);
    } catch (error) {
      setError('PoC 추가 중 오류가 발생했습니다.');
      console.error('Failed to add PoC:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePoc = async (pocIndex) => {
    try {
      setLoading(true);
      setError(null);

      const updatedPocs = (cve.pocs || []).filter((_, index) => index !== pocIndex);
      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { pocs: updatedPocs }
      })).unwrap();

      setSuccessMessage('PoC가 삭제되었습니다.');
    } catch (error) {
      setError('PoC 삭제 중 오류가 발생했습니다.');
      console.error('Failed to delete PoC:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePoc = async () => {
    if (!selectedPoc) return;

    try {
      setLoading(true);
      setError(null);

      const updatedPocs = (cve.pocs || []).map((poc, index) =>
        index === selectedPoc.id ? selectedPoc : poc
      );

      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { pocs: updatedPocs }
      })).unwrap();

      setSuccessMessage('PoC가 수정되었습니다.');
      setOpen(false);
      setSelectedPoc(null);
    } catch (error) {
      setError('PoC 수정 중 오류가 발생했습니다.');
      console.error('Failed to update PoC:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column'
    }}>
      <ListHeader>
        <Typography variant="h6" color="text.primary">
          Proof of Concept ({cve.pocs?.length || 0})
        </Typography>
        <ActionButton
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
        >
          Add PoC
        </ActionButton>
      </ListHeader>

      {(!cve.pocs || cve.pocs.length === 0) ? (
        <EmptyState>
          <CodeIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" gutterBottom>
            No PoCs Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            There are no proof of concept codes available for this CVE yet.
          </Typography>
        </EmptyState>
      ) : (
        <Box sx={{ 
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}>
          {cve.pocs.map((poc, index) => (
            <StyledListItem 
              key={`poc-${poc.id || index}`} 
              elevation={0}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={
                      <ChipLabel>
                        <CodeIcon sx={{ fontSize: 16 }} />
                        {POC_SOURCES[poc.source]?.label || poc.source}
                      </ChipLabel>
                    }
                    size="small"
                    variant="outlined"
                    color={POC_SOURCES[poc.source]?.color || 'default'}
                  />
                  <Typography variant="body2">
                    {poc.url}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Open URL" arrow>
                    <ActionIconButton
                      size="small"
                      component="a"
                      href={poc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <LaunchIcon />
                    </ActionIconButton>
                  </Tooltip>
                  <Tooltip title="Edit" arrow>
                    <ActionIconButton
                      size="small"
                      onClick={() => handleEditClick({ ...poc, id: index })}
                    >
                      <EditIcon />
                    </ActionIconButton>
                  </Tooltip>
                  <Tooltip title="Delete" arrow>
                    <ActionIconButton
                      size="small"
                      onClick={() => handleDeletePoc(index)}
                    >
                      <DeleteIcon />
                    </ActionIconButton>
                  </Tooltip>
                </Box>
              </Box>
              {poc.description && (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  {poc.description}
                </Typography>
              )}
            </StyledListItem>
          ))}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSelectedPoc(null);
        }}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: {
            borderRadius: 3
          }
        }}
      >
        <DialogTitle>
          {selectedPoc ? 'Edit PoC' : 'Add PoC'}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Source</InputLabel>
            <Select
              value={selectedPoc ? selectedPoc.source : newPoc.source}
              onChange={(e) => {
                if (selectedPoc) {
                  setSelectedPoc({ ...selectedPoc, source: e.target.value });
                } else {
                  setNewPoc({ ...newPoc, source: e.target.value });
                }
              }}
              label="Source"
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
            value={selectedPoc ? selectedPoc.url : newPoc.url}
            onChange={(e) => {
              if (selectedPoc) {
                setSelectedPoc({ ...selectedPoc, url: e.target.value });
              } else {
                setNewPoc({ ...newPoc, url: e.target.value });
              }
            }}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={selectedPoc ? selectedPoc.description : newPoc.description}
            onChange={(e) => {
              if (selectedPoc) {
                setSelectedPoc({ ...selectedPoc, description: e.target.value });
              } else {
                setNewPoc({ ...newPoc, description: e.target.value });
              }
            }}
            multiline
            rows={4}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpen(false);
            setSelectedPoc(null);
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={selectedPoc ? handleUpdatePoc : handleAddPoc}
            disabled={loading}
          >
            {selectedPoc ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PoCTab;
