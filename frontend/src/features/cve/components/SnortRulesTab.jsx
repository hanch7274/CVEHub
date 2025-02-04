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
  Button,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
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
import { updateCVEDetail } from '../../../store/cveSlice';

const SNORT_RULE_TYPES = {
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
  description: '',
  dateAdded: new Date().toISOString(),
  addedBy: ''
};

const SnortRulesTab = ({ cve, setSuccessMessage, currentUser }) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [newRule, setNewRule] = useState({ 
    ...DEFAULT_RULE, 
    addedBy: currentUser?.username || 'anonymous',
    dateAdded: new Date().toISOString()
  });

  // 디버깅을 위한 로그 추가
  console.log('CVE Data:', cve);
  console.log('Snort Rules:', cve?.snortRules);
  console.log('Snort Rules Length:', cve?.snortRules?.length);

  if (!cve) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Typography variant="body1" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  console.log('Current CVE data:', cve); // 디버깅을 위한 로그 추가

  const handleAddClick = () => {
    setSelectedRule(null);
    setNewRule({ 
      ...DEFAULT_RULE, 
      addedBy: currentUser?.username || 'anonymous',
      dateAdded: new Date().toISOString()
    });
    setOpen(true);
  };

  const handleEditClick = (rule, index) => {
    setSelectedRule({ ...rule, id: index });
    setOpen(true);
  };

  const handleDeleteRule = async (ruleIndex) => {
    try {
      setLoading(true);
      setError(null);

      // 선택된 규칙을 제외한 새로운 배열 생성
      const updatedRules = (cve.snortRules || []).filter((_, index) => index !== ruleIndex);

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snortRules: updatedRules }  // snortRules 필드만 업데이트
      })).unwrap();

      if (response && response.snortRules) {
        setSuccessMessage('Snort Rule이 삭제되었습니다.');
      }
    } catch (error) {
      console.error('Failed to delete Snort Rule:', error);
      if (error.status === 403) {
        setError('관리자만 삭제할 수 있습니다.');
      } else {
        setError('Snort Rule 삭제 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    try {
      setLoading(true);
      setError(null);

      // 기존 규칙들을 유지하면서 새 규칙 추가
      const updatedRules = [...(cve.snortRules || []), newRule];

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snortRules: updatedRules }
      })).unwrap();

      if (response && response.snortRules) {
        setSuccessMessage('Snort Rule이 추가되었습니다.');
        setOpen(false);
        setNewRule({ 
          ...DEFAULT_RULE, 
          addedBy: currentUser?.username || 'anonymous',
          dateAdded: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to add Snort Rule:', error);
      setError('Snort Rule 추가 중 오류가 발생했습니다.');
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
        index === selectedRule.id ? { ...selectedRule } : rule
      );

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snortRules: updatedRules }
      })).unwrap();

      if (response && response.snortRules) {
        setSuccessMessage('Snort Rule이 수정되었습니다.');
        setOpen(false);
        setSelectedRule(null);
      }
    } catch (error) {
      console.error('Failed to update Snort Rule:', error);
      setError('Snort Rule 수정 중 오류가 발생했습니다.');
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

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      height: '100%',
      minHeight: 0  // 중요: flex 컨테이너 내에서 스크롤을 위해 필요
    }}>
      <Box sx={{ flex: '0 0 auto' }}>  {/* 고정 높이 영역을 위한 컨테이너 */}
        <ListHeader>
          <Typography variant="h6" color="text.primary">
            Snort Rules ({cve.snortRules?.length || 0})
          </Typography>
          <ActionButton
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            disabled={loading}
          >
            Add Rule
          </ActionButton>
        </ListHeader>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Box>

      <Box sx={{ 
        flex: 1,
        minHeight: 0,  // 중요: flex 컨테이너 내에서 스크롤을 위해 필요
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <Typography variant="body1" color="text.secondary">
              Loading...
            </Typography>
          </Box>
        ) : (!cve.snortRules || cve.snortRules.length === 0) ? (
          <EmptyState>
            <ShieldIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="h6" gutterBottom>
              No Snort Rules Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              There are no Snort rules defined for this CVE yet.
            </Typography>
          </EmptyState>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 2
          }}>
            {cve.snortRules.map((rule, index) => (
              <StyledListItem 
                key={`snort-rule-${index}`} 
                elevation={0}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip
                      label={
                        <ChipLabel>
                          <ShieldIcon sx={{ fontSize: 16 }} />
                          {SNORT_RULE_TYPES[rule.type]?.label || rule.type}
                        </ChipLabel>
                      }
                      size="small"
                      variant="outlined"
                      color={SNORT_RULE_TYPES[rule.type]?.color || 'default'}
                    />
                    {rule.addedBy && (
                      <Typography variant="caption" color="text.secondary">
                        Added by {rule.addedBy}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Edit" arrow>
                      <ActionIconButton
                        size="small"
                        onClick={() => handleEditClick(rule, index)}
                        disabled={loading}
                      >
                        <EditIcon />
                      </ActionIconButton>
                    </Tooltip>
                    <Tooltip title="Delete" arrow>
                      <ActionIconButton
                        size="small"
                        onClick={() => handleDeleteRule(index)}
                        disabled={loading}
                      >
                        <DeleteIcon />
                      </ActionIconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    ml: 1,
                    fontFamily: 'monospace',
                    bgcolor: 'background.default',
                    p: 2,
                    borderRadius: 1,
                    overflowX: 'auto'
                  }}
                >
                  {rule.rule}
                </Typography>
                {rule.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 1 }}>
                    {rule.description}
                  </Typography>
                )}
              </StyledListItem>
            ))}
          </Box>
        )}
      </Box>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSelectedRule(null);
          setNewRule({ 
            ...DEFAULT_RULE, 
            addedBy: currentUser?.username || 'anonymous',
            dateAdded: new Date().toISOString()
          });
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
        <DialogTitle>{selectedRule ? 'Snort Rule 수정' : 'Snort Rule 추가'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>유형</InputLabel>
            <Select
              value={selectedRule ? selectedRule.type : newRule.type}
              onChange={(e) => {
                if (selectedRule) {
                  setSelectedRule({
                    ...selectedRule,
                    type: e.target.value
                  });
                } else {
                  setNewRule({
                    ...newRule,
                    type: e.target.value
                  });
                }
              }}
              label="유형"
              disabled={loading}
            >
              {Object.entries(SNORT_RULE_TYPES).map(([value, { label }]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Rule Content"
            value={selectedRule ? selectedRule.rule : newRule.rule}
            onChange={(e) => {
              if (selectedRule) {
                setSelectedRule({
                  ...selectedRule,
                  rule: e.target.value
                });
              } else {
                setNewRule({
                  ...newRule,
                  rule: e.target.value
                });
              }
            }}
            multiline
            rows={4}
            sx={{ mt: 2 }}
            disabled={loading}
          />
          <TextField
            fullWidth
            label="설명"
            value={selectedRule ? selectedRule.description : newRule.description}
            onChange={(e) => {
              if (selectedRule) {
                setSelectedRule({
                  ...selectedRule,
                  description: e.target.value
                });
              } else {
                setNewRule({
                  ...newRule,
                  description: e.target.value
                });
              }
            }}
            multiline
            rows={2}
            sx={{ mt: 2 }}
            disabled={loading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpen(false);
            setSelectedRule(null);
            setNewRule({ 
              ...DEFAULT_RULE, 
              addedBy: currentUser?.username || 'anonymous',
              dateAdded: new Date().toISOString()
            });
          }}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading}
          >
            {selectedRule ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SnortRulesTab;
