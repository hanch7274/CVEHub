import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Chip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import CVEDetail from './CVEDetail';
import CreateCVE from './CreateCVE';

const mockData = [
  {
    cveId: "CVE-2023-1234",
    title: "Buffer Overflow in Example Software",
    description: "A buffer overflow vulnerability in Example Software versions 1.0-2.0 allows attackers to execute arbitrary code.",
    status: "미할당",
    severity: "High",
    publishedDate: "2023-01-01",
    lastModifiedDate: "2023-01-15",
  },
];

const getStatusColor = (status) => {
  switch (status) {
    case '미할당':
      return 'error';
    case '분석중':
      return 'warning';
    case '분석완료':
      return 'info';
    case '대응완료':
      return 'success';
    default:
      return 'default';
  }
};

const STATUS_OPTIONS = [
  { value: "미할당", label: "미할당" },
  { value: "분석중", label: "분석중" },
  { value: "분석완료", label: "분석완료" },
  { value: "대응완료", label: "대응완료" }
];

const CVEList = () => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [orderBy, setOrderBy] = useState('publishedDate');
  const [order, setOrder] = useState('desc');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [cves, setCves] = useState(mockData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cveToDelete, setCveToDelete] = useState(null);

  useEffect(() => {
    const fetchCVEs = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/cves');
        setCves(response.data);
      } catch (error) {
        console.error('Error fetching CVEs:', error);
        setError('Failed to fetch CVEs');
      }
    };

    fetchCVEs();
  }, []);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleDetailOpen = (cve) => {
    setSelectedCVE(cve);
    setDetailOpen(true);
  };

  const handleDetailClose = () => {
    setDetailOpen(false);
    setSelectedCVE(null);
  };

  const handleCreateDialogOpen = () => {
    setCreateDialogOpen(true);
  };

  const handleCreateDialogClose = () => {
    setCreateDialogOpen(false);
  };

  const handleDeleteClick = (cve) => {
    setCveToDelete(cve);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await axios.delete(`http://localhost:8000/api/cves/${cveToDelete.cveId}`);
      setCves(cves.filter(cve => cve.cveId !== cveToDelete.cveId));
      setDeleteDialogOpen(false);
      setCveToDelete(null);
    } catch (error) {
      console.error('Error deleting CVE:', error);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setCveToDelete(null);
  };

  const handleCreateCVE = async (newCVE) => {
    try {
      const response = await axios.post('http://localhost:8000/api/cves', newCVE);
      setCves([...cves, response.data]);
      setCreateDialogOpen(false);
    } catch (error) {
      console.error('Error creating CVE:', error);
    }
  };

  const handleCVEUpdate = (updatedCVE) => {
    setCves(prevCves => 
      prevCves.map(cve => 
        cve.cveId === updatedCVE.cveId ? updatedCVE : cve
      )
    );
    setSelectedCVE(updatedCVE);  // 현재 선택된 CVE도 업데이트
  };

  const sortedCVEs = [...cves].sort((a, b) => {
    const isAsc = order === 'asc';
    if (orderBy === 'publishedDate') {
      return isAsc
        ? new Date(a.publishedDate) - new Date(b.publishedDate)
        : new Date(b.publishedDate) - new Date(a.publishedDate);
    }
    return isAsc
      ? (a[orderBy] < b[orderBy] ? -1 : 1)
      : (b[orderBy] < a[orderBy] ? -1 : 1);
  });

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" color="primary" onClick={handleCreateDialogOpen}>
          Create CVE
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell
                onClick={() => handleSort('cveId')}
                style={{ cursor: 'pointer' }}
              >
                CVE ID
                {orderBy === 'cveId' && (
                  order === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />
                )}
              </TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedCVEs
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((cve) => (
                <TableRow key={cve.cveId}>
                  <TableCell>{cve.cveId}</TableCell>
                  <TableCell>{cve.title}</TableCell>
                  <TableCell>{cve.description}</TableCell>
                  <TableCell>
                    <Chip
                      label={cve.status}
                      color={getStatusColor(cve.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleDetailOpen(cve)}>
                      <VisibilityIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDeleteClick(cve)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={cves.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>

      <CVEDetail
        open={detailOpen}
        onClose={handleDetailClose}
        cve={selectedCVE}
        onSave={handleCVEUpdate}
      />

      <Dialog open={createDialogOpen} onClose={handleCreateDialogClose} maxWidth="md" fullWidth>
        <CreateCVE 
          onClose={handleCreateDialogClose}
          onSuccess={(newCVE) => {
            setCves([...cves, newCVE]);
            handleCreateDialogClose();
          }}
        />
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete CVE</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {cveToDelete?.cveId}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CVEList;