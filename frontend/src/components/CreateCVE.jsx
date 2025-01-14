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
import axios from 'axios';

const POC_SOURCES = {
  Etc: "Etc",
  Metasploit: "Metasploit",
  "Nuclei-Templates": "Nuclei-Templates"
};

const SNORT_RULE_TYPES = {
  "사용자 정의": "사용자 정의",
  IPS: "IPS",
  ONE: "ONE",
  UTM: "UTM",
  "Emerging-Threats": "Emerging-Threats",
  "Snort Official": "Snort Official"
};

const STATUS_OPTIONS = [
  { value: "미할당", label: "미할당" },
  { value: "분석중", label: "분석중" },
  { value: "분석완료", label: "분석완료" },
  { value: "대응완료", label: "대응완료" }
];

const CreateCVE = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    cveId: '',
    title: '',
    description: '',
    status: '미할당',
    pocs: [],
    snortRules: [],
    references: []
  });

  const [newPoc, setNewPoc] = useState({ source: POC_SOURCES.Etc, url: '', description: '' });
  const [newSnortRule, setNewSnortRule] = useState({ 
    rule: '', 
    type: SNORT_RULE_TYPES["사용자 정의"], 
    description: '' 
  });
  const [newReference, setNewReference] = useState('');
  const [error, setError] = useState('');

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
      type: SNORT_RULE_TYPES["사용자 정의"], 
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

  const handleSubmit = async () => {
    try {
      setError('');
      
      // CVE ID 형식 검증
      const cvePattern = /^CVE-\d{4}-\d{4,}$/;
      if (!cvePattern.test(formData.cveId)) {
        setError('Invalid CVE ID format. Must be in format: CVE-YYYY-NNNNN');
        return;
      }

      const requestData = {
        cveId: formData.cveId,
        title: formData.title,
        description: formData.description,
        status: formData.status,
        pocs: formData.pocs.map(poc => ({
          source: poc.source,
          url: poc.url,
          description: poc.description || ''
        })),
        snortRules: formData.snortRules.map(rule => ({
          rule: rule.rule,
          type: rule.type,
          description: rule.description || ''
        })),
        affectedProducts: [],
        references: formData.references.map(ref => ({
          url: ref.url,
          dateAdded: ref.dateAdded
        }))
      };

      console.log('Sending request with data:', requestData);

      const response = await axios.post(
        'http://localhost:8000/api/cves',
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          validateStatus: function (status) {
            return status >= 200 && status < 300;
          }
        }
      );

      console.log('Received response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers
      });

      // CVE가 성공적으로 생성됨
      onSuccess(response.data);
      onClose();
    } catch (error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        } : 'No response',
        request: error.request ? 'Request was made but no response received' : 'No request was made'
      });

      let errorMessage;
      if (!error.response) {
        // 네트워크 오류 또는 요청이 전송되지 않음
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.response.status === 400) {
        // 잘못된 요청
        errorMessage = error.response.data.detail || 'Invalid CVE data';
      } else if (error.response.status === 409) {
        // 충돌 (중복된 CVE ID 등)
        errorMessage = 'CVE ID already exists';
      } else if (error.response.status >= 500) {
        // 서버 오류
        errorMessage = 'Server error. Please try again later.';
      } else {
        // 기타 오류
        errorMessage = `Error creating CVE: ${error.message}`;
      }
      
      setError(errorMessage);
    }
  };

  return (
    <Dialog 
      open={onClose !== undefined} 
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
                <InputLabel>Type</InputLabel>
                <Select
                  value={newSnortRule.type}
                  onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))}
                  label="Type"
                  sx={{ borderRadius: 1 }}
                >
                  {Object.entries(SNORT_RULE_TYPES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>{value}</MenuItem>
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
          disabled={!formData.cveId.trim()}
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
