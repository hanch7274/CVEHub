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

const CreateCVE = ({ open, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    cveId: '',
    references: [],
    pocs: [],
    snortRules: [],
  });
  const [newReference, setNewReference] = useState({ source: '', url: '' });
  const [newPoc, setNewPoc] = useState({ source: POC_SOURCES.Etc, url: '', description: '' });
  const [newSnortRule, setNewSnortRule] = useState({ 
    rule: '', 
    type: SNORT_RULE_TYPES["사용자 정의"], 
    description: '', 
    addedBy: '' 
  });
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddReference = () => {
    if (!newReference.source.trim() || !newReference.url.trim()) return;
    setFormData(prev => ({
      ...prev,
      references: [...prev.references, { ...newReference }]
    }));
    setNewReference({ source: '', url: '' });
  };

  const handleRemoveReference = (index) => {
    setFormData(prev => ({
      ...prev,
      references: prev.references.filter((_, i) => i !== index)
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
      description: '', 
      addedBy: '' 
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

      const response = await axios.post('/api/cve', formData);
      onSuccess(response.data);
      onClose();
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to create CVE');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create New CVE</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <TextField
          fullWidth
          label="CVE ID"
          name="cveId"
          value={formData.cveId}
          onChange={handleInputChange}
          placeholder="CVE-YYYY-NNNNN"
          margin="normal"
          required
        />

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            References
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              placeholder="Source"
              value={newReference.source}
              onChange={(e) => setNewReference(prev => ({ ...prev, source: e.target.value }))}
            />
            <TextField
              size="small"
              placeholder="URL"
              value={newReference.url}
              onChange={(e) => setNewReference(prev => ({ ...prev, url: e.target.value }))}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="contained"
              onClick={handleAddReference}
              disabled={!newReference.source.trim() || !newReference.url.trim()}
            >
              <AddIcon />
            </Button>
          </Box>
          {formData.references.map((ref, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1,
                p: 1,
                bgcolor: 'grey.100',
                borderRadius: 1
              }}
            >
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                <strong>{ref.source}:</strong> {ref.url}
              </Typography>
              <IconButton size="small" onClick={() => handleRemoveReference(index)}>
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Proof of Concepts (PoCs)
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            <FormControl size="small">
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
              placeholder="URL"
              value={newPoc.url}
              onChange={(e) => setNewPoc(prev => ({ ...prev, url: e.target.value }))}
            />
            <TextField
              size="small"
              placeholder="Description"
              value={newPoc.description}
              onChange={(e) => setNewPoc(prev => ({ ...prev, description: e.target.value }))}
              multiline
              rows={2}
            />
            <Button
              variant="contained"
              onClick={handleAddPoc}
              disabled={!newPoc.url.trim()}
            >
              Add PoC
            </Button>
          </Box>
          {formData.pocs.map((poc, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                mb: 1,
                p: 1,
                bgcolor: 'grey.100',
                borderRadius: 1
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">{poc.source}</Typography>
                <IconButton size="small" onClick={() => handleRemovePoc(index)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
              <Typography variant="body2">
                <strong>URL:</strong> {poc.url}
              </Typography>
              {poc.description && (
                <Typography variant="body2">
                  <strong>Description:</strong> {poc.description}
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Snort Rules
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              placeholder="Rule"
              value={newSnortRule.rule}
              onChange={(e) => setNewSnortRule(prev => ({ ...prev, rule: e.target.value }))}
              multiline
              rows={2}
            />
            <FormControl size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={newSnortRule.type}
                onChange={(e) => setNewSnortRule(prev => ({ ...prev, type: e.target.value }))}
                label="Type"
              >
                {Object.entries(SNORT_RULE_TYPES).map(([key, value]) => (
                  <MenuItem key={key} value={value}>{value}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Description"
              value={newSnortRule.description}
              onChange={(e) => setNewSnortRule(prev => ({ ...prev, description: e.target.value }))}
              multiline
              rows={2}
            />
            <Button
              variant="contained"
              onClick={handleAddSnortRule}
              disabled={!newSnortRule.rule.trim()}
            >
              Add Snort Rule
            </Button>
          </Box>
          {formData.snortRules.map((rule, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                mb: 1,
                p: 1,
                bgcolor: 'grey.100',
                borderRadius: 1
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">
                  {rule.type} Rule
                  {rule.addedBy?.includes("(Crawler)") && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ ml: 1, color: 'text.secondary' }}
                    >
                      (Auto-updated)
                    </Typography>
                  )}
                </Typography>
                <IconButton 
                  size="small" 
                  onClick={() => handleRemoveSnortRule(index)}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
              >
                {rule.rule}
              </Typography>
              {rule.description && (
                <Typography variant="body2">
                  <strong>Description:</strong> {rule.description}
                </Typography>
              )}
            </Box>
          ))}
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
