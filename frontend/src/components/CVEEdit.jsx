import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Alert,
  Chip,
  Typography,
  Box,
} from '@mui/material';
import axios from 'axios';

const CVEEdit = ({ open, onClose, cveId, onSave }) => {
  const [cve, setCve] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lockError, setLockError] = useState(null);
  const [formData, setFormData] = useState({
    description: '',
    cvssScore: '',
    status: '',
    affectedProducts: [],
    notes: '',
  });

  const loadCVE = useCallback(async () => {
    try {
      // 먼저 잠금 시도
      await lockCVE();
      
      // CVE 데이터 로드
      const response = await axios.get(`/api/cves/${cveId}`);
      setCve(response.data);
      setFormData({
        description: response.data.description || '',
        cvssScore: response.data.cvssScore || '',
        status: response.data.status || '',
        affectedProducts: response.data.affectedProducts || [],
        notes: response.data.notes || '',
      });
      setLoading(false);
    } catch (err) {
      if (err.response?.status === 423) {
        // 잠금 실패 (다른 사용자가 편집 중)
        setLockError(err.response.data);
        onClose();
      } else {
        setError('Failed to load CVE data');
      }
      setLoading(false);
    }
  }, [cveId]);

  const lockCVE = useCallback(async () => {
    try {
      await axios.post(`/api/cve/${cveId}/lock`);
      // 30분마다 잠금 연장
      const intervalId = setInterval(async () => {
        try {
          await axios.post(`/api/cve/${cveId}/lock`);
        } catch (err) {
          console.error('Failed to extend lock:', err);
        }
      }, 25 * 60 * 1000); // 25분마다 연장 (만료 시간보다 일찍)
      
      // cleanup function
      return () => clearInterval(intervalId);
    } catch (err) {
      throw err;
    }
  }, [cveId]);

  const unlockCVE = useCallback(async () => {
    try {
      await axios.post(`/api/cve/${cveId}/unlock`);
    } catch (err) {
      console.error('Failed to unlock CVE:', err);
    }
  }, [cveId]);

  useEffect(() => {
    if (open && cveId) {
      loadCVE();
    }
    return () => {
      // 컴포넌트 언마운트 시 잠금 해제
      if (cveId) {
        unlockCVE();
      }
    };
  }, [open, cveId, loadCVE, unlockCVE]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    try {
      await axios.put(`/api/cves/${cveId}`, formData);
      await unlockCVE();
      onSave();
      onClose();
    } catch (err) {
      setError('Failed to save changes');
    }
  };

  const handleClose = async () => {
    await unlockCVE();
    onClose();
  };

  if (loading) {
    return null;
  }

  if (lockError) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogTitle>CVE is Locked</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            This CVE is currently being edited by {lockError.lockedBy}.
            Lock expires at {new Date(lockError.lockExpiresAt).toLocaleString()}.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
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
              name="description"
              label="Description"
              multiline
              rows={4}
              fullWidth
              value={formData.description}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              name="cvssScore"
              label="CVSS Score"
              type="number"
              fullWidth
              value={formData.cvssScore}
              onChange={handleInputChange}
              inputProps={{ min: 0, max: 10, step: 0.1 }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              name="status"
              label="Status"
              select
              fullWidth
              value={formData.status}
              onChange={handleInputChange}
              SelectProps={{
                native: true,
              }}
            >
              <option value="unassigned">Unassigned</option>
              <option value="in-progress">In Progress</option>
              <option value="analyzed">Analyzed</option>
              <option value="completed">Completed</option>
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Affected Products
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {formData.affectedProducts.map((product, index) => (
                <Chip
                  key={index}
                  label={product}
                  onDelete={() => {
                    const newProducts = formData.affectedProducts.filter((_, i) => i !== index);
                    setFormData(prev => ({ ...prev, affectedProducts: newProducts }));
                  }}
                />
              ))}
            </Box>
          </Grid>
          <Grid item xs={12}>
            <TextField
              name="notes"
              label="Analysis Notes"
              multiline
              rows={4}
              fullWidth
              value={formData.notes}
              onChange={handleInputChange}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CVEEdit;
