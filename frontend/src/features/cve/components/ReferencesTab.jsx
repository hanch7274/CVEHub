import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
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
import { updateCVEDetail, fetchCVEDetail } from '../../../store/slices/cveSlice';
import { useWebSocketMessage } from '../../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../../services/websocket';
import { useSnackbar } from 'notistack';

const REFERENCE_TYPES = {
  NVD: 'NVD',
  EXPLOIT: 'Exploit',
  PATCH: 'Patch',
  OTHER: 'Other'
};

// 타입별 우선순위 정의
const TYPE_PRIORITY = {
  'NVD': 1,
  'Exploit': 2,
  'Patch': 3,
  'Other': 4
};

const getReferenceTypeLabel = (type) => {
  return REFERENCE_TYPES[type] || type;
};

const DEFAULT_REFERENCE = {
  type: 'OTHER',
  url: '',
  description: '',
  dateAdded: new Date().toISOString(),
  addedBy: 'anonymous'
};

const ReferencesTab = memo(({ cve, currentUser, refreshTrigger }) => {
  const dispatch = useDispatch();
  const { sendCustomMessage } = useWebSocketMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_REFERENCE);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  // references 정렬 함수를 컴포넌트 최상단으로 이동
  const sortedReferences = useMemo(() => {
    if (!cve?.references) return [];
    
    return [...cve.references].sort((a, b) => {
      // 타입 우선순위로 정렬
      const priorityA = TYPE_PRIORITY[a.type] || TYPE_PRIORITY['Other'];
      const priorityB = TYPE_PRIORITY[b.type] || TYPE_PRIORITY['Other'];
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 같은 타입인 경우 추가된 시간순으로 정렬
      return new Date(b.dateAdded) - new Date(a.dateAdded);
    });
  }, [cve?.references]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      const currentRefs = JSON.stringify(cve?.references || []);
      
      dispatch(fetchCVEDetail(cve.cveId)).then((action) => {
        const newRefs = JSON.stringify(action.payload?.references || []);
        if (currentRefs !== newRefs) {
          enqueueSnackbar('References에 새로운 업데이트가 있습니다.', {
            variant: 'info',
            action: (key) => (
              <Button color="inherit" size="small" onClick={() => closeSnackbar(key)}>
                확인
              </Button>
            )
          });
        }
      });
    }
  }, [refreshTrigger, dispatch, cve?.cveId, enqueueSnackbar, closeSnackbar]);

  if (!cve) {
    return null;
  }

  const handleAddClick = () => {
    setSelectedReference(null);
    setFormData(DEFAULT_REFERENCE);
    setOpen(true);
  };

  const handleEditClick = (reference, index) => {
    setSelectedReference({ ...reference, index });
    setFormData(reference);
    setOpen(true);
  };

  const handleDeleteReference = async (index) => {
    try {
      setLoading(true);
      setError(null);

      const updatedRefs = [...(cve.references || [])];
      updatedRefs.splice(index, 1);

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { references: updatedRefs }
      })).unwrap();

      if (response) {
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            cve: response.data
          }
        );
        
        // 데이터 갱신을 위한 지연 처리
        setTimeout(async () => {
          await dispatch(fetchCVEDetail(cve.cveId));
          enqueueSnackbar('Reference가 삭제되었습니다.', { variant: 'success' });
        }, 500);
      }
    } catch (error) {
      console.error('Failed to delete Reference:', error);
      enqueueSnackbar(error.message || 'Reference 삭제 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // URL 중복 검사 함수
  const isDuplicateUrl = (url, excludeIndex = -1) => {
    return cve.references?.some((ref, index) => 
      index !== excludeIndex && ref.url.toLowerCase() === url.toLowerCase()
    );
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const currentRefs = cve?.references || [];
      const updatedRefs = [...currentRefs];
      const urlToCheck = selectedReference ? selectedReference.url : formData.url;
      const excludeIndex = selectedReference ? selectedReference.index : -1;

      // URL 중복 검사
      if (isDuplicateUrl(urlToCheck, excludeIndex)) {
        enqueueSnackbar('이미 존재하는 URL입니다.', {
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        setLoading(false);
        return;
      }

      // KST 시간으로 생성
      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)

      // Reference 모델에 맞게 데이터 구조화
      const newReference = {
        type: formData.type,
        url: formData.url,
        description: formData.description || '',
        dateAdded: kstTime.toISOString(),
        addedBy: currentUser?.username || 'anonymous'
      };
      
      if (selectedReference) {
        updatedRefs[selectedReference.index] = newReference;
      } else {
        updatedRefs.push(newReference);
      }

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { references: updatedRefs }
      })).unwrap();

      if (response) {
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            cve: response.data
          }
        );
        
        setOpen(false);
        setSelectedReference(null);
        setFormData(DEFAULT_REFERENCE);

        // 데이터 갱신을 위한 지연 처리
        setTimeout(async () => {
          await dispatch(fetchCVEDetail(cve.cveId));
          enqueueSnackbar(`Reference가 ${selectedReference ? '수정' : '추가'}되었습니다.`, { variant: 'success' });
        }, 500);
      }
    } catch (error) {
      console.error('Failed to save Reference:', error);
      enqueueSnackbar(error.message || 'Reference 저장 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // URL 유효성 검사 함수
  const isUrlValid = (url) => url && url.trim() !== '';

  // Add/Save 버튼 활성화 여부
  const isButtonEnabled = selectedReference ? 
    isUrlValid(selectedReference.url) && !loading : 
    isUrlValid(formData.url) && !loading;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon color="primary" />
          <Typography variant="h6" color="text.primary">
            References ({cve.references?.length || 0})
          </Typography>
        </Box>
        <ActionButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
        >
          Add Reference
        </ActionButton>
      </ListHeader>

      {(!cve.references || cve.references.length === 0) ? (
        <EmptyState>
          <LinkIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
          <Typography variant="h6" gutterBottom>
            No References Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            There are no references linked to this CVE yet.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            sx={{ mt: 2 }}
          >
            Add First Reference
          </Button>
        </EmptyState>
      ) : (
        <Box sx={{ 
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1,
          '& > *:not(:last-child)': { mb: 2 }
        }}>
          {sortedReferences.map((reference, index) => (
            <StyledListItem key={index} elevation={1}>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                width: '100%',
                gap: 1
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={REFERENCE_TYPES[reference.type] || reference.type}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                    <Typography
                      component="a"
                      href={reference.url.startsWith('http') ? reference.url : `https://${reference.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ 
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { 
                          textDecoration: 'underline',
                          cursor: 'pointer'
                        },
                        fontWeight: 500
                      }}
                    >
                      {reference.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Edit">
                      <ActionIconButton 
                        size="small" 
                        onClick={() => handleEditClick(reference, index)}
                      >
                        <EditIcon />
                      </ActionIconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <ActionIconButton 
                        size="small"
                        color="error"
                        onClick={() => handleDeleteReference(index)}
                      >
                        <DeleteIcon />
                      </ActionIconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {reference.description && (
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ 
                      pl: 2,
                      borderLeft: '2px solid',
                      borderColor: 'divider'
                    }}
                  >
                    {reference.description}
                  </Typography>
                )}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 1,
                  mt: 0.5
                }}>
                  <Typography variant="caption" color="text.secondary">
                    Added by {reference.addedBy}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    •
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(reference.dateAdded).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </StyledListItem>
          ))}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSelectedReference(null);
          setFormData(DEFAULT_REFERENCE);
        }}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {selectedReference ? 'Edit Reference' : 'Add Reference'}
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              label="Type"
            >
              {Object.entries(REFERENCE_TYPES).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            required
            fullWidth
            label="URL"
            value={selectedReference ? selectedReference.url : formData.url}
            onChange={(e) => {
              if (selectedReference) {
                setSelectedReference({ ...selectedReference, url: e.target.value });
              } else {
                setFormData({ ...formData, url: e.target.value });
              }
            }}
            error={!isUrlValid(selectedReference ? selectedReference.url : formData.url)}
            helperText={!isUrlValid(selectedReference ? selectedReference.url : formData.url) ? "URL은 필수 입력 항목입니다." : ""}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            multiline
            rows={3}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => {
              setOpen(false);
              setSelectedReference(null);
              setFormData(DEFAULT_REFERENCE);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isButtonEnabled}
          >
            {selectedReference ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}, (prevProps, nextProps) => {
  // 커스텀 비교 함수
  return prevProps.refreshTrigger === nextProps.refreshTrigger &&
         prevProps.cve.cveId === nextProps.cve.cveId &&
         prevProps.currentUser?.id === nextProps.currentUser?.id &&
         JSON.stringify(prevProps.cve.references) === JSON.stringify(nextProps.cve.references);
});

export default ReferencesTab;
