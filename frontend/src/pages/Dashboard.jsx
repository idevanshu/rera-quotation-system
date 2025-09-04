import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Stack,
  Alert,
  TextField,
  InputAdornment,
  Tooltip,
  TableSortLabel,
  Grid,
  Card,
  CardContent,
  Divider
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  PersonAdd as PersonAddIcon,
  Logout as LogoutIcon,
  Search as SearchIcon,
  Dashboard as DashboardIcon,
  TrendingUp as TrendingUpIcon,
  Assignment as AssignmentIcon,
  Warning as WarningIcon
} from "@mui/icons-material";
import { alpha } from "@mui/material/styles";

export default function Dashboard() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [pending, setPending] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [user, setUser] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [approvalAction, setApprovalAction] = useState("approve");

  // Single unified search state
  const [unifiedSearch, setUnifiedSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const role = localStorage.getItem("role");
  const token = localStorage.getItem("token");

  const fetchProfile = async () => {
    if (token) {
      try {
        const res = await fetch("http://localhost:3001/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setUser(data);
        } else {
          handleLogout();
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        handleLogout();
      }
    }
  };

  const fetchQuotations = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/quotations");
      const data = await res.json();
      if (res.ok) setQuotations(data.data);
    } catch (error) {
      console.error("Failed to fetch quotations:", error);
    }
  };

  const fetchPending = async () => {
    if (role === "admin" || role === "manager") {
      try {
        const res = await fetch("http://localhost:3001/api/quotations/pending", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setPending(data.data);
        } else if (res.status === 403) {
          setPending([]);
        }
      } catch (error) {
        console.error("Failed to fetch pending quotations:", error);
      }
    }
  };

  // Enhanced unified search functionality
  const filteredAndSortedData = useMemo(() => {
    let data = activeTab === 1 ? pending : quotations;

    // Apply unified search across ALL columns
    if (unifiedSearch) {
      const searchLower = unifiedSearch.toLowerCase();
      data = data.filter(q => {
        // Define all searchable fields
        const searchableFields = [
          q.id?.toString(),
          q.projectName,
          q.developerName,
          q.promoterName,
          q.status,
          q.createdBy,
          q.approvedBy,
          q.totalAmount?.toString(),
          // Search in services
          ...(q.headers || []).flatMap(header =>
            (header.services || []).map(service => service.name || service.serviceName)
          )
        ];

        // Combine all searchable text
        const searchableText = searchableFields
          .filter(field => field != null && field !== undefined)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(searchLower);
      });
    }

    // Apply sorting
    if (sortConfig.key) {
      data = [...data].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'createdAt') {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
        } else if (sortConfig.key === 'totalAmount' || sortConfig.key === 'effectiveDiscountPercent') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else {
          aValue = String(aValue || '').toLowerCase();
          bValue = String(bValue || '').toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return data;
  }, [quotations, pending, activeTab, unifiedSearch, sortConfig]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleApprovalClick = (quotation, action) => {
    if (role === "manager" && quotation.effectiveDiscountPercent > user?.threshold) {
      alert(`Cannot ${action} - discount ${quotation.effectiveDiscountPercent}% exceeds your limit of ${user.threshold}%`);
      return;
    }
    setSelectedQuotation(quotation);
    setApprovalAction(action);
    setShowApprovalModal(true);
  };

  const handleConfirmApproval = async () => {
    if (!selectedQuotation) return;

    try {
      const res = await fetch(
        `http://localhost:3001/api/quotations/${selectedQuotation.id}/approve`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: approvalAction }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        fetchPending();
        fetchQuotations();
        setShowApprovalModal(false);
        setSelectedQuotation(null);
        alert(`Quotation ${approvalAction}d successfully!`);
      } else {
        alert(data.error || `Failed to ${approvalAction} quotation`);
      }
    } catch (error) {
      console.error("Approval failed:", error);
      alert(`Failed to ${approvalAction} quotation`);
    }
  };

  const handleViewQuotation = (quotationId) => {
    navigate(`/quotations/${quotationId}/view`);
  };

  const handleEditQuotation = (quotationId) => {
    navigate(`/quotations/${quotationId}/services`);
  };

  const handleDownloadQuotation = async (quotation) => {
    try {
      console.log(`Starting download for quotation: ${quotation.id}`);
      const response = await fetch(
        `http://localhost:3001/api/quotations/${quotation.id}/download-pdf`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        throw new Error('Response is not a PDF file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Quotation_${quotation.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);

      console.log('PDF download initiated successfully');
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Failed to download quotation PDF: ${error.message}`);
    }
  };

  // Enhanced service summary with better display
  const getServicesSummary = (quotation) => {
    if (!quotation.headers || quotation.headers.length === 0) {
      return { summary: "No services selected", fullText: "No services selected", count: 0 };
    }

    const totalServices = quotation.headers.reduce((total, header) => {
      return total + (header.services ? header.services.length : 0);
    }, 0);

    const serviceNames = quotation.headers
      .filter(header => header.services && header.services.length > 0)
      .flatMap(header =>
        header.services.map(service => service.name || service.serviceName)
      )
      .filter(Boolean);

    const summary = serviceNames.length > 0
      ? `${serviceNames[0]}${serviceNames.length > 1 ? ` +${serviceNames.length - 1} more` : ''}`
      : `${totalServices} service${totalServices !== 1 ? 's' : ''}`;

    return {
      summary: summary,
      fullText: serviceNames.join(', '),
      count: totalServices
    };
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const handleCreateUser = () => {
    navigate("/signup");
  };

  const handleCreateQuotation = () => {
    navigate("/quotations/new");
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const getApprovalReasons = (quotation) => {
    const reasons = [];
    const hasPackages = quotation.headers?.some(header =>
      header.header &&
      header.header.toLowerCase().includes('package') &&
      header.services &&
      header.services.length > 0
    );

    const hasCustomizedHeader = quotation.headers?.some(header =>
      header.header &&
      header.header.toLowerCase().includes('customized') &&
      header.services &&
      header.services.length > 0
    );

    if (quotation.effectiveDiscountPercent > (user?.threshold || 0)) {
      reasons.push(`High discount (${quotation.effectiveDiscountPercent}%)`);
    }

    if (hasPackages) {
      reasons.push("Package services selected");
    }

    if (hasCustomizedHeader) {
      reasons.push("Customized header with services");
    }

    if (quotation.customTerms && quotation.customTerms.length > 0) {
      reasons.push("Custom terms added");
    }

    return reasons;
  };

  const getStatusChip = (status) => {
    const statusConfig = {
      completed: { label: "Completed", color: "success" },
      approved: { label: "Approved", color: "success" },
      rejected: { label: "Rejected", color: "error" },
      pending_approval: { label: "Pending", color: "warning" },
      draft: { label: "Draft", color: "default" }
    };

    const config = statusConfig[status] || { label: status, color: "default" };
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        variant="filled"
      />
    );
  };

  const requiresSpecialApproval = (quotation) => {
    const exceedsThreshold = quotation.effectiveDiscountPercent > (user?.threshold || 0);
    const hasCustomTerms = quotation.customTerms && quotation.customTerms.length > 0;
    return exceedsThreshold || hasCustomTerms;
  };

  // Get current logged-in user information for display
  const getCurrentUserDisplay = () => {
    if (user) {
      return `${user.fname} ${user.lname} (${user.role?.toUpperCase()}) - ID: ${user.id || 'N/A'}`;
    }
    return 'Loading...';
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchProfile();
    fetchQuotations();
    fetchPending();
  }, [token, navigate]);

  if (!user) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Typography variant="h6" textAlign="center">
          Loading dashboard...
        </Typography>
      </Container>
    );
  }

  // Excel-like table styles
  const excelTableStyles = {
    '& .MuiTableContainer-root': {
      border: '2px solid #d0d7de',
      borderRadius: '6px',
    },
    '& .MuiTable-root': {
      borderCollapse: 'separate',
      borderSpacing: 0,
    },
    '& .MuiTableHead-root': {
      '& .MuiTableCell-root': {
        backgroundColor: '#f6f8fa',
        borderRight: '1px solid #d0d7de',
        borderBottom: '2px solid #d0d7de',
        padding: '8px 12px',
        fontSize: '0.875rem',
        fontWeight: 600,
        color: '#24292f',
        '&:last-child': {
          borderRight: 'none',
        },
      },
    },
    '& .MuiTableBody-root': {
      '& .MuiTableRow-root': {
        '&:nth-of-type(even)': {
          backgroundColor: '#f6f8fa',
        },
        '&:hover': {
          backgroundColor: '#eef4fd',
        },
        '& .MuiTableCell-root': {
          borderRight: '1px solid #d0d7de',
          borderBottom: '1px solid #d0d7de',
          padding: '6px 12px',
          fontSize: '0.8125rem',
          color: '#24292f',
          '&:last-child': {
            borderRight: 'none',
          },
        },
      },
    },
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Dashboard - {getCurrentUserDisplay()}
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateQuotation}
            sx={{
              bgcolor: '#1976d2',
              '&:hover': { bgcolor: '#1565c0' },
              textTransform: 'none'
            }}
          >
            New Quotation
          </Button>
          {(role === "admin" || role === "manager") && (
            <Button
              variant="outlined"
              startIcon={<PersonAddIcon />}
              onClick={handleCreateUser}
              sx={{ textTransform: 'none' }}
            >
              Create User
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            color="error"
            sx={{ textTransform: 'none' }}
          >
            Logout
          </Button>
        </Stack>
      </Box>

      {/* Single Unified Search Section */}
      <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search across all columns (ID, Project, Promoter, Services, Created By, Approved By...)"
              value={unifiedSearch}
              onChange={(e) => setUnifiedSearch(e.target.value)}
              size="small"
              sx={{ 
                backgroundColor: 'white',
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderColor: '#d0d7de',
                  },
                  '&:hover fieldset': {
                    borderColor: '#1976d2',
                  },
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#656d76' }} />
                  </InputAdornment>
                ),
                endAdornment: unifiedSearch && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setUnifiedSearch('')}
                      sx={{ color: '#656d76' }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            {unifiedSearch && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                Showing {filteredAndSortedData.length} of{" "}
                {activeTab === 1 ? pending.length : quotations.length} quotations
              </Alert>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab 
            label={`ALL QUOTATIONS (${quotations.length})`} 
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
          {(role === "admin" || role === "manager") && (
            <Tab 
              label={`PENDING APPROVAL (${pending.length})`}
              sx={{ textTransform: 'none', fontWeight: 'bold' }}
            />
          )}
        </Tabs>
      </Box>

      {/* Excel-like Enhanced Table */}
      <TableContainer 
        component={Paper} 
        sx={{
          ...excelTableStyles,
          maxHeight: 'calc(100vh - 280px)',
          overflow: 'auto',
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'createdAt'}
                  direction={sortConfig.key === 'createdAt' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('createdAt')}
                >
                  Date
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'id'}
                  direction={sortConfig.key === 'id' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('id')}
                >
                  Quotation ID
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'projectName'}
                  direction={sortConfig.key === 'projectName' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('projectName')}
                >
                  Project Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'developerName'}
                  direction={sortConfig.key === 'developerName' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('developerName')}
                >
                  Promoter
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'totalAmount'}
                  direction={sortConfig.key === 'totalAmount' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('totalAmount')}
                >
                  Total Value
                </TableSortLabel>
              </TableCell>
              <TableCell>Services Summary</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'status'}
                  direction={sortConfig.key === 'status' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('status')}
                >
                  Status
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'createdBy'}
                  direction={sortConfig.key === 'createdBy' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('createdBy')}
                >
                  Created By
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'approvedBy'}
                  direction={sortConfig.key === 'approvedBy' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('approvedBy')}
                >
                  Approved By
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">Actions</TableCell>
              {(role === "admin" || role === "manager") && activeTab === 1 && (
                <TableCell align="center">Approval</TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAndSortedData.length === 0 ? (
              <TableRow>
                <TableCell 
                  colSpan={activeTab === 1 && (role === "admin" || role === "manager") ? 11 : 10} 
                  align="center" 
                  sx={{ py: 4 }}
                >
                  <Typography variant="body1" color="text.secondary">
                    {unifiedSearch 
                      ? "No quotations match your search criteria" 
                      : `No ${activeTab === 1 ? "pending" : ""} quotations found`
                    }
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedData.map((q) => {
                const serviceInfo = getServicesSummary(q);
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      {q.createdAt ? new Date(q.createdAt).toLocaleDateString('en-GB') : '-'}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: '#0969da' }}>
                      {q.id}
                    </TableCell>
                    <TableCell>{q.projectName || "N/A"}</TableCell>
                    <TableCell>{q.developerName || q.promoterName || 'N/A'}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      ₹{q.totalAmount?.toLocaleString() || '0'}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={serviceInfo.fullText} placement="top">
                        <Box sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {serviceInfo.summary}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{getStatusChip(q.status)}</TableCell>
                    <TableCell>
                      {/* Show current logged-in user if this quotation was created by them */}
                      {q.createdBy === user?.id || q.createdBy === user?.email 
                        ? `${user.fname} ${user.lname} (You)` 
                        : q.createdBy || 'System'
                      }
                    </TableCell>
                    <TableCell>{q.approvedBy || '-'}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5}>
                        <IconButton
                          size="small"
                          onClick={() => handleViewQuotation(q.id)}
                          sx={{ color: '#0066cc' }}
                          title="View"
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleEditQuotation(q.id)}
                          sx={{ color: '#ff9800' }}
                          title="Edit"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDownloadQuotation(q)}
                          sx={{ color: '#4caf50' }}
                          title="Download"
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    {(role === "admin" || role === "manager") && activeTab === 1 && (
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <IconButton
                            size="small"
                            onClick={() => handleApprovalClick(q, "approve")}
                            sx={{ color: '#4caf50' }}
                            title="Approve"
                          >
                            <CheckIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleApprovalClick(q, "reject")}
                            sx={{ color: '#f44336' }}
                            title="Reject"
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                          {requiresSpecialApproval(q) && (
                            <Tooltip title="Requires special approval">
                              <WarningIcon fontSize="small" sx={{ color: '#ff9800', ml: 0.5 }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Enhanced Approval Preview Modal */}
      <Dialog
        open={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {approvalAction === "approve" ? "✓ Quotation Approval Preview" : "✗ Quotation Rejection Preview"}
        </DialogTitle>
        <DialogContent>
          {selectedQuotation && (
            <Stack spacing={3}>
              {/* Pricing & Discount Details */}
              <Card variant="outlined">
                <CardContent sx={{ pb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Pricing & Discount Details
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Total Amount:
                      </Typography>
                      <Typography variant="h6" color="primary">
                        ₹{selectedQuotation.totalAmount?.toLocaleString()}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Discount Amount:
                      </Typography>
                      <Typography variant="h6" color="error">
                        -₹{((selectedQuotation.totalAmount || 0) * (selectedQuotation.effectiveDiscountPercent || 0) / 100).toLocaleString()}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">
                        Discount Percentage:
                      </Typography>
                      <Typography variant="h6" color="warning.main">
                        {selectedQuotation.effectiveDiscountPercent}%
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Custom Terms */}
              {selectedQuotation.customTerms && selectedQuotation.customTerms.length > 0 && (
                <Card variant="outlined">
                  <CardContent sx={{ pb: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      Custom Terms
                    </Typography>
                    {selectedQuotation.customTerms.map((term, index) => (
                      <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                        {index + 1}. {term}
                      </Typography>
                    ))}
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      ⚠ Custom terms require approval
                    </Alert>
                  </CardContent>
                </Card>
              )}

              {/* Approval Context */}
              <Card variant="outlined">
                <CardContent sx={{ pb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Approval Context
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Your Threshold:
                      </Typography>
                      <Typography variant="body1">
                        {user?.threshold || 0}%
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Requested Discount:
                      </Typography>
                      <Typography variant="body1">
                        {selectedQuotation.effectiveDiscountPercent}%
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Custom Terms:
                      </Typography>
                      <Typography variant="body1">
                        {selectedQuotation.customTerms?.length || 0} terms added
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Status:
                      </Typography>
                      <Typography variant="body1" color={requiresSpecialApproval(selectedQuotation) ? "warning.main" : "success.main"}>
                        {requiresSpecialApproval(selectedQuotation)
                          ? "Exceeds your threshold or has custom terms"
                          : "Within normal parameters"}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Services Summary */}
              <Card variant="outlined">
                <CardContent sx={{ pb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Services Summary
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Selected Services:
                  </Typography>
                  <Typography variant="body1">
                    {getServicesSummary(selectedQuotation).fullText}
                  </Typography>
                </CardContent>
              </Card>

              <Alert severity="info">
                Please review all details carefully before{" "}
                {approvalAction === "approve" ? "approving" : "rejecting"} this quotation.
              </Alert>

              {requiresSpecialApproval(selectedQuotation) && approvalAction === "approve" && (
                <Alert severity="warning">
                  This quotation requires special approval due to high discount or custom terms.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setShowApprovalModal(false)}
            variant="outlined"
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              px: 3,
              color: '#6c757d',
              borderColor: '#6c757d'
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmApproval}
            variant="contained"
            color={approvalAction === "approve" ? "success" : "error"}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              px: 3
            }}
          >
            ✓ {approvalAction === "approve" ? "Confirm Approval" : "Confirm Rejection"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}