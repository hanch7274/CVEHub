import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Pagination,
  Box,
  Typography,
  TableSortLabel,
  Tooltip,
  Card,
  CardContent,
  Button,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Assignment as AssignmentIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import CVEEdit from './CVEEdit';
import CVEDetail from './CVEDetail';
import CreateCVE from './CreateCVE';

// 임시 데이터
const mockData = [
  {
    cveId: 'CVE-2023-1234',
    description: 'Buffer overflow vulnerability in Example Software',
    cvssScore: 7.5,
    status: 'unassigned',
    affectedProducts: ['Example Software v1.0'],
    publishedDate: new Date('2023-12-01'),
    assignedTo: null,
    pocCount: 2,
    snortRuleCount: 1,
  },
  // 더 많은 목업 데이터 추가 가능
];

const CVEList = () => {
  const theme = useTheme();
  const [page, setPage] = useState(1);
  const [orderBy, setOrderBy] = useState('publishedDate');
  const [order, setOrder] = useState('desc');
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [cves, setCves] = useState(mockData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 현재 사용자 정보 가져오기
        const userResponse = await axios.get('/api/user/me');
        setCurrentUser(userResponse.data);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchData();
  }, []);

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleEditClick = (cve) => {
    setSelectedCVE(cve);
    setEditDialogOpen(true);
  };

  const handleDetailClick = (cve) => {
    setSelectedCVE(cve);
    setDetailDialogOpen(true);
  };

  const handleEditClose = () => {
    setEditDialogOpen(false);
    setSelectedCVE(null);
  };

  const handleDetailClose = () => {
    setDetailDialogOpen(false);
    setSelectedCVE(null);
  };

  const handleCreateClose = () => {
    setCreateDialogOpen(false);
  };

  const handleEditSave = () => {
    // CVE 수정 후 목록 새로고침
    // TODO: Implement refresh logic
  };

  const handleCreateSuccess = (newCve) => {
    // TODO: Implement create success logic
  };

  const handleDelete = async (cveId) => {
    if (!window.confirm(`Are you sure you want to delete CVE ${cveId}?`)) {
      return;
    }

    try {
      await axios.delete(`/api/cve/${cveId}`);
      // 삭제 후 목록 업데이트
      setCves(cves.filter(cve => cve.cveId !== cveId));
    } catch (err) {
      if (err.response?.status === 403) {
        alert('You do not have permission to delete CVEs');
      } else {
        alert(`Error deleting CVE: ${err.message}`);
      }
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'unassigned': 'default',
      'in-progress': 'primary',
      'analyzed': 'info',
      'completed': 'success'
    };
    return colors[status] || 'default';
  };

  const getCVSSColor = (score) => {
    if (score >= 9.0) return '#c62828';
    if (score >= 7.0) return '#ef6c00';
    if (score >= 4.0) return '#f9a825';
    return '#2e7d32';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ color: theme.palette.text.primary }}>
          CVE Database
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Add New CVE
        </Button>
      </Box>

      <Card>
        <TableContainer component={Paper} sx={{ mb: 2 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'cveId'}
                    direction={orderBy === 'cveId' ? order : 'asc'}
                    onClick={() => handleSort('cveId')}
                  >
                    CVE ID
                  </TableSortLabel>
                </TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'publishedDate'}
                    direction={orderBy === 'publishedDate' ? order : 'asc'}
                    onClick={() => handleSort('publishedDate')}
                  >
                    Published Date
                  </TableSortLabel>
                </TableCell>
                <TableCell>PoCs</TableCell>
                <TableCell>Snort Rules</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cves.map((cve) => (
                <TableRow 
                  key={cve.cveId} 
                  hover
                  sx={{
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                    },
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.primary.main }}>
                      {cve.cveId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ 
                      maxWidth: '400px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {cve.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cve.status}
                      color={getStatusColor(cve.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(cve.publishedDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cve.pocCount}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cve.snortRuleCount}
                      size="small"
                      variant="outlined"
                      color="secondary"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                      <Tooltip title="View Details">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleDetailClick(cve)}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditClick(cve)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Assign">
                        <IconButton size="small" color="primary">
                          <AssignmentIcon />
                        </IconButton>
                      </Tooltip>
                      {currentUser?.is_admin && (
                        <Tooltip title="Delete">
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleDelete(cve.cveId)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <Pagination
            count={10}
            page={page}
            onChange={(e, value) => setPage(value)}
            color="primary"
          />
        </Box>
      </Card>

      {/* CVE 편집 다이얼로그 */}
      <CVEEdit
        open={editDialogOpen}
        onClose={handleEditClose}
        cveId={selectedCVE?.cveId}
        onSave={handleEditSave}
      />

      {/* CVE 상세 보기 다이얼로그 */}
      <CVEDetail
        open={detailDialogOpen}
        onClose={handleDetailClose}
        cve={selectedCVE}
      />

      {/* CVE 생성 다이얼로그 */}
      <CreateCVE
        open={createDialogOpen}
        onClose={handleCreateClose}
        onSuccess={handleCreateSuccess}
      />
    </Box>
  );
};

export default CVEList;
