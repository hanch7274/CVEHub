import React, { useState, useEffect, memo } from 'react';
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
  Button,
  Paper,
  Grid,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Shield as ShieldIcon
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

const RULE_TYPES = {
  USER_DEFINED: { label: '사용자 정의', color: 'default' },
  IPS: { label: 'IPS', color: 'primary' },
  ONE: { label: 'ONE', color: 'secondary' },
  UTM: { label: 'UTM', color: 'success' },
  EMERGING_THREATS: { label: 'Emerging Threats', color: 'warning' },
  SNORT_OFFICIAL: { label: 'Snort Official', color: 'info' }
};

const DEFAULT_RULE = {
  type: 'USER_DEFINED',
  rule: '',
  description: ''
};

const SnortRulesTab = memo(({ cve, currentUser, onCountChange, refreshTrigger }) => {
  const dispatch = useDispatch();
  const { sendCustomMessage } = useWebSocketMessage();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [newRule, setNewRule] = useState({
    rule: '',
    type: 'USER_DEFINED',
    description: ''
  });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (cve?.snortRules) {
      onCountChange?.(cve.snortRules.length);
    }
  }, [cve?.snortRules, onCountChange]);

  // refreshTrigger가 변경될 때마다 데이터 새로고침
  useEffect(() => {
    if (refreshTrigger > 0) {
      const currentRules = JSON.stringify(cve?.snortRules || []);
      
      dispatch(fetchCVEDetail(cve.cveId)).then((action) => {
        const newRules = JSON.stringify(action.payload?.snortRules || []);
        if (currentRules !== newRules) {
          enqueueSnackbar('Snort Rules에 새로운 업데이트가 있습니다.', {
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

  const handleAddClick = () => {
    setSelectedRule(null);
    setNewRule(DEFAULT_RULE);
    setOpen(true);
  };

  const handleEditClick = (rule, index) => {
    setSelectedRule({ ...rule, id: index });
    setOpen(true);
  };

  const handleAddRule = async () => {
    if (!newRule.rule || newRule.rule.trim() === '') {
      enqueueSnackbar('Rule은 필수 입력 항목입니다.', { 
        variant: 'error',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // KST 시간으로 생성
      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)

      const ruleToAdd = {
        ...newRule,
        dateAdded: kstTime.toISOString(),
        addedBy: currentUser?.username || 'anonymous'
      };

      const updatedRules = [...(cve.snortRules || []), ruleToAdd];
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snort_rules: updatedRules }
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
        setNewRule(DEFAULT_RULE);
        
        // 데이터 갱신을 위한 지연 처리
        setTimeout(async () => {
          await dispatch(fetchCVEDetail(cve.cveId));
          enqueueSnackbar('Snort Rule이 추가되었습니다.', { variant: 'success' });
        }, 500);
      }
    } catch (error) {
      console.error('Failed to add Snort Rule:', error);
      enqueueSnackbar(error.message || 'Snort Rule 추가 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRule = async () => {
    if (!selectedRule) return;

    try {
      setLoading(true);
      setError(null);

      const updatedRules = (cve.snortRules || []).map((rule, index) =>
        index === selectedRule.id ? {
          ...selectedRule,
          dateAdded: rule.dateAdded,
          addedBy: rule.addedBy
        } : rule
      );

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snort_rules: updatedRules }
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
        setSelectedRule(null);
        
        // 데이터 갱신을 위한 지연 처리
        setTimeout(async () => {
          await dispatch(fetchCVEDetail(cve.cveId));
          enqueueSnackbar('Snort Rule이 수정되었습니다.', { variant: 'success' });
        }, 500);
      }
    } catch (error) {
      console.error('Failed to update Snort Rule:', error);
      enqueueSnackbar(error.message || 'Snort Rule 수정 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleIndex) => {
    try {
      setLoading(true);
      setError(null);

      const updatedRules = (cve.snortRules || [])
        .filter((_, index) => index !== ruleIndex);

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snort_rules: updatedRules }
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
          enqueueSnackbar('Snort Rule이 삭제되었습니다.', { variant: 'success' });
        }, 500);
      }
    } catch (error) {
      console.error('Failed to delete Snort Rule:', error);
      enqueueSnackbar(error.message || 'Snort Rule 삭제 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (selectedRule) {
      handleUpdateRule();
    } else {
      handleAddRule();
    }
  };

  // Rule 유효성 검사 함수
  const isRuleValid = (rule) => rule && rule.trim() !== '';

  // Add/Save 버튼 활성화 여부
  const isButtonEnabled = selectedRule ? 
    isRuleValid(selectedRule.rule) && !loading : 
    isRuleValid(newRule.rule) && !loading;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldIcon color="primary" />
          <Typography variant="h6" color="text.primary">
            Snort Rules ({cve.snortRules?.length || 0})
          </Typography>
        </Box>
        <ActionButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
        >
          Add Rule
        </ActionButton>
      </ListHeader>

      {(!cve.snortRules || cve.snortRules.length === 0) ? (
        <EmptyState>
          <ShieldIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
          <Typography variant="h6" gutterBottom>
            No Snort Rules Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            There are no Snort rules defined for this CVE yet.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            sx={{ mt: 2 }}
          >
            Add First Rule
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
          {cve.snortRules.map((rule, index) => (
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
                          <ShieldIcon sx={{ fontSize: 16 }} />
                          {RULE_TYPES[rule.type]?.label || rule.type}
                        </ChipLabel>
                      }
                      size="small"
                      color={RULE_TYPES[rule.type]?.color || 'default'}
                      variant="outlined"
                      sx={{ minWidth: 80 }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Edit">
                      <ActionIconButton 
                        size="small" 
                        onClick={() => handleEditClick(rule, index)}
                      >
                        <EditIcon />
                      </ActionIconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <ActionIconButton 
                        size="small"
                        color="error"
                        onClick={() => handleDeleteRule(index)}
                      >
                        <DeleteIcon />
                      </ActionIconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontSize: '0.813rem',
                    maxHeight: '80px',  // 최대 높이 제한
                    overflow: 'auto'
                  }}
                >
                  {rule.rule}
                </Typography>
                {rule.description && (
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ 
                      pl: 2,
                      borderLeft: '2px solid',
                      borderColor: 'divider'
                    }}
                  >
                    {rule.description}
                  </Typography>
                )}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 1,
                  mt: 0.5
                }}>
                  <Typography variant="caption" color="text.secondary">
                    Added by {rule.addedBy}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    •
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(rule.dateAdded).toLocaleString()}
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
          setSelectedRule(null);
          setNewRule(DEFAULT_RULE);
        }}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle>
          {selectedRule ? 'Edit Snort Rule' : 'Add Snort Rule'}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={selectedRule ? selectedRule.type : newRule.type}
              onChange={(e) => {
                if (selectedRule) {
                  setSelectedRule({ ...selectedRule, type: e.target.value });
                } else {
                  setNewRule({ ...newRule, type: e.target.value });
                }
              }}
              label="Type"
            >
              {Object.entries(RULE_TYPES).map(([value, { label }]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            required
            fullWidth
            label="Rule"
            value={selectedRule ? selectedRule.rule : newRule.rule}
            onChange={(e) => {
              if (selectedRule) {
                setSelectedRule({ ...selectedRule, rule: e.target.value });
              } else {
                setNewRule({ ...newRule, rule: e.target.value });
              }
            }}
            error={!isRuleValid(selectedRule ? selectedRule.rule : newRule.rule)}
            helperText={!isRuleValid(selectedRule ? selectedRule.rule : newRule.rule) ? "Rule은 필수 입력 항목입니다." : ""}
            multiline
            rows={3}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={selectedRule ? selectedRule.description : newRule.description}
            onChange={(e) => {
              if (selectedRule) {
                setSelectedRule({ ...selectedRule, description: e.target.value });
              } else {
                setNewRule({ ...newRule, description: e.target.value });
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
            setSelectedRule(null);
            setNewRule(DEFAULT_RULE);
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isButtonEnabled}
          >
            {selectedRule ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}, (prevProps, nextProps) => {
  // 커스텀 비교 함수 개선
  return prevProps.refreshTrigger === nextProps.refreshTrigger &&
         prevProps.cve.cveId === nextProps.cve.cveId &&
         prevProps.currentUser?.id === nextProps.currentUser?.id &&
         JSON.stringify(prevProps.cve.snortRules) === JSON.stringify(nextProps.cve.snortRules);
});

export default SnortRulesTab;
