import React, { useState, useEffect, useRef } from 'react';
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
import { 
  updateCVEDetail,
  fetchCVEDetail
} from '../../../store/slices/cveSlice';
import { useWebSocketMessage } from '../../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../../services/websocket';
import { useSnackbar } from 'notistack';
import { zonedTimeToUtc, format } from 'date-fns-tz';

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

const PoCTab = ({ cve, currentUser, refreshTrigger }) => {
  const dispatch = useDispatch();
  const { sendCustomMessage } = useWebSocketMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedPoc, setSelectedPoc] = useState(null);
  const [newPoc, setNewPoc] = useState(DEFAULT_POC);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  // refreshTrigger가 변경될 때마다 데이터 새로고침
  useEffect(() => {
    if (refreshTrigger > 0) {
      dispatch(fetchCVEDetail(cve.cveId));
    }
  }, [refreshTrigger, dispatch, cve?.cveId]);

  // URL 유효성 검사 함수
  const isUrlValid = (url) => url && url.trim() !== '';

  // URL 중복 검사 함수
  const isDuplicateUrl = (url, excludeIndex = -1) => {
    return cve.pocs?.some((poc, index) => 
      index !== excludeIndex && poc.url.toLowerCase() === url.toLowerCase()
    );
  };

  // Add 버튼 활성화 여부
  const isAddButtonEnabled = isUrlValid(newPoc.url) && !loading;

  // Save 버튼 활성화 여부
  const isSaveButtonEnabled = selectedPoc ? isUrlValid(selectedPoc.url) && !loading : isAddButtonEnabled;

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
      if (isDuplicateUrl(newPoc.url)) {
        enqueueSnackbar('이미 존재하는 URL입니다.', {
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        return;
      }

      setLoading(true);
      setError(null);

      // KST 시간으로 생성
      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)
      
      // 새로운 PoC 객체 생성
      const newPocWithMetadata = {
        ...newPoc,
        dateAdded: kstTime.toISOString(),  // KST 시간을 ISO 문자열로 변환
        addedBy: currentUser?.username || 'anonymous'
      };

      const updatedPocs = [...(cve.pocs || []), newPocWithMetadata];
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { 
          pocs: updatedPocs
        }
      })).unwrap();

      if (response) {
        // WebSocket 메시지 전송
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,  // 모든 변경사항을 CVE_UPDATED로 통일
          {
            cveId: cve.cveId,
            cve: response.data  // 전체 CVE 데이터 전송
          }
        );
        
        enqueueSnackbar('PoC가 추가되었습니다.', { variant: 'success' });
        setOpen(false);
        setNewPoc(DEFAULT_POC);
        
        await dispatch(fetchCVEDetail(cve.cveId));
      }
    } catch (error) {
      console.error('Failed to add PoC:', error);
      enqueueSnackbar(error.message || 'PoC 추가 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePoc = async (pocIndex) => {
    try {
      setLoading(true);
      setError(null);

      // 기존 PoC 배열에서 해당 인덱스만 제외
      const updatedPocs = cve.pocs.filter((_, index) => index !== pocIndex);

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { pocs: updatedPocs }
      })).unwrap();

      if (response) {
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            cve: response.data
          }
        );
        enqueueSnackbar('PoC가 삭제되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to delete PoC:', error);
      enqueueSnackbar(error.message || 'PoC 삭제 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePoc = async () => {
    if (!selectedPoc) return;

    try {
      if (isDuplicateUrl(selectedPoc.url, selectedPoc.id)) {
        enqueueSnackbar('이미 존재하는 URL입니다.', {
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        return;
      }

      setLoading(true);
      setError(null);

      // 기존 PoC 배열을 복사하고 선택된 인덱스의 데이터만 업데이트
      const updatedPocs = cve.pocs.map((poc, index) =>
        index === selectedPoc.id ? {
          ...poc,                    // 기존 메타데이터 유지
          source: selectedPoc.source,
          url: selectedPoc.url,
          description: selectedPoc.description
        } : poc
      );

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { pocs: updatedPocs }
      })).unwrap();

      if (response) {
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            cve: response.data
          }
        );
        enqueueSnackbar('PoC가 수정되었습니다.', { variant: 'success' });
        setOpen(false);
        setSelectedPoc(null);
      }
    } catch (error) {
      setError('PoC 수정 중 오류가 발생했습니다.');
      console.error('[PoCTab] Error in handleUpdatePoc:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedPoc(null);
  };

  const handleSave = () => {
    if (selectedPoc) {
      handleUpdatePoc();
    } else {
      handleAddPoc();
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CodeIcon color="primary" />
          <Typography variant="h6" color="text.primary">
            Proof of Concept ({cve.pocs?.length || 0})
          </Typography>
        </Box>
        <ActionButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
        >
          Add PoC
        </ActionButton>
      </ListHeader>

      {(!cve.pocs || cve.pocs.length === 0) ? (
        <EmptyState>
          <CodeIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
          <Typography variant="h6" gutterBottom>
            No PoCs Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            There are no proof of concept codes available for this CVE yet.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            sx={{ mt: 2 }}
          >
            Add First PoC
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
          {cve.pocs.map((poc, index) => (
            <StyledListItem key={index} elevation={1}>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: 1
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={
                        <ChipLabel>
                          <CodeIcon sx={{ fontSize: 16 }} />
                          {POC_SOURCES[poc.source]?.label || poc.source}
                        </ChipLabel>
                      }
                      size="small"
                      color={POC_SOURCES[poc.source]?.color || 'default'}
                      variant="outlined"
                      sx={{ minWidth: 80 }}
                    />
                    <Typography
                      component="a"
                      href={poc.url.startsWith('http') ? poc.url : `https://${poc.url}`}
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
                      {poc.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Open URL">
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
                    <Tooltip title="Edit">
                      <ActionIconButton 
                        size="small" 
                        onClick={() => handleEditClick({ ...poc, id: index })}
                      >
                        <EditIcon />
                      </ActionIconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <ActionIconButton 
                        size="small"
                        color="error"
                        onClick={() => handleDeletePoc(index)}
                      >
                        <DeleteIcon />
                      </ActionIconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {poc.description && (
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ 
                      pl: 2,
                      borderLeft: '2px solid',
                      borderColor: 'divider'
                    }}
                  >
                    {poc.description}
                  </Typography>
                )}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 1,
                  mt: 0.5
                }}>
                  <Typography variant="caption" color="text.secondary">
                    Added by {poc.addedBy}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    •
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(poc.dateAdded).toLocaleString('ko-KR', { 
                      timeZone: 'Asia/Seoul'
                    })}
                  </Typography>
                </Box>
              </Box>
            </StyledListItem>
          ))}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={handleClose}
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
            required
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
            error={!isUrlValid(selectedPoc ? selectedPoc.url : newPoc.url)}
            helperText={!isUrlValid(selectedPoc ? selectedPoc.url : newPoc.url) ? "URL은 필수 입력 항목입니다." : ""}
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
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isSaveButtonEnabled}
          >
            {selectedPoc ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PoCTab;
