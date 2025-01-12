import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Alert,
  Box,
  Typography,
  IconButton,
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

const CVEEdit = ({ open, onClose, cveId, onSave }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    cveId: '',
    title: '',
    description: '',
    status: '',
    pocs: [],
    snortRules: [],
    affectedProducts: [],
    references: []
  });

  const [newPoc, setNewPoc] = useState({ source: POC_SOURCES.Etc, url: '', description: '' });
  const [newSnortRule, setNewSnortRule] = useState({ 
    rule: '', 
    type: SNORT_RULE_TYPES["사용자 정의"], 
    description: '' 
  });

  useEffect(() => {
    if (open && cveId) {
      loadCVE();
    }
  }, [open, cveId]);

  const loadCVE = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:8000/api/cves/${cveId}`);
      setFormData({
        cveId: response.data.cveId,
        title: response.data.title || '',
        description: response.data.description || '',
        status: response.data.status || '',
        pocs: response.data.pocs || [],
        snortRules: response.data.snortRules || [],
        affectedProducts: response.data.affectedProducts || [],
        references: response.data.references || []
      });
    } catch (err) {
      console.error('Error loading CVE:', err);
      setError('Failed to load CVE data');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSave = async () => {
    try {
      // 변경된 필드만 추출
      const changedFields = {};
      Object.keys(formData).forEach(key => {
        if (formData[key] !== undefined) {
          changedFields[key] = formData[key];
        }
      });

      const response = await axios.patch(`http://localhost:8000/api/cves/${cveId}`, changedFields);
      onSave(response.data);
      onClose();
    } catch (err) {
      console.error('Error saving CVE:', err);
      setError(err.response?.data?.detail || 'Failed to save changes');
    }
  };

  if (loading) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit CVE: {cveId}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              name="title"
              label="Title"
              fullWidth
              value={formData.title}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              name="description"
              label="Description"
              fullWidth
              multiline
              rows={4}
              value={formData.description}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                label="Status"
              >
                {STATUS_OPTIONS.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* POCs Section */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              POCs
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={3}>
                  <FormControl fullWidth>
                    <InputLabel>Source</InputLabel>
                    <Select
                      value={newPoc.source}
                      onChange={(e) => setNewPoc(prev => ({ ...prev, source: e.target.value }))}
                      label="Source"
                    >
                      {Object.entries(POC_SOURCES).map(([key, value]) => (
                        <MenuItem key={key} value={value}>
                          {value}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="URL"
                    value={newPoc.url}
                    onChange={(e) => setNewPoc(prev => ({ ...prev, url: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Description"
                    value={newPoc.description}
                    onChange={(e) => setNewPoc(prev => ({ ...prev, description: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={1}>
                  <IconButton onClick={handleAddPoc} color="primary">
                    <AddIcon />
                  </IconButton>
                </Grid>
              </Grid>
            </Box>
            {formData.pocs.map((poc, index) => (
              <Box key={index} sx={{ mb: 1 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={3}>
                    <Typography variant="body2">{poc.source}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2">{poc.url}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2">{poc.description}</Typography>
                  </Grid>
                  <Grid item xs={1}>
                    <IconButton onClick={() => handleRemovePoc(index)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              </Box>
            ))}
          </Grid>

          {/* Snort Rules Section */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Snort Rules
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={3}>
                  <FormControl fullWidth>
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={newSnortRule.type}
                      onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))}
                      label="Type"
                    >
                      {Object.entries(SNORT_RULE_TYPES).map(([key, value]) => (
                        <MenuItem key={key} value={value}>
                          {value}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Rule"
                    value={newSnortRule.rule}
                    onChange={(e) => setNewSnortRule(prev => ({ ...prev, rule: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    label="Description"
                    value={newSnortRule.description}
                    onChange={(e) => setNewSnortRule(prev => ({ ...prev, description: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={1}>
                  <IconButton onClick={handleAddSnortRule} color="primary">
                    <AddIcon />
                  </IconButton>
                </Grid>
              </Grid>
            </Box>
            {formData.snortRules.map((rule, index) => (
              <Box key={index} sx={{ mb: 1 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={3}>
                    <Typography variant="body2">{rule.type}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2">{rule.rule}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2">{rule.description}</Typography>
                  </Grid>
                  <Grid item xs={1}>
                    <IconButton onClick={() => handleRemoveSnortRule(index)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              </Box>
            ))}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CVEEdit;
