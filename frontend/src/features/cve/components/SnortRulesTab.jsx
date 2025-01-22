import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  IconButton,
  Chip,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';

const SNORT_RULE_TYPES = {
  USER_DEFINED: '사용자 정의',
  IPS: 'IPS',
  ONE: 'ONE',
  UTM: 'UTM',
  EMERGING_THREATS: 'Emerging Threats',
  SNORT_OFFICIAL: 'Snort Official'
};

const SnortRulesTab = ({
  snortRules = [],
  newSnortRule,
  setNewSnortRule,
  snortRuleDialogOpen,
  setSnortRuleDialogOpen,
  onAddSnortRule,
  onDeleteSnortRule,
  onUpdateSnortRule,
  loading,
  error,
  editingSnortRuleIndex,
  setEditingSnortRuleIndex,
  editingSnortRule,
  setEditingSnortRule
}) => {
  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setSnortRuleDialogOpen(true)}
          disabled={loading}
        >
          Snort Rule 추가
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Rule</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {snortRules.map((rule, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Chip
                    label={SNORT_RULE_TYPES[rule.type] || rule.type}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {rule.rule}
                    <IconButton
                      size="small"
                      onClick={() => navigator.clipboard.writeText(rule.rule)}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>{rule.description}</TableCell>
                <TableCell align="right">
                  <IconButton
                    onClick={() => {
                      setEditingSnortRuleIndex(index);
                      setEditingSnortRule({ ...rule });
                    }}
                    disabled={loading}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => onDeleteSnortRule(index)}
                    disabled={loading}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={snortRuleDialogOpen}
        onClose={() => setSnortRuleDialogOpen(false)}
      >
        <DialogTitle>Snort Rule 추가</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={newSnortRule.type}
              onChange={(e) =>
                setNewSnortRule({ ...newSnortRule, type: e.target.value })
              }
              label="Type"
            >
              {Object.entries(SNORT_RULE_TYPES).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Rule"
            value={newSnortRule.rule}
            onChange={(e) =>
              setNewSnortRule({ ...newSnortRule, rule: e.target.value })
            }
            multiline
            rows={4}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={newSnortRule.description}
            onChange={(e) =>
              setNewSnortRule({ ...newSnortRule, description: e.target.value })
            }
            multiline
            rows={2}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnortRuleDialogOpen(false)}>취소</Button>
          <Button onClick={onAddSnortRule} variant="contained" disabled={loading}>
            추가
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editingSnortRuleIndex !== null}
        onClose={() => {
          setEditingSnortRuleIndex(null);
          setEditingSnortRule(null);
        }}
      >
        <DialogTitle>Snort Rule 수정</DialogTitle>
        <DialogContent>
          {editingSnortRule && (
            <>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={editingSnortRule.type}
                  onChange={(e) =>
                    setEditingSnortRule({
                      ...editingSnortRule,
                      type: e.target.value
                    })
                  }
                  label="Type"
                >
                  {Object.entries(SNORT_RULE_TYPES).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Rule"
                value={editingSnortRule.rule}
                onChange={(e) =>
                  setEditingSnortRule({
                    ...editingSnortRule,
                    rule: e.target.value
                  })
                }
                multiline
                rows={4}
                sx={{ mt: 2 }}
              />
              <TextField
                fullWidth
                label="Description"
                value={editingSnortRule.description}
                onChange={(e) =>
                  setEditingSnortRule({
                    ...editingSnortRule,
                    description: e.target.value
                  })
                }
                multiline
                rows={2}
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditingSnortRuleIndex(null);
              setEditingSnortRule(null);
            }}
          >
            취소
          </Button>
          <Button
            onClick={() => onUpdateSnortRule(editingSnortRuleIndex)}
            variant="contained"
            disabled={loading}
          >
            수정
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SnortRulesTab;
