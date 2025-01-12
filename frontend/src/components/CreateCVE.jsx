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
  IPS: "IPS",
  ONE: "ONE",
  UTM: "UTM",
  "사용자 정의": "사용자 정의",
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
    snortRules: []
  });

  const [newPoc, setNewPoc] = useState({ source: POC_SOURCES.Etc, url: '', description: '' });
  const [newSnortRule, setNewSnortRule] = useState({ 
    rule: '', 
    type: SNORT_RULE_TYPES["사용자 정의"], 
    description: '' 
  });
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
        references: []
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
    <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create New CVE</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {/* 기본 정보 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr', gap: 2 }}>
            <TextField
              required
              label="CVE ID"
              name="cveId"
              value={formData.cveId}
              onChange={handleInputChange}
              helperText="Format: CVE-YYYY-NNNNN"
              size="small"
            />
            
            <TextField
              label="Title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              size="small"
            />

            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                sx={{ height: 40 }}
              >
                {STATUS_OPTIONS.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Description */}
          <TextField
            label="Description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            multiline
            rows={3}
            size="small"
          />

          {/* PoCs */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Proof of Concepts (PoCs)</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <FormControl size="small" sx={{ width: '25%', minWidth: 100 }}>
                <Select
                  value={newPoc.source}
                  onChange={(e) => setNewPoc(prev => ({ ...prev, source: e.target.value }))}
                  sx={{ height: 40 }}
                >
                  {Object.entries(POC_SOURCES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>{value}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="URL"
                value={newPoc.url}
                onChange={(e) => setNewPoc(prev => ({ ...prev, url: e.target.value }))}
                sx={{ flexGrow: 1 }}
              />
              <IconButton onClick={handleAddPoc} size="small">
                <AddIcon />
              </IconButton>
            </Box>
            {formData.pocs.map((poc, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ width: '30%' }}>{poc.source}</Typography>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{poc.url}</Typography>
                <IconButton onClick={() => handleRemovePoc(index)} size="small">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>

          {/* Snort Rules */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Snort Rules</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <FormControl size="small" sx={{ width: '25%', minWidth: 100 }}>
                <Select
                  value={newSnortRule.type}
                  onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))}
                  sx={{ height: 40 }}
                >
                  {Object.entries(SNORT_RULE_TYPES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>{value}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="Rule"
                value={newSnortRule.rule}
                onChange={(e) => setNewSnortRule(prev => ({ ...prev, rule: e.target.value }))}
                sx={{ flexGrow: 1 }}
              />
              <IconButton onClick={handleAddSnortRule} size="small">
                <AddIcon />
              </IconButton>
            </Box>
            {formData.snortRules.map((rule, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ width: '30%' }}>{rule.type}</Typography>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{rule.rule}</Typography>
                <IconButton onClick={() => handleRemoveSnortRule(index)} size="small">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!formData.cveId.trim()}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateCVE;
