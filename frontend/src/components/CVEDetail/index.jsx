import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  IconButton,
  Typography,
  Tabs,
  Tab,
  Alert
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { api } from '../../utils/auth';
import TabPanel from './TabPanel';
import ReferencesTab from './ReferencesTab';
import PoCTab from './PoCTab';
import SnortRulesTab from './SnortRulesTab';

const CVEDetail = ({ open, onClose, cve: initialCve, onSave }) => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cve, setCve] = useState(initialCve);

  // References 상태
  const [newReferenceUrl, setNewReferenceUrl] = useState('');

  // PoC 상태
  const [pocDialogOpen, setPocDialogOpen] = useState(false);
  const [newPoc, setNewPoc] = useState({
    source: 'Etc',
    url: '',
    description: ''
  });
  const [editingPocId, setEditingPocId] = useState(null);
  const [editingPocData, setEditingPocData] = useState(null);

  // Snort Rules 상태
  const [snortRuleDialogOpen, setSnortRuleDialogOpen] = useState(false);
  const [newSnortRule, setNewSnortRule] = useState({
    type: 'USER_DEFINED',
    rule: '',
    description: ''
  });
  const [editingSnortRuleIndex, setEditingSnortRuleIndex] = useState(null);
  const [editingSnortRule, setEditingSnortRule] = useState(null);

  useEffect(() => {
    if (initialCve) {
      setCve(initialCve);
    }
  }, [initialCve]);

  useEffect(() => {
    if (!open) {
      setTabValue(0);
    }
  }, [open]);

  // References 핸들러
  const handleAddReference = async () => {
    if (!newReferenceUrl) return;

    try {
      setLoading(true);
      setError('');

      const updatedCve = {
        ...cve,
        references: [...cve.references, newReferenceUrl]
      };

      const response = await api.patch(`/cves/${cve.cveId}`, {
        references: updatedCve.references
      });

      setCve(response.data);
      setNewReferenceUrl('');
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error adding reference:', error);
      setError('레퍼런스 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReference = async (indexToDelete) => {
    try {
      setLoading(true);
      setError('');

      const updatedReferences = cve.references.filter(
        (_, index) => index !== indexToDelete
      );
      const response = await api.patch(`/cves/${cve.cveId}`, {
        references: updatedReferences
      });

      setCve(response.data);
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error deleting reference:', error);
      setError('레퍼런스 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // PoC 핸들러
  const handleAddPoc = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await api.post(`/cves/${cve.cveId}/poc`, newPoc);
      setCve(response.data);
      setPocDialogOpen(false);
      setNewPoc({
        source: 'Etc',
        url: '',
        description: ''
      });
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error adding PoC:', error);
      setError('PoC 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePoc = async () => {
    if (!editingPocId || !editingPocData) return;

    try {
      setLoading(true);
      setError('');

      const response = await api.patch(
        `/cves/${cve.cveId}/poc/${editingPocId}`,
        editingPocData
      );
      setCve(response.data);
      setEditingPocId(null);
      setEditingPocData(null);
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error updating PoC:', error);
      setError('PoC 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePoc = async (pocId) => {
    try {
      setLoading(true);
      setError('');

      const response = await api.delete(`/cves/${cve.cveId}/poc/${pocId}`);
      setCve(response.data);
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error deleting PoC:', error);
      setError('PoC 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Snort Rules 핸들러
  const handleAddSnortRule = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await api.post(
        `/cves/${cve.cveId}/snort-rule`,
        newSnortRule
      );
      setCve(response.data);
      setSnortRuleDialogOpen(false);
      setNewSnortRule({
        type: 'USER_DEFINED',
        rule: '',
        description: ''
      });
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error adding Snort rule:', error);
      setError('Snort Rule 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSnortRule = async (index) => {
    if (!editingSnortRule) return;

    try {
      setLoading(true);
      setError('');

      const response = await api.patch(
        `/cves/${cve.cveId}/snort-rule/${index}`,
        editingSnortRule
      );
      setCve(response.data);
      setEditingSnortRuleIndex(null);
      setEditingSnortRule(null);
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error updating Snort rule:', error);
      setError('Snort Rule 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSnortRule = async (index) => {
    try {
      setLoading(true);
      setError('');

      const response = await api.delete(`/cves/${cve.cveId}/snort-rule/${index}`);
      setCve(response.data);
      if (onSave) onSave(response.data);
    } catch (error) {
      console.error('Error deleting Snort rule:', error);
      setError('Snort Rule 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '80vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{cve.cveId}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            aria-label="CVE detail tabs"
          >
            <Tab label="References" />
            <Tab label="PoC" />
            <Tab label="Snort Rules" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <ReferencesTab
            references={cve.references}
            newReferenceUrl={newReferenceUrl}
            setNewReferenceUrl={setNewReferenceUrl}
            onAddReference={handleAddReference}
            onDeleteReference={handleDeleteReference}
            loading={loading}
            error={error}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <PoCTab
            pocs={cve.pocs}
            newPoc={newPoc}
            setNewPoc={setNewPoc}
            pocDialogOpen={pocDialogOpen}
            setPocDialogOpen={setPocDialogOpen}
            onAddPoc={handleAddPoc}
            onDeletePoc={handleDeletePoc}
            onUpdatePoc={handleUpdatePoc}
            loading={loading}
            error={error}
            editingPocId={editingPocId}
            editingPocData={editingPocData}
            setEditingPocId={setEditingPocId}
            setEditingPocData={setEditingPocData}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <SnortRulesTab
            snortRules={cve.snortRules}
            newSnortRule={newSnortRule}
            setNewSnortRule={setNewSnortRule}
            snortRuleDialogOpen={snortRuleDialogOpen}
            setSnortRuleDialogOpen={setSnortRuleDialogOpen}
            onAddSnortRule={handleAddSnortRule}
            onDeleteSnortRule={handleDeleteSnortRule}
            onUpdateSnortRule={handleUpdateSnortRule}
            loading={loading}
            error={error}
            editingSnortRuleIndex={editingSnortRuleIndex}
            setEditingSnortRuleIndex={setEditingSnortRuleIndex}
            editingSnortRule={editingSnortRule}
            setEditingSnortRule={setEditingSnortRule}
          />
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
};

export default CVEDetail;
