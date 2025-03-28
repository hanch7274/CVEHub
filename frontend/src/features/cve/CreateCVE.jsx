import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Divider, // Divider는 필요시 사용 가능
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
  Link, // URL 표시에 Link 사용
  useTheme, // 테마 접근
  alpha,    // 색상 투명도 조절
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
// 기존 hook 및 유틸리티 import는 그대로 유지
import { useCreateCVE } from '../../api/hooks/useCVEMutation';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../../api/queryKeys';
import { getUser } from '../../utils/storage/tokenStorage';
import { getUtcTimestamp, formatDateTime, DATE_FORMATS } from '../../utils/dateUtils';

// 상수 정의는 그대로 유지
const POC_SOURCES = { Etc: "Etc", Metasploit: "Metasploit", "Nuclei-Templates": "Nuclei-Templates" };
const SNORT_RULE_TYPES = { "사용자 정의": "USER_DEFINED", "IPS": "IPS", "ONE": "ONE", "UTM": "UTM", "Emerging-Threats": "EMERGING_THREATS", "Snort Official": "SNORT_OFFICIAL" };
const SNORT_RULE_TYPE_OPTIONS = Object.entries(SNORT_RULE_TYPES).map(([label, value]) => ({ label, value }));
const STATUS_OPTIONS = [{ value: '신규등록', label: '신규등록' }, { value: '분석중', label: '분석중' }, { value: '릴리즈 완료', label: '릴리즈 완료' }, { value: '분석불가', label: '분석불가' }];
const SEVERITY_OPTIONS = [{ value: 'Critical', label: 'Critical' }, { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }, { value: 'None', label: 'None' }];

// --- AntD 스타일 유사 적용을 위한 스타일 상수 및 함수 ---
const antdBorderColor = '#d9d9d9'; // AntD 기본 보더 색상
const antdPrimaryColor = '#1677ff'; // AntD 기본 프라이머리 색상 (MUI 테마 primary로 대체 가능)
const antdBorderRadius = '6px';    // AntD v5 기본 border-radius
const antdInputHeight = '32px';    // AntD 기본 인풋 높이 (MUI small과 유사)
const antdListBgColor = '#fafafa'; // AntD 리스트/테이블 배경색과 유사하게

// 입력 필드 공통 스타일 (AntD 유사)
const inputStyles = (theme) => ({
  borderRadius: antdBorderRadius,
  '& .MuiOutlinedInput-root': {
    // height: antdInputHeight, // size="small"로 대체하거나 필요시 명시
    borderRadius: antdBorderRadius,
    '& fieldset': {
      borderColor: antdBorderColor, // 기본 보더 색상
    },
    '&:hover fieldset': {
      borderColor: theme.palette.primary.main, // 호버 시 MUI 프라이머리 색상 (AntD blue와 유사)
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main, // 포커스 시 MUI 프라이머리 색상
      borderWidth: '1px', // AntD는 보통 1px 유지
      // AntD 포커스 시 그림자 효과 (선택적)
      // boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`,
    },
  },
  // 라벨 스타일 조정 (AntD는 보통 라벨이 위에 위치)
  '& .MuiInputLabel-outlined': {
      // 필요시 라벨 위치나 스타일 조정
  }
});

// 태그(Chip) 스타일 (AntD Tag 유사)
const tagStyles = (theme, type, value) => {
  let colors = { bgcolor: alpha(theme.palette.grey[500], 0.1), color: theme.palette.text.secondary }; // Default (None/Unknown)

  if (type === 'severity') {
      const severityLower = value ? String(value).toLowerCase() : '';
      switch (severityLower) {
          case 'critical': colors = { bgcolor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.dark }; break; // 진한 빨강
          case 'high': colors = { bgcolor: alpha(theme.palette.warning.main, 0.15), color: theme.palette.warning.dark }; break; // 진한 주황
          case 'medium': colors = { bgcolor: alpha(theme.palette.info.main, 0.1), color: theme.palette.info.dark }; break; // 진한 파랑
          case 'low': colors = { bgcolor: alpha(theme.palette.success.light, 0.2), color: theme.palette.success.dark }; break; // 진한 초록
          // None은 기본값 사용
      }
  } else if (type === 'status') {
      switch (value) {
          case '신규등록': colors = { bgcolor: alpha(theme.palette.primary.light, 0.15), color: theme.palette.primary.dark }; break;
          case '분석중': colors = { bgcolor: alpha(theme.palette.secondary.light, 0.15), color: theme.palette.secondary.dark }; break; // 보라 계열
          case '릴리즈 완료': colors = { bgcolor: alpha(theme.palette.success.light, 0.2), color: theme.palette.success.dark }; break;
          case '분석불가': colors = { bgcolor: alpha(theme.palette.error.light, 0.1), color: theme.palette.error.dark }; break;
      }
  }

  return {
      ...colors,
      height: '22px', // AntD Tag 높이와 유사하게
      fontSize: '0.75rem', // AntD Tag 폰트 크기와 유사하게
      borderRadius: '4px', // 약간 둥글게
      border: `1px solid ${colors.bgcolor}`, // 배경색과 같은 톤의 보더 (선택적)
      mr: 0.5, // 태그 간 간격
      mb: 0.5,
  };
};

// --- 컴포넌트 시작 ---
const CreateCVE = ({ open = false, onClose, onSuccess }) => {
  const theme = useTheme(); // MUI 테마 사용
  const { enqueueSnackbar } = useSnackbar(); // 스낵바는 그대로 사용

  // 상태 및 핸들러는 이전 MUI 버전 코드를 기반으로 함 (AntD Form 관련 로직 없음)
  const [formData, setFormData] = useState({
    cveId: '',
    title: '',
    description: '',
    status: '신규등록',
    severity: 'Low',
    tags: [], // Autocomplete 사용을 위해 배열로 변경
    exploitStatus: 'Unknown',
  });

  // pocs, snortRules, references 상태는 이전 MUI 코드에서 가져옴
   const [pocs, setPocs] = useState([]);
   const [snortRules, setSnortRules] = useState([]);
   const [references, setReferences] = useState([]);

  const [newPoc, setNewPoc] = useState({ source: POC_SOURCES.Etc, url: '' }); // description 제거됨
  const [newSnortRule, setNewSnortRule] = useState({ rule: '', type: 'USER_DEFINED' }); // description 제거됨
  const [newReference, setNewReference] = useState('');
  const [error, setError] = useState('');
  // const [loading, setLoading] = useState(false); // isLoading으로 대체됨

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = getUser();
  const username = currentUser?.username || 'anonymous';

  const { mutate, isLoading, error: mutationError } = useCreateCVE({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists(), refetchType: 'active' });
      enqueueSnackbar('CVE가 성공적으로 생성되었습니다', { variant: 'success' });
      if (onSuccess) onSuccess(data);
      handleClose(); // 폼 초기화 포함
    },
    onError: (error) => handleError(error)
  });

  const handleError = (error) => {
    const errorMsg = `CVE 생성 실패: ${error.message || '알 수 없는 오류'}`;
    enqueueSnackbar(errorMsg, { variant: 'error' });
    setError(errorMsg);
    // setLoading(false); // isLoading으로 대체
  };

  // 폼 필드 변경 핸들러
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Autocomplete (Tags) 핸들러
  const handleTagsChange = (event, newValue) => {
    setFormData(prev => ({ ...prev, tags: newValue }));
  };

  // 다이얼로그 닫기 및 폼 초기화
  const handleClose = () => {
    setFormData({ cveId: '', title: '', description: '', status: '신규등록', severity: 'Low', tags: [], exploitStatus: 'Unknown' });
    setPocs([]); setSnortRules([]); setReferences([]);
    setNewPoc({ source: POC_SOURCES.Etc, url: '' });
    setNewSnortRule({ rule: '', type: 'USER_DEFINED' });
    setNewReference('');
    setError('');
    onClose();
  };


  // --- 목록 추가/삭제 핸들러 (상태 직접 업데이트) ---
  const handleAddPoc = () => {
    if (!newPoc.url.trim()) return;
    setPocs(prev => [...prev, { ...newPoc, id: `poc-${Date.now()}`, created_by: username, last_modified_by: username }]);
    setNewPoc({ source: POC_SOURCES.Etc, url: '' });
  };
  const handleRemovePoc = (id) => setPocs(prev => prev.filter(item => item.id !== id));

  const handleAddSnortRule = () => {
    if (!newSnortRule.rule.trim()) return;
    setSnortRules(prev => [...prev, { ...newSnortRule, id: `snort-${Date.now()}`, created_by: username, last_modified_by: username }]);
    setNewSnortRule({ rule: '', type: 'USER_DEFINED' });
  };
  const handleRemoveSnortRule = (id) => setSnortRules(prev => prev.filter(item => item.id !== id));

  const handleAddReference = () => {
    if (!newReference.trim()) return;
    // UTC 시간 사용 (백엔드와 일관성 유지)
    const utcTime = getUtcTimestamp();
    setReferences(prev => [...prev, { url: newReference.trim(), id: `ref-${Date.now()}`, created_at: utcTime, created_by: username, last_modified_at: null, last_modified_by: username }]);
    setNewReference('');
  };
  const handleRemoveReference = (id) => setReferences(prev => prev.filter(item => item.id !== id));
  // --- 핸들러 끝 ---


  const handleSubmit = async (e) => {
     e.preventDefault(); // Prevent default form submission if wrapped in <form>

     // Basic Validation
     if (!formData.cveId.trim() || !formData.title.trim()) {
       setError('CVE ID와 제목은 필수 항목입니다.');
       enqueueSnackbar('필수 입력 값을 확인해주세요.', { variant: 'warning' });
       return;
     }
     setError(null);
    // setLoading(true); // isLoading 사용

    const currentTime = getUtcTimestamp();
    const cveData = {
      ...formData, // cveId, title, description, status, severity, tags (array), exploitStatus
      pocs: pocs.map(({ id, ...rest }) => rest),
      snortRules: snortRules.map(({ id, ...rest }) => rest),
      references: references.map(({ id, ...rest }) => rest),
      createdAt: currentTime,
      lastModifiedAt: currentTime,
      publishedDate: currentTime, // Example
    };

    // Date validation (optional)
    if (!cveData.createdAt || !cveData.lastModifiedAt || !cveData.publishedDate) {
      handleError(new Error('날짜 필드 생성 중 오류 발생'));
      // setLoading(false);
      return;
    }

    mutate(cveData);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose} // 닫기 핸들러 연결
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '80vh', borderRadius: antdBorderRadius } }} // AntD 유사 반경 적용
    >
      {/* AntD Modal Title과 유사하게 DialogTitle 스타일 조정 */}
      <DialogTitle sx={{ pb: 1, borderBottom: `1px solid ${antdBorderColor}` }}>
         {/* 폰트 크기/굵기 조정 */}
        <Typography variant="h6" component="div" sx={{ fontWeight: 500 }}>
            새 CVE 등록
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: '20px !important', backgroundColor: '#f5f5f5' }}> {/* AntD 배경색과 유사하게 */}
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, borderRadius: antdBorderRadius }}>
            {error}
          </Alert>
        )}
         {/* mutationError는 스낵바로 처리되므로 Alert 중복 제거 가능 */}

        {/* 각 섹션을 Paper 대신 Box로 감싸고 스타일 적용 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 기본 정보 섹션 */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
            <Typography variant="subtitle1" sx={{ mb: 2.5, fontWeight: 500 }}>기본 정보</Typography> {/* AntD Card title과 유사하게 */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4} lg={3}>
                <TextField
                  required fullWidth label="CVE ID" name="cveId"
                  value={formData.cveId} onChange={handleInputChange}
                  helperText="Format: CVE-YYYY-NNNNN"
                  size="small" // AntD 인풋 높이와 유사하게
                  sx={inputStyles(theme)}
                  error={!formData.cveId.trim() && !!error} // 에러 상태일 때 표시
                />
              </Grid>
              <Grid item xs={12} sm={6} md={8} lg={5}>
                <TextField
                  required fullWidth label="제목" name="title"
                  value={formData.title} onChange={handleInputChange}
                  size="small" sx={inputStyles(theme)}
                   error={!formData.title.trim() && !!error}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <FormControl fullWidth size="small" sx={inputStyles(theme)}>
                  <InputLabel>상태</InputLabel>
                  <Select name="status" value={formData.status} onChange={handleInputChange} label="상태">
                    {STATUS_OPTIONS.map(option => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <FormControl fullWidth size="small" sx={inputStyles(theme)}>
                  <InputLabel>심각도</InputLabel>
                  <Select name="severity" value={formData.severity} onChange={handleInputChange} label="심각도">
                    {SEVERITY_OPTIONS.map(option => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <TextField
              label="설명" name="description"
              value={formData.description} onChange={handleInputChange}
              multiline rows={4} fullWidth size="small"
              sx={{ ...inputStyles(theme), mt: 2 }}
            />
             {/* MUI Autocomplete for Tags */}
             <Autocomplete
                multiple freeSolo options={[]} value={formData.tags}
                onChange={handleTagsChange}
                renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                        // Chip 스타일을 AntD Tag와 유사하게 조정
                        <Chip
                            label={option}
                            size="small" // 작은 사이즈
                            sx={tagStyles(theme, 'tag', option)} // 공통 태그 스타일 적용
                            {...getTagProps({ index })}
                         />
                    ))
                }
                renderInput={(params) => (
                    <TextField {...params} label="태그" placeholder="태그 입력 후 Enter"
                               size="small" sx={{ ...inputStyles(theme), mt: 2 }} />
                )}
                sx={{ mt: 2 }}
            />
          </Paper>

          {/* PoCs 섹션 */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
             <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>Proof of Concepts (PoCs)</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ ...inputStyles(theme), width: '25%', minWidth: 150 }}>
                <InputLabel>Source</InputLabel>
                <Select value={newPoc.source} onChange={(e) => setNewPoc(prev => ({ ...prev, source: e.target.value }))} label="Source">
                  {Object.entries(POC_SOURCES).map(([key, value]) => (<MenuItem key={key} value={value}>{value}</MenuItem>))}
                </Select>
              </FormControl>
              <TextField
                size="small" placeholder="PoC URL" value={newPoc.url}
                onChange={(e) => setNewPoc(prev => ({ ...prev, url: e.target.value }))}
                sx={{ ...inputStyles(theme), flexGrow: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPoc()}
              />
              {/* AntD dashed 버튼과 유사하게 Outlined 버튼 + borderStyle */}
              <Button
                 variant="outlined"
                 onClick={handleAddPoc}
                 startIcon={<AddIcon />}
                 sx={{
                     borderRadius: antdBorderRadius,
                     borderColor: antdBorderColor,
                     color: theme.palette.text.secondary,
                     borderStyle: 'dashed', // 대시선 스타일
                     height: antdInputHeight, // 높이 맞추기
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
            {/* 목록 표시 영역 스타일 */}
            <Box sx={{ maxHeight: '200px', overflowY: 'auto', p: 1, bgcolor: antdListBgColor, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
              {pocs.length === 0 ? (
                <Typography variant="body2" color="textSecondary" align="center" sx={{ p: 2 }}>추가된 PoC가 없습니다.</Typography>
              ) : (
                pocs.map((poc) => (
                  // 목록 아이템 스타일
                  <Paper key={poc.id} elevation={0} sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: '4px', border: `1px solid ${alpha(antdBorderColor, 0.6)}`, '&:last-child': { mb: 0 } }}>
                    <Typography variant="body2" sx={{ width: '25%', fontWeight: 500, flexShrink: 0 }}>{poc.source}</Typography>
                    <Link href={poc.url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all', color: theme.palette.primary.main }}>
                      {poc.url}
                    </Link>
                    {/* 삭제 버튼 스타일 */}
                    <IconButton onClick={() => handleRemovePoc(poc.id)} size="small" sx={{ color: theme.palette.error.main, '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>

          {/* Snort Rules 섹션 (PoC와 유사하게 스타일 적용) */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
             <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>Snort Rules</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ ...inputStyles(theme), width: '30%', minWidth: 180 }}>
                <InputLabel>Rule Type</InputLabel>
                <Select value={newSnortRule.type} onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))} label="Rule Type">
                  {SNORT_RULE_TYPE_OPTIONS.map(({ label, value }) => (<MenuItem key={value} value={value}>{label}</MenuItem>))}
                </Select>
              </FormControl>
              <TextField
                size="small" placeholder="Snort Rule" value={newSnortRule.rule}
                onChange={(e) => setNewSnortRule(prev => ({ ...prev, rule: e.target.value }))}
                sx={{ ...inputStyles(theme), flexGrow: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSnortRule()}
              />
              <Button variant="outlined" onClick={handleAddSnortRule} startIcon={<AddIcon />} sx={{ /* PoC 추가 버튼과 동일한 스타일 적용 */ borderRadius: antdBorderRadius, borderColor: antdBorderColor, color: theme.palette.text.secondary, borderStyle: 'dashed', height: antdInputHeight, '&:hover': { borderColor: theme.palette.primary.main, color: theme.palette.primary.main, backgroundColor: alpha(theme.palette.primary.main, 0.05), borderStyle: 'dashed' } }}>
                 추가
              </Button>
            </Box>
            <Box sx={{ maxHeight: '200px', overflowY: 'auto', p: 1, bgcolor: antdListBgColor, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
              {snortRules.length === 0 ? (
                 <Typography variant="body2" color="textSecondary" align="center" sx={{ p: 2 }}>추가된 Snort Rule이 없습니다.</Typography>
              ) : (
                snortRules.map((rule) => (
                  <Paper key={rule.id} elevation={0} sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: '4px', border: `1px solid ${alpha(antdBorderColor, 0.6)}`, '&:last-child': { mb: 0 } }}>
                    <Typography variant="body2" sx={{ width: '30%', fontWeight: 500, flexShrink: 0 }}>
                      {SNORT_RULE_TYPE_OPTIONS.find(opt => opt.value === rule.type)?.label || rule.type}
                    </Typography>
                    <Typography variant="body2" sx={{ flexGrow: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8rem' }}> {/* 코드 스타일 */}
                      {rule.rule}
                    </Typography>
                    <IconButton onClick={() => handleRemoveSnortRule(rule.id)} size="small" sx={{ color: theme.palette.error.main, '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>

          {/* References 섹션 (PoC와 유사하게 스타일 적용) */}
           <Paper elevation={0} sx={{ p: 2.5, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>References</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              <TextField
                size="small" placeholder="참조 URL" value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                fullWidth sx={inputStyles(theme)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddReference()}
              />
               <Button variant="outlined" onClick={handleAddReference} startIcon={<AddIcon />} sx={{ /* PoC 추가 버튼과 동일한 스타일 적용 */ borderRadius: antdBorderRadius, borderColor: antdBorderColor, color: theme.palette.text.secondary, borderStyle: 'dashed', height: antdInputHeight, '&:hover': { borderColor: theme.palette.primary.main, color: theme.palette.primary.main, backgroundColor: alpha(theme.palette.primary.main, 0.05), borderStyle: 'dashed' } }}>
                 추가
              </Button>
            </Box>
            <Box sx={{ maxHeight: '200px', overflowY: 'auto', p: 1, bgcolor: antdListBgColor, borderRadius: antdBorderRadius, border: `1px solid ${antdBorderColor}` }}>
              {references.length === 0 ? (
                 <Typography variant="body2" color="textSecondary" align="center" sx={{ p: 2 }}>추가된 참조 URL이 없습니다.</Typography>
              ) : (
                references.map((ref) => (
                  <Paper key={ref.id} elevation={0} sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: '4px', border: `1px solid ${alpha(antdBorderColor, 0.6)}`, '&:last-child': { mb: 0 } }}>
                    <Link href={ref.url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all', color: theme.palette.primary.main }}>
                      {ref.url}
                    </Link>
                    <IconButton onClick={() => handleRemoveReference(ref.id)} size="small" sx={{ color: theme.palette.error.main, '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>

        </Box>
      </DialogContent>
      {/* DialogActions 스타일 조정 */}
      <DialogActions sx={{ p: 2, borderTop: `1px solid ${antdBorderColor}`, backgroundColor: '#fff' }}>
        <Button
          onClick={handleClose}
          variant="outlined" // 기본 outlined 버튼
          sx={{ borderRadius: antdBorderRadius, borderColor: antdBorderColor, color: theme.palette.text.primary }}
        >
          취소
        </Button>
        <Button
          variant="contained" // 주요 액션 버튼
          color="primary" // MUI 프라이머리 색상 사용
          onClick={handleSubmit}
          disabled={isLoading || !formData.cveId.trim()}
          startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : null}
          sx={{
            borderRadius: antdBorderRadius,
            boxShadow: 'none', // AntD 버튼은 기본 그림자가 약함
          }}
        >
          CVE 생성
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateCVE;