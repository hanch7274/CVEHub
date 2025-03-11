import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import api from '../../api/config/axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

const POC_SOURCES = {
  Etc: "Etc",
  Metasploit: "Metasploit",
  "Nuclei-Templates": "Nuclei-Templates"
};

const SNORT_RULE_TYPES = {
  "사용자 정의": "USER_DEFINED",
  "IPS": "IPS",
  "ONE": "ONE",
  "UTM": "UTM",
  "Emerging-Threats": "EMERGING_THREATS",
  "Snort Official": "SNORT_OFFICIAL"
};

const SNORT_RULE_TYPE_OPTIONS = Object.entries(SNORT_RULE_TYPES).map(([label, value]) => ({
  label,
  value
}));

const STATUS_OPTIONS = [
  { value: '신규등록', label: '신규등록' },
  { value: '분석중', label: '분석중' },
  { value: '릴리즈 완료', label: '릴리즈 완료' },
  { value: '분석불가', label: '분석불가' }
];

const CreateCVE = ({ open = false, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    cveId: '',
    title: '',
    description: '',
    status: '신규등록',
    publishedDate: new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString(),
    pocs: [],
    snortRules: [],
    references: [],
    severity: 'Low',
    exploitStatus: 'Unknown',
    tags: ''
  });

  const [newPoc, setNewPoc] = useState({ source: POC_SOURCES.Etc, url: '', description: '' });
  const [newSnortRule, setNewSnortRule] = useState({ 
    rule: '', 
    type: 'USER_DEFINED', 
    description: '' 
  });
  const [newReference, setNewReference] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  // React Query 뮤테이션 설정
  const createCVEMutation = useMutation({
    mutationFn: async (cveData) => {
      const requestData = {
        cve_id: cveData.cveId,
        description: cveData.description,
        status: cveData.status,
        severity: cveData.severity,
        exploit_status: cveData.exploitStatus,
        references: cveData.references,
        pocs: cveData.pocs,
        snort_rules: cveData.snortRules,
        last_updated: cveData.lastUpdated,
        tags: cveData.tags
      };
      
      const response = await api.post('/cves', requestData);
      return response.data;
    },
    onSuccess: (data) => {
      // CVE 목록 데이터 무효화
      queryClient.invalidateQueries({ queryKey: ['cves'] });
      
      // 성공 메시지 표시
      enqueueSnackbar('CVE가 성공적으로 생성되었습니다', { variant: 'success' });
      
      // 콜백 실행
      if (onSuccess) {
        onSuccess(data);
      }
      
      // 다이얼로그 닫기
      if (onClose) {
        onClose();
      }
      
      // 새로 생성된 CVE로 이동
      if (data && data.cveId) {
        navigate(`/cves/${data.cveId}`);
      }
      
      setLoading(false);
    },
    onError: (error) => {
      setError(error.response?.data?.message || '에러가 발생했습니다');
      setLoading(false);
    }
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddPoc = () => {
    if (!newPoc.url.trim()) return;
    setFormData(prev => ({
      ...prev,
      pocs: [...prev.pocs, { ...newPoc }]
    }));
    setNewPoc({ source: POC_SOURCES.Etc, url: '', description: '' });
  };

  const handleRemovePoc = (index) => {
    setFormData(prev => ({
      ...prev,
      pocs: prev.pocs.filter((_, i) => i !== index)
    }));
  };

  const handleAddSnortRule = () => {
    if (!newSnortRule.rule.trim()) return;
    setFormData(prev => ({
      ...prev,
      snortRules: [...prev.snortRules, { ...newSnortRule }]
    }));
    setNewSnortRule({ 
      rule: '', 
      type: 'USER_DEFINED', 
      description: ''
    });
  };

  const handleRemoveSnortRule = (index) => {
    setFormData(prev => ({
      ...prev,
      snortRules: prev.snortRules.filter((_, i) => i !== index)
    }));
  };

  const handleAddReference = () => {
    if (newReference.trim()) {
      setFormData(prev => ({
        ...prev,
        references: [...prev.references, { url: newReference.trim(), dateAdded: new Date().toISOString() }]
      }));
      setNewReference('');
    }
  };

  const handleRemoveReference = (index) => {
    setFormData(prev => ({
      ...prev,
      references: prev.references.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setLoading(true);
    setError(null);
    
    // 제출할 데이터 준비
    const cveData = {
      cveId: formData.cveId,
      title: formData.title,
      description: formData.description,
      status: formData.status,
      publishedDate: formData.publishedDate,
      pocs: formData.pocs,
      snortRules: formData.snortRules,
      references: formData.references,
      severity: formData.severity,
      exploitStatus: formData.exploitStatus,
      lastUpdated: new Date().toISOString(),
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
    };
    
    // React Query 뮤테이션 실행
    createCVEMutation.mutate(cveData);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth 
      PaperProps={{ sx: { minHeight: '80vh' } }}
    >
      <DialogTitle>
        Create New CVE
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
          {/* 기본 정보 */}
          <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, color: 'text.primary' }}>기본 정보</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr', gap: 2 }}>
              <TextField
                required
                label="CVE ID"
                name="cveId"
                value={formData.cveId}
                onChange={handleInputChange}
                helperText="Format: CVE-YYYY-NNNNN"
                size="medium"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              />
              
              <TextField
                label="Title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                size="medium"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              />

              <FormControl size="medium">
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  label="Status"
                  sx={{ borderRadius: 1 }}
                >
                  {STATUS_OPTIONS.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <TextField
              label="Description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              multiline
              rows={4}
              size="medium"
              fullWidth
              sx={{ mt: 2, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
            />
          </Paper>

          {/* PoCs */}
          <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, color: 'text.primary' }}>Proof of Concepts (PoCs)</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <FormControl size="medium" sx={{ width: '25%', minWidth: 100 }}>
                <InputLabel>Source</InputLabel>
                <Select
                  value={newPoc.source}
                  onChange={(e) => setNewPoc(prev => ({ ...prev, source: e.target.value }))}
                  label="Source"
                  sx={{ borderRadius: 1 }}
                >
                  {Object.entries(POC_SOURCES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>{value}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="medium"
                placeholder="URL"
                value={newPoc.url}
                onChange={(e) => setNewPoc(prev => ({ ...prev, url: e.target.value }))}
                sx={{ flexGrow: 1, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              />
              <IconButton 
                onClick={handleAddPoc} 
                sx={{ 
                  bgcolor: 'primary.main', 
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  borderRadius: 1
                }}
              >
                <AddIcon />
              </IconButton>
            </Box>
            <Box sx={{ 
              bgcolor: 'background.default', 
              borderRadius: 1,
              p: 2,
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {formData.pocs.map((poc, index) => (
                <Paper 
                  key={index} 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    mb: 1, 
                    display: 'flex', 
                    gap: 1, 
                    alignItems: 'center',
                    '&:last-child': { mb: 0 }
                  }}
                >
                  <Typography variant="body2" sx={{ width: '30%', fontWeight: 500 }}>{poc.source}</Typography>
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>{poc.url}</Typography>
                  <IconButton 
                    onClick={() => handleRemovePoc(index)} 
                    size="small"
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Box>
          </Paper>

          {/* Snort Rules */}
          <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, color: 'text.primary' }}>Snort Rules</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <FormControl size="medium" sx={{ width: '25%', minWidth: 100 }}>
                <InputLabel>Rule Type</InputLabel>
                <Select
                  value={newSnortRule.type}
                  onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))}
                  label="Rule Type"
                >
                  {SNORT_RULE_TYPE_OPTIONS.map(({ label, value }) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="medium"
                placeholder="Rule"
                value={newSnortRule.rule}
                onChange={(e) => setNewSnortRule(prev => ({ ...prev, rule: e.target.value }))}
                sx={{ flexGrow: 1, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              />
              <IconButton 
                onClick={handleAddSnortRule}
                sx={{ 
                  bgcolor: 'primary.main', 
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  borderRadius: 1
                }}
              >
                <AddIcon />
              </IconButton>
            </Box>
            <Box sx={{ 
              bgcolor: 'background.default', 
              borderRadius: 1,
              p: 2,
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {formData.snortRules.map((rule, index) => (
                <Paper 
                  key={index} 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    mb: 1, 
                    display: 'flex', 
                    gap: 1, 
                    alignItems: 'center',
                    '&:last-child': { mb: 0 }
                  }}
                >
                  <Typography variant="body2" sx={{ width: '30%', fontWeight: 500 }}>{rule.type}</Typography>
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>{rule.rule}</Typography>
                  <IconButton 
                    onClick={() => handleRemoveSnortRule(index)} 
                    size="small"
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Box>
          </Paper>

          {/* References */}
          <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, color: 'text.primary' }}>References</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="medium"
                placeholder="Reference URL"
                value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              />
              <IconButton 
                onClick={handleAddReference}
                sx={{ 
                  bgcolor: 'primary.main', 
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  borderRadius: 1
                }}
              >
                <AddIcon />
              </IconButton>
            </Box>
            <Box sx={{ 
              bgcolor: 'background.default', 
              borderRadius: 1,
              p: 2,
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {formData.references.map((ref, index) => (
                <Paper 
                  key={index} 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    mb: 1, 
                    display: 'flex', 
                    gap: 1, 
                    alignItems: 'center',
                    '&:last-child': { mb: 0 }
                  }}
                >
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>{ref.url}</Typography>
                  <IconButton 
                    onClick={() => handleRemoveReference(index)} 
                    size="small"
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Box>
          </Paper>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button 
          onClick={onClose}
          variant="outlined"
          sx={{ borderRadius: 1 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!formData.cveId.trim() || loading}
          sx={{ 
            borderRadius: 1,
            bgcolor: 'success.main',
            '&:hover': { bgcolor: 'success.dark' }
          }}
        >
          Create CVE
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateCVE;
