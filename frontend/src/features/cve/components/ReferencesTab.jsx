import React, { useState } from 'react';
import {
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Fade,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Launch as LaunchIcon,
  Link as LinkIcon,
  Edit as EditIcon
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

const REFERENCE_TYPES = {
  ADVISORY: 'Advisory',
  EXPLOIT: 'Exploit',
  PATCH: 'Patch',
  ARTICLE: 'Article',
  OTHER: 'Other'
};

const DEFAULT_REFERENCE = {
  type: 'OTHER',
  url: '',
  description: ''
};

const ReferencesTab = ({ cve, setSuccessMessage, currentUser }) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState(null);
  const [newReference, setNewReference] = useState(DEFAULT_REFERENCE);

  const handleAddClick = () => {
    setSelectedReference(null);
    setNewReference(DEFAULT_REFERENCE);
    setOpen(true);
  };

  const handleEditClick = (reference, index) => {
    setSelectedReference({ ...reference, id: index });
    setOpen(true);
  };

  const handleDeleteReference = async (referenceIndex) => {
    try {
      setLoading(true);
      setError(null);

      const updatedReferences = (cve.references || []).filter((_, index) => index !== referenceIndex);
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { references: updatedReferences }
      })).unwrap();

      if (response && response.references) {
        setSuccessMessage('참조가 삭제되었습니다.');
      }
    } catch (error) {
      console.error('Failed to delete reference:', error);
      // HTTP 403 에러 처리
      if (error.status === 403) {
        setError('관리자만 삭제할 수 있습니다.');
      } else {
        setError('참조 삭제 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddReference = async () => {
    try {
      setLoading(true);
      setError(null);

      const referenceToAdd = {
        ...newReference,
        date_added: new Date().toISOString(),
        added_by: currentUser?.username || 'anonymous'
      };

      const updatedReferences = [...(cve.references || []), referenceToAdd];
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { references: updatedReferences }
      })).unwrap();

      if (response && response.references) {
        setSuccessMessage('참조가 추가되었습니다.');
        setOpen(false);
        setNewReference(DEFAULT_REFERENCE);
      }
    } catch (error) {
      console.error('Failed to add reference:', error);
      setError('참조 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReference = async () => {
    if (!selectedReference) return;

    try {
      setLoading(true);
      setError(null);

      const updatedReferences = (cve.references || []).map((ref, index) =>
        index === selectedReference.id ? { ...selectedReference } : ref
      );

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { references: updatedReferences }
      })).unwrap();

      if (response && response.references) {
        setSuccessMessage('참조가 수정되었습니다.');
        setOpen(false);
        setSelectedReference(null);
      }
    } catch (error) {
      console.error('Failed to update reference:', error);
      setError('참조 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (selectedReference) {
      handleUpdateReference();
    } else {
      handleAddReference();
    }
  };

  return (
    <>
      <ListHeader>
        <Typography variant="h6" color="text.primary">
          References ({cve.references?.length || 0})
        </Typography>
        <ActionButton
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
        >
          Add Reference
        </ActionButton>
      </ListHeader>

      {(!cve.references || cve.references.length === 0) ? (
        <EmptyState>
          <LinkIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" gutterBottom>
            No References Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            There are no references linked to this CVE yet.
          </Typography>
        </EmptyState>
      ) : (
        cve.references.map((reference, index) => (
          <StyledListItem key={`reference-${index}`} elevation={0}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, mr: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={
                      <ChipLabel>
                        <LinkIcon sx={{ fontSize: 16 }} />
                        {REFERENCE_TYPES[reference.type] || reference.type || 'External'}
                      </ChipLabel>
                    }
                    size="small"
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Open URL" arrow>
                    <ActionIconButton
                      size="small"
                      component="a"
                      href={reference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <LaunchIcon />
                    </ActionIconButton>
                  </Tooltip>
                </Box>
                {reference.description && (
                  <Typography variant="body2" color="text.secondary">
                    {reference.description}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Edit" arrow>
                  <ActionIconButton
                    size="small"
                    onClick={() => handleEditClick(reference, index)}
                  >
                    <EditIcon />
                  </ActionIconButton>
                </Tooltip>
                <Tooltip title="Delete" arrow>
                  <ActionIconButton
                    size="small"
                    onClick={() => handleDeleteReference(index)}
                  >
                    <DeleteIcon />
                  </ActionIconButton>
                </Tooltip>
              </Box>
            </Box>
          </StyledListItem>
        ))
      )}

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSelectedReference(null);
          setNewReference(DEFAULT_REFERENCE);
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
        <DialogTitle>{selectedReference ? '참조 수정' : '참조 추가'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>유형</InputLabel>
            <Select
              value={selectedReference ? selectedReference.type : newReference.type}
              onChange={(e) => {
                if (selectedReference) {
                  setSelectedReference({
                    ...selectedReference,
                    type: e.target.value
                  });
                } else {
                  setNewReference({
                    ...newReference,
                    type: e.target.value
                  });
                }
              }}
              label="유형"
            >
              {Object.entries(REFERENCE_TYPES).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="URL"
            value={selectedReference ? selectedReference.url : newReference.url}
            onChange={(e) => {
              if (selectedReference) {
                setSelectedReference({
                  ...selectedReference,
                  url: e.target.value
                });
              } else {
                setNewReference({
                  ...newReference,
                  url: e.target.value
                });
              }
            }}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="설명"
            value={selectedReference ? selectedReference.description : newReference.description}
            onChange={(e) => {
              if (selectedReference) {
                setSelectedReference({
                  ...selectedReference,
                  description: e.target.value
                });
              } else {
                setNewReference({
                  ...newReference,
                  description: e.target.value
                });
              }
            }}
            multiline
            rows={2}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpen(false);
            setSelectedReference(null);
            setNewReference(DEFAULT_REFERENCE);
          }}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading}
          >
            {selectedReference ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ReferencesTab;
