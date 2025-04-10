import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Divider,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Link,
  useTheme,
  alpha,
  SelectChangeEvent,
  TextFieldProps,
  Theme,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
// 기존 hook 및 유틸리티 import는 그대로 유지
import { useCreateCVE } from 'features/cve/hooks/useCVEMutation';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { getUser } from 'shared/utils/storage/tokenStorage';
import { getUtcTimestamp } from 'shared/utils/dateUtils';
import { ApiResponse } from 'shared/api/types/api';
import { 
  CVEDetail,
  CVEData, 
  FormData, 
  PoCFile as PoC, 
  SnortRuleFile as SnortRule, 
  ReferenceFile as Reference, 
  SelectOption 
} from 'features/cve/types/cve';

// 타입 정의
interface CreateCVEProps {
  open?: boolean;
  onClose: () => void;
  onSuccess?: (data: CVEData) => void;
}

// 상수 정의
const POC_SOURCES: Record<string, string> = { Etc: "Etc", Metasploit: "Metasploit", "Nuclei-Templates": "Nuclei-Templates" };
const SNORT_RULE_TYPES: Record<string, string> = { "사용자 정의": "USER_DEFINED", "IPS": "IPS", "ONE": "ONE", "UTM": "UTM", "Emerging-Threats": "EMERGING_THREATS", "Snort Official": "SNORT_OFFICIAL" };
const SNORT_RULE_TYPE_OPTIONS: Array<{ label: string; value: string }> = Object.entries(SNORT_RULE_TYPES).map(([label, value]) => ({ label, value }));
const STATUS_OPTIONS: SelectOption[] = [{ value: '신규등록', label: '신규등록' }, { value: '분석중', label: '분석중' }, { value: '릴리즈 완료', label: '릴리즈 완료' }, { value: '분석불가', label: '분석불가' }];
const SEVERITY_OPTIONS: SelectOption[] = [{ value: 'Critical', label: 'Critical' }, { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }, { value: 'None', label: 'None' }];

// 스타일 상수 및 함수
const antdBorderColor = '#d9d9d9';
const antdPrimaryColor = '#1677ff';
const antdBorderRadius = '6px';
const antdInputHeight = '32px';
const antdListBgColor = '#fafafa';

// 입력 필드 공통 스타일 (AntD 유사)
const inputStyles = (theme: Theme) => ({
  borderRadius: antdBorderRadius,
  '& .MuiOutlinedInput-root': {
    borderRadius: antdBorderRadius,
    '& fieldset': {
      borderColor: antdBorderColor,
    },
    '&:hover fieldset': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
      borderWidth: '1px',
    },
  },
  '& .MuiInputLabel-outlined': {}
});

// 태그(Chip) 스타일 (AntD Tag 유사)
const tagStyles = (theme: Theme, type: string, value: string) => {
  let colors: { bgcolor: string; color: string } = { bgcolor: alpha(theme.palette.grey[500], 0.1), color: theme.palette.text.secondary }; // Default (None/Unknown)

  if (type === 'severity') {
    const severityLower = value ? String(value).toLowerCase() : '';
    switch (severityLower) {
      case 'critical': colors = { bgcolor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.dark }; break;
      case 'high': colors = { bgcolor: alpha(theme.palette.warning.main, 0.15), color: theme.palette.warning.dark }; break;
      case 'medium': colors = { bgcolor: alpha(theme.palette.info.main, 0.1), color: theme.palette.info.dark }; break;
      case 'low': colors = { bgcolor: alpha(theme.palette.success.light, 0.2), color: theme.palette.success.dark }; break;
    }
  } else if (type === 'status') {
    switch (value) {
      case '신규등록': colors = { bgcolor: alpha(theme.palette.primary.light, 0.15), color: theme.palette.primary.dark }; break;
      case '분석중': colors = { bgcolor: alpha(theme.palette.secondary.light, 0.15), color: theme.palette.secondary.dark }; break;
      case '릴리즈 완료': colors = { bgcolor: alpha(theme.palette.success.light, 0.2), color: theme.palette.success.dark }; break;
      case '분석불가': colors = { bgcolor: alpha(theme.palette.error.light, 0.1), color: theme.palette.error.dark }; break;
    }
  }

  return {
    ...colors,
    height: '22px',
    fontSize: '0.75rem',
    borderRadius: '4px',
    border: `1px solid ${colors.bgcolor}`,
    mr: 0.5,
    mb: 0.5,
  };
};

// 컴포넌트 시작
const CreateCVE: React.FC<CreateCVEProps> = ({ open = false, onClose, onSuccess }) => {
  // 머테리얼 UI 테마를 가져오고 타입을 명시적으로 지정
  const theme: Theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // 상태 정의
  const [formData, setFormData] = useState<FormData>({
    cveId: '',
    title: '',
    description: '',
    status: '신규등록',
    severity: 'Low',
    tags: [],
    exploitStatus: 'Unknown',
  });

  const [poc, setPoc] = useState<PoC[]>([]);
  const [snortRule, setSnortRule] = useState<SnortRule[]>([]);
  const [reference, setReference] = useState<Reference[]>([]);

  const [newPoc, setNewPoc] = useState<Omit<PoC, 'id' | 'created_by' | 'last_modified_by'>>({ source: POC_SOURCES.Etc, url: '' });
  const [newSnortRule, setNewSnortRule] = useState<Omit<SnortRule, 'id' | 'created_by' | 'last_modified_by'>>({ rule: '', type: 'USER_DEFINED' });
  const [newReference, setNewReference] = useState<string>('');
  const [error, setError] = useState<string>('');

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = getUser();
  const username = currentUser?.username || 'anonymous';

  const { mutate, isPending, error: mutationError } = useCreateCVE({
    onSuccess: (response: ApiResponse<CVEDetail>) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists(), refetchType: 'active' });
      enqueueSnackbar('CVE가 성공적으로 생성되었습니다', { variant: 'success' });
      if (onSuccess && response.data) {
        // response.data를 CVEData 형태로 변환하여 전달
        const cveData: CVEData = {
          cveId: response.data.cveId,
          title: response.data.title || '',
          description: response.data.description || '',
          status: response.data.status,
          severity: response.data.severity || '',
          tags: (response.data.tags as string[]) || [],
          exploitStatus: (response.data.exploitStatus as string) || '',
          // 배열 형태로 변환할 때는 리턴타입에 맞게 변환하는 것이 중요합니다
          poc: Array.isArray(response.data.poc) 
            ? (response.data.poc as any[]).map(poc => ({
                source: poc.source || '',
                url: poc.url || ''
              })) 
            : [],
          snortRule: Array.isArray(response.data.snortRule) 
            ? (response.data.snortRule as any[]).map(rule => ({
                rule: rule.rule || '',
                type: rule.type || ''
              })) 
            : [],
          reference: Array.isArray(response.data.reference) 
            ? (response.data.reference as any[]).map(ref => ({
                url: ref.url || ''
              })) 
            : [],
        };
        onSuccess(cveData);
      }
      handleClose();
    },
    onError: (error: Error) => handleError(error)
  });

  const handleError = (error: Error): void => {
    const errorMsg = `CVE 생성 실패: ${error.message || '알 수 없는 오류'}`;
    enqueueSnackbar(errorMsg, { variant: 'error' });
    setError(errorMsg);
  };

  // 폼 필드 변경 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Autocomplete (Tags) 핸들러
  const handleTagsChange = (event: React.SyntheticEvent, newValue: string[]): void => {
    setFormData(prev => ({ ...prev, tags: newValue }));
  };

  // 다이얼로그 닫기 및 폼 초기화
  const handleClose = (): void => {
    setFormData({
      cveId: '',
      title: '',
      description: '',
      status: '신규등록',
      severity: 'Low',
      tags: [],
      exploitStatus: 'Unknown'
    });
    setPoc([]);
    setSnortRule([]);
    setReference([]);
    setNewPoc({ source: POC_SOURCES.Etc, url: '' });
    setNewSnortRule({ rule: '', type: 'USER_DEFINED' });
    setNewReference('');
    setError('');
    onClose();
  };

  // 목록 추가/삭제 핸들러
  const handleAddPoc = (): void => {
    if (!newPoc.url.trim()) return;
    setPoc(prev => [...prev, {
      ...newPoc,
      id: `poc-${Date.now()}`,
      created_by: username,
      last_modified_by: username
    }]);
    setNewPoc({ source: POC_SOURCES.Etc, url: '' });
  };

  const handleRemovePoc = (id: string): void => {
    setPoc(prev => prev.filter(item => item.id !== id));
  };

  const handleAddSnortRule = (): void => {
    if (!newSnortRule.rule.trim()) return;
    setSnortRule(prev => [...prev, {
      ...newSnortRule,
      id: `snort-${Date.now()}`,
      created_by: username,
      last_modified_by: username
    }]);
    setNewSnortRule({ rule: '', type: 'USER_DEFINED' });
  };

  const handleRemoveSnortRule = (id: string): void => {
    setSnortRule(prev => prev.filter(item => item.id !== id));
  };

  const handleAddReference = (): void => {
    if (!newReference.trim()) return;
    const utcTime = getUtcTimestamp();
    setReference(prev => [...prev, {
      url: newReference.trim(),
      id: `ref-${Date.now()}`,
      created_at: utcTime,
      created_by: username,
      last_modified_at: null,
      last_modified_by: username
    }]);
    setNewReference('');
  };

  const handleRemoveReference = (id: string): void => {
    setReference(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!formData.cveId.trim()) {
      setError('CVE ID는 필수 항목입니다.');
      enqueueSnackbar('필수 입력 값을 확인해주세요.', { variant: 'warning' });
      return;
    }
    setError('');

    const cveData: CVEData = {
      ...formData,
      poc: poc.map(({ id, ...rest }) => rest),
      snortRule: snortRule.map(({ id, ...rest }) => rest),
      reference: reference.map(({ id, ...rest }) => rest),
    };

    mutate(cveData);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '80vh', borderRadius: antdBorderRadius } }}
    >
      <DialogTitle sx={{ pb: 1, borderBottom: `1px solid ${antdBorderColor}` }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 500 }}>
          새 CVE 등록
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: '20px !important', backgroundColor: '#f5f5f5' }}>
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, borderRadius: antdBorderRadius }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 기본 정보 섹션 */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
            <Typography variant="subtitle1" sx={{ mb: 2.5, fontWeight: 500 }}>기본 정보</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4} lg={3}>
                <TextField
                  required
                  fullWidth
                  label="CVE ID"
                  name="cveId"
                  value={formData.cveId}
                  onChange={handleInputChange}
                  helperText="Format: CVE-YYYY-NNNNN"
                  size="small"
                  sx={inputStyles(theme)}
                  error={!formData.cveId.trim() && !!error}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={8} lg={5}>
                <TextField
                  fullWidth
                  label="제목"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  size="small"
                  sx={inputStyles(theme)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <FormControl fullWidth size="small" sx={inputStyles(theme)}>
                  <InputLabel>상태</InputLabel>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    label="상태"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <FormControl fullWidth size="small" sx={inputStyles(theme)}>
                  <InputLabel>심각도</InputLabel>
                  <Select
                    name="severity"
                    value={formData.severity}
                    onChange={handleInputChange}
                    label="심각도"
                  >
                    {SEVERITY_OPTIONS.map(option => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <TextField
              label="설명"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              multiline
              rows={4}
              fullWidth
              size="small"
              sx={{ ...inputStyles(theme), mt: 2 }}
            />
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={formData.tags}
              onChange={handleTagsChange}
              renderTags={(value: string[], getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    label={option}
                    size="small"
                    sx={tagStyles(theme, 'tag', option)}
                    {...getTagProps({ index })}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="태그"
                  placeholder="태그 입력 후 Enter"
                  size="small"
                  sx={{ ...inputStyles(theme), mt: 2 }}
                />
              )}
              sx={{ mt: 2 }}
            />
          </Paper>

          {/* PoC 섹션 */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>Proof of Concepts (PoC)</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ ...inputStyles(theme), width: '25%', minWidth: 150 }}>
                <InputLabel>Source</InputLabel>
                <Select
                  value={newPoc.source}
                  onChange={(e) => setNewPoc(prev => ({ ...prev, source: e.target.value }))}
                  label="Source"
                >
                  {Object.entries(POC_SOURCES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>{value}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="PoC URL"
                value={newPoc.url}
                onChange={(e) => setNewPoc(prev => ({ ...prev, url: e.target.value }))}
                sx={{ ...inputStyles(theme), flexGrow: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPoc()}
              />
              <Button
                variant="outlined"
                onClick={handleAddPoc}
                startIcon={<AddIcon />}
                sx={{
                  borderRadius: antdBorderRadius,
                  borderColor: antdBorderColor,
                  color: theme.palette.text.secondary,
                  borderStyle: 'dashed',
                  height: antdInputHeight,
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    color: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    borderStyle: 'dashed',
                  }
                }}
              >
                추가
              </Button>
            </Box>
            <Box sx={{ maxHeight: '200px', overflowY: 'auto', p: 1, bgcolor: antdListBgColor, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
              {poc.length === 0 ? (
                <Typography variant="body2" color="textSecondary" align="center" sx={{ p: 2 }}>추가된 PoC가 없습니다.</Typography>
              ) : (
                poc.map((poc) => (
                  <Paper key={poc.id} elevation={0} sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: '4px', border: `1px solid ${alpha(antdBorderColor, 0.6)}`, '&:last-child': { mb: 0 } }}>
                    <Typography variant="body2" sx={{ width: '25%', fontWeight: 500, flexShrink: 0 }}>{poc.source}</Typography>
                    <Link href={poc.url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all', color: theme.palette.primary.main }}>
                      {poc.url}
                    </Link>
                    <IconButton onClick={() => handleRemovePoc(poc.id as string)} size="small" sx={{ color: theme.palette.error.main, '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>

          {/* Snort Rules 섹션 */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>Snort Rules</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ ...inputStyles(theme), width: '30%', minWidth: 180 }}>
                <InputLabel>Rule Type</InputLabel>
                <Select
                  value={newSnortRule.type}
                  onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))}
                  label="Rule Type"
                >
                  {SNORT_RULE_TYPE_OPTIONS.map(({ label, value }) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="Snort Rule"
                value={newSnortRule.rule}
                onChange={(e) => setNewSnortRule(prev => ({ ...prev, rule: e.target.value }))}
                sx={{ ...inputStyles(theme), flexGrow: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSnortRule()}
              />
              <Button
                variant="outlined"
                onClick={handleAddSnortRule}
                startIcon={<AddIcon />}
                sx={{
                  borderRadius: antdBorderRadius,
                  borderColor: antdBorderColor,
                  color: theme.palette.text.secondary,
                  borderStyle: 'dashed',
                  height: antdInputHeight,
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    color: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    borderStyle: 'dashed',
                  }
                }}
              >
                추가
              </Button>
            </Box>
            <Box sx={{ maxHeight: '200px', overflowY: 'auto', p: 1, bgcolor: antdListBgColor, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
              {snortRule.length === 0 ? (
                <Typography variant="body2" color="textSecondary" align="center" sx={{ p: 2 }}>추가된 Snort Rule이 없습니다.</Typography>
              ) : (
                snortRule.map((rule) => (
                  <Paper key={rule.id} elevation={0} sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: '4px', border: `1px solid ${alpha(antdBorderColor, 0.6)}`, '&:last-child': { mb: 0 } }}>
                    <Typography variant="body2" sx={{ width: '30%', fontWeight: 500, flexShrink: 0 }}>
                      {SNORT_RULE_TYPE_OPTIONS.find(opt => opt.value === rule.type)?.label || rule.type}
                    </Typography>
                    <Typography variant="body2" sx={{ flexGrow: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {rule.rule}
                    </Typography>
                    <IconButton onClick={() => handleRemoveSnortRule(rule.id as string)} size="small" sx={{ color: theme.palette.error.main, '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>

          {/* Reference 섹션 */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>Reference</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="참조 URL"
                value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                fullWidth
                sx={inputStyles(theme)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddReference()}
              />
              <Button
                variant="outlined"
                onClick={handleAddReference}
                startIcon={<AddIcon />}
                sx={{
                  borderRadius: antdBorderRadius,
                  borderColor: antdBorderColor,
                  color: theme.palette.text.secondary,
                  borderStyle: 'dashed',
                  height: antdInputHeight,
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    color: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    borderStyle: 'dashed',
                  }
                }}
              >
                추가
              </Button>
            </Box>
            <Box sx={{ maxHeight: '200px', overflowY: 'auto', p: 1, bgcolor: antdListBgColor, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
              {reference.length === 0 ? (
                <Typography variant="body2" color="textSecondary" align="center" sx={{ p: 2 }}>추가된 참조 URL이 없습니다.</Typography>
              ) : (
                reference.map((ref) => (
                  <Paper key={ref.id} elevation={0} sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: '4px', border: `1px solid ${alpha(antdBorderColor, 0.6)}`, '&:last-child': { mb: 0 } }}>
                    <Link href={ref.url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all', color: theme.palette.primary.main }}>
                      {ref.url}
                    </Link>
                    <IconButton onClick={() => handleRemoveReference(ref.id as string)} size="small" sx={{ color: theme.palette.error.main, '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: `1px solid ${antdBorderColor}`, backgroundColor: '#fff' }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ borderRadius: antdBorderRadius, borderColor: antdBorderColor, color: theme.palette.text.primary }}
        >
          취소
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={isPending || !formData.cveId.trim()}
          startIcon={isPending ? <CircularProgress size={20} color="inherit" /> : null}
          sx={{
            borderRadius: antdBorderRadius,
            boxShadow: 'none',
          }}
        >
          CVE 생성
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateCVE;