import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TablePagination,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import CVEEdit from './CVEEdit';
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
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

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleDetailOpen = (cve) => {
    setSelectedCVE(cve);
    setDetailOpen(true);
  };

  const handleDetailClose = () => {
    setDetailOpen(false);
    setSelectedCVE(null);
  };

  const handleEditOpen = (cve) => {
    setSelectedCVE(cve);
    setEditOpen(true);
  };

  const handleEditClose = () => {
    setEditOpen(false);
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
    if (!cveToDelete) return;

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

  const handleUpdateCVE = async (updatedCVE) => {
    try {
      const response = await axios.put(`http://localhost:8000/api/cves/${updatedCVE.cveId}`, updatedCVE);
      setCves(cves.map(cve => cve.cveId === updatedCVE.cveId ? response.data : cve));
      setEditOpen(false);
    } catch (error) {
      console.error('Error updating CVE:', error);
    }
  };

  const sortedCVEs = [...cves].sort((a, b) => {
    const isAsc = order === 'asc';
    if (orderBy === 'publishedDate') {
      return isAsc 
        ? new Date(a.publishedDate) - new Date(b.publishedDate)
        : new Date(b.publishedDate) - new Date(a.publishedDate);
    }
    return isAsc
      ? a[orderBy].localeCompare(b[orderBy])
      : b[orderBy].localeCompare(a[orderBy]);
  });

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3
        }}
      >
        <Typography variant="h5" component="h1">
          CVE List
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={handleCreateDialogOpen}
          sx={{ textTransform: 'none' }}
        >
          CREATE NEW CVE
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  ID
                  <IconButton size="small" onClick={() => handleSort('cveId')}>
                    {orderBy === 'cveId' ? (
                      order === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Published Date
                  <IconButton size="small" onClick={() => handleSort('publishedDate')}>
                    {orderBy === 'publishedDate' ? (
                      order === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedCVEs.map((cve) => (
              <TableRow key={cve.cveId}>
                <TableCell>{cve.cveId}</TableCell>
                <TableCell>{cve.title}</TableCell>
                <TableCell>
                  <Chip 
                    label={cve.status} 
                    color={getStatusColor(cve.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>{new Date(cve.publishedDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleDetailOpen(cve)}>
                    <VisibilityIcon />
                  </IconButton>
                  <IconButton onClick={() => handleEditOpen(cve)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDeleteClick(cve)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={cves.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={10}
        rowsPerPageOptions={[10]}
      />

      <CVEDetail
        open={detailOpen}
        onClose={handleDetailClose}
        cve={selectedCVE}
      />

      <CVEEdit
        open={editOpen}
        onClose={handleEditClose}
        cveId={selectedCVE?.cveId}
        onSave={(updatedCVE) => {
          setCves(prevCves => prevCves.map(cve => 
            cve.cveId === updatedCVE.cveId ? updatedCVE : cve
          ));
          setEditOpen(false);
        }}
      />

      <Dialog open={createDialogOpen} onClose={handleCreateDialogClose} maxWidth="md" fullWidth>
        <CreateCVE 
          onClose={handleCreateDialogClose}
          onSuccess={(newCVE) => {
            setCves(prevCves => [...prevCves, newCVE]);
            handleCreateDialogClose();
          }}
        />
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Delete CVE</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this CVE? This action cannot be undone.
          </DialogContentText>
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