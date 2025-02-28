import React, { useState, useEffect, memo, useRef } from 'react';
import {
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
import { useCVEWebSocketUpdate } from '../../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../../services/websocket';
import { useSnackbar } from 'notistack';

const RULE_TYPES = {
  USER_DEFINED: { label: '사용자 정의', color: 'default' },
  IPS: { label: 'IPS', color: 'primary' },
  ONE: { label: 'ONE', color: 'secondary' },
  UTM: { label: 'UTM', color: 'success' },
  'Emerging-Threats': { label: 'Emerging Threats', color: 'warning' },
  SNORT_OFFICIAL: { label: 'Snort Official', color: 'info' }
};

const DEFAULT_RULE = {
  type: 'Emerging-Threats',
  rule: '',
  description: ''
};

const SnortRulesTab = memo(({ cve, currentUser, onCountChange, refreshTrigger }) => {
  const dispatch = useDispatch();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [newRule, setNewRule] = useState({
    rule: '',
    type: 'Emerging-Threats',
    description: ''
  });
  const [editedRule, setEditedRule] = useState('');
  const [selectedRuleIndex, setSelectedRuleIndex] = useState(-1);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const pendingUpdateRef = useRef(null);

  // 웹소켓 메시지 처리를 useCVEWebSocketUpdate로 대체
  const { sendCustomMessage } = useCVEWebSocketUpdate(cve.cveId);

  useEffect(() => {
    if (cve?.snortRules) {
      onCountChange?.(cve.snortRules.length);
    }
  }, [cve?.snortRules, onCountChange]);

  // refreshTrigger가 변경될 때마다 데이터 새로고침
  useEffect(() => {
    if (refreshTrigger > 0) {
      const currentRules = JSON.stringify(cve?.snortRules || []);
      
      if (isEditing || open) {
        enqueueSnackbar('Snort Rules에 새로운 업데이트가 있습니다. 편집을 완료한 후 반영됩니다.', {
          variant: 'info',
          autoHideDuration: 5000,
          action: (key) => (
            <Button color="inherit" size="small" onClick={() => {
              dispatch(fetchCVEDetail(cve.cveId));
              closeSnackbar(key);
            }}>
              지금 갱신
            </Button>
          )
        });
        pendingUpdateRef.current = { cveId: cve.cveId };
        return;
      }
      
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
  }, [refreshTrigger, dispatch, cve?.cveId, cve?.snortRules, enqueueSnackbar, closeSnackbar, isEditing, open]);

  useEffect(() => {
    if (!isEditing && !open && pendingUpdateRef.current) {
      const { cveId } = pendingUpdateRef.current;
      dispatch(fetchCVEDetail(cveId));
      pendingUpdateRef.current = null;
    }
  }, [isEditing, open, dispatch]);

  const handleAddClick = () => {
    setSelectedRule(null);
    setNewRule(DEFAULT_RULE);
    setOpen(true);
    setIsEditing(true);
  };

  const handleEditClick = (rule, index) => {
    setSelectedRule({ ...rule, id: index });
    setSelectedRuleIndex(index);
    setEditedRule(rule.rule);
    setOpen(true);
    setIsEditing(true);
  };

  const handleAddRule = async () => {
    try {
      setLoading(true);
      setError(null);

      // 타임스탬프 포맷
      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)
      
      // 새 규칙 객체 생성
      const newRuleWithData = {
        rule: newRule.rule,
        type: newRule.type,
        description: newRule.description,
        createdAt: kstTime.toISOString(),
        createdBy: currentUser?.username || 'anonymous',
        modifiedAt: null,
        modifiedBy: null
      };

      // 기존 규칙 배열에 새 규칙 추가
      const updatedRules = [...(cve.snortRules || []), newRuleWithData];
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snort_rules: updatedRules }
      })).unwrap();

      if (response) {
        // 디버그 로그 추가
        console.log('[SnortRulesTab] 업데이트 응답:', response);
        
        // WebSocket 메시지 전송 - 필드 정보 추가
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            field: 'snort_rules',
            cve: response
          }
        );
        
        // 입력값 초기화
        setOpen(false);
        setNewRule(DEFAULT_RULE);
        setIsEditing(false);
        
        // 성공 메시지 표시
        enqueueSnackbar('Snort Rule이 추가되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to add Snort Rule:', error);
      setError('Snort Rule 추가 중 오류가 발생했습니다.');
      enqueueSnackbar(error.message || 'Snort Rule 추가에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRule = async () => {
    try {
      setLoading(true);
      setError(null);

      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)

      // 수정된 규칙 객체 생성
      const updatedRuleWithData = {
        ...selectedRule,
        rule: editedRule,
        modifiedAt: kstTime.toISOString(),
        modifiedBy: currentUser?.username || 'anonymous'
      };

      // 기존 규칙 배열에서 수정된 규칙으로 교체
      const updatedRules = cve.snortRules.map((rule, index) =>
        index === selectedRuleIndex ? updatedRuleWithData : rule
      );
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snort_rules: updatedRules }
      })).unwrap();

      if (response) {
        // 디버그 로그 추가
        console.log('[SnortRulesTab] 업데이트 응답:', response);
        
        // WebSocket 메시지 전송 - 필드 정보 추가
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            field: 'snort_rules',
            cve: response
          }
        );
        
        // 상태 초기화
        setOpen(false);
        setSelectedRule(null);
        setSelectedRuleIndex(-1);
        setEditedRule('');
        setIsEditing(false);
        
        // 성공 메시지 표시
        enqueueSnackbar('Snort Rule이 수정되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to update Snort Rule:', error);
      setError('Snort Rule 수정 중 오류가 발생했습니다.');
      enqueueSnackbar(error.message || 'Snort Rule 수정에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleIndex) => {
    try {
      setLoading(true);
      setError(null);

      // 기존 규칙 배열에서 특정 인덱스 제외
      const updatedRules = cve.snortRules.filter((_, index) => index !== ruleIndex);
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { snort_rules: updatedRules }
      })).unwrap();

      if (response) {
        // WebSocket 메시지 전송 - 필드 정보 추가
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            field: 'snort_rules',
            cve: response
          }
        );
        
        // 상태 초기화
        setIsEditing(false);
        
        // 성공 메시지 표시
        enqueueSnackbar('Snort Rule이 삭제되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to delete Snort Rule:', error);
      setError('Snort Rule 삭제 중 오류가 발생했습니다.');
      enqueueSnackbar(error.message || 'Snort Rule 삭제에 실패했습니다.', { variant: 'error' });
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
    setIsEditing(false);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setSelectedRule(null);
    setNewRule(DEFAULT_RULE);
    setIsEditing(false);
    
    if (pendingUpdateRef.current) {
      const { cveId } = pendingUpdateRef.current;
      dispatch(fetchCVEDetail(cveId)).then(() => {
        enqueueSnackbar('최신 데이터로 업데이트되었습니다.', { variant: 'success' });
      });
      pendingUpdateRef.current = null;
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
        onClose={handleCloseDialog}
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
          <Button onClick={handleCloseDialog}>
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
  // 디버깅용 로그 (더 상세하게 강화)
  console.log('=== SnortRulesTab memo comparison ===');
  console.log('prevProps.refreshTrigger:', prevProps.refreshTrigger);
  console.log('nextProps.refreshTrigger:', nextProps.refreshTrigger);
  
  // 규칙 데이터 깊은 비교 (더 자세하게)
  const prevRules = prevProps.cve?.snortRules || [];
  const nextRules = nextProps.cve?.snortRules || [];
  
  // 규칙 배열의 길이 비교
  const prevRulesLength = prevRules.length;
  const nextRulesLength = nextRules.length;
  
  console.log('prev rules length:', prevRulesLength);
  console.log('next rules length:', nextRulesLength);
  
  // 길이가 다르면 확실히 변경된 것
  let rulesChanged = prevRulesLength !== nextRulesLength;
  
  // 길이가 같더라도 내용이 달라졌을 수 있음
  if (!rulesChanged && prevRulesLength > 0) {
    // 전체 JSON 문자열 비교
    const prevRulesJSON = JSON.stringify(prevRules);
    const nextRulesJSON = JSON.stringify(nextRules);
    rulesChanged = prevRulesJSON !== nextRulesJSON;
    
    // 디버깅용 - 좀 더 상세하게 규칙별 비교
    if (rulesChanged) {
      console.log('규칙 내용이 변경되었습니다 (길이는 같음)');
      
      // 어떤 규칙이 변경되었는지 확인
      for (let i = 0; i < prevRulesLength; i++) {
        const prevRuleJSON = JSON.stringify(prevRules[i]);
        const nextRuleJSON = JSON.stringify(nextRules[i]);
        
        if (prevRuleJSON !== nextRuleJSON) {
          console.log(`규칙 #${i}가 변경되었습니다.`);
          console.log('변경 전:', prevRules[i]);
          console.log('변경 후:', nextRules[i]);
        }
      }
    }
  }
  
  console.log('rules changed:', rulesChanged);
  
  // 최종 결정과 이유 로그
  const shouldRerender = 
    rulesChanged || 
    prevProps.refreshTrigger !== nextProps.refreshTrigger ||
    prevProps.cve?.cveId !== nextProps.cve?.cveId ||
    prevProps.currentUser?.id !== nextProps.currentUser?.id;
  
  console.log('결정: ' + (shouldRerender ? '리렌더링 필요' : '리렌더링 불필요'));
  console.log('=== 비교 종료 ===');
  
  // 주의: React.memo는 true면 리렌더링 방지, false면 리렌더링 발생
  return !shouldRerender; // 주의: memo는 true면 리렌더링 방지, false면 리렌더링 발생
});

export default SnortRulesTab;
