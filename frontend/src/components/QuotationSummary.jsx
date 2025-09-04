import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Business as BusinessIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  AccountBalance as AccountBalanceIcon
} from '@mui/icons-material';
import { SERVICES } from '../lib/servicesData';

/**
 * QuotationSummary.jsx - Fixed Version with Proper Subservice Loading
 * - Properly loads and displays actual subservice names from servicesData.js
 * - Uses Material-UI for PDF-like preview layout
 * - Removes edit pricing and back to dashboard buttons
 * - Changes "create new quotation" to "complete quotation" with dashboard redirect
 * - Shows individual pricing next to service names, total at bottom
 */

const slugify = (str = '') => String(str)
  .toLowerCase()
  .trim()
  .replace(/[\s_]+/g, '-')
  .replace(/[^a-z0-9-]/g, '')
  .replace(/-+/g, '-');

const ensureUniqueId = (base, used) => {
  if (!base) base = `id-${Math.random().toString(36).slice(2, 8)}`;
  let id = base;
  let i = 1;
  while (used.has(id)) {
    id = `${base}-${i++}`;
  }
  used.add(id);
  return id;
};

// Helper function to find service by ID in servicesData
const findServiceById = (serviceId) => {
  for (const headerName in SERVICES) {
    const services = SERVICES[headerName];
    for (const service of services) {
      if (service.id === serviceId) {
        return service;
      }
    }
  }
  return null;
};

// Helper function to find service by name
const findServiceByName = (serviceName) => {
  for (const headerName in SERVICES) {
    const services = SERVICES[headerName];
    for (const service of services) {
      if (service.name === serviceName) {
        return service;
      }
    }
  }
  return null;
};

const normalizeQuotation = (raw) => {
  const usedIds = new Set();
  const normalized = { ...raw };
  
  const headers = Array.isArray(raw.headers) ? raw.headers : [];
  normalized.headers = headers.map((header, hIndex) => {
    const headerName = header?.name || header?.header || `Header ${hIndex + 1}`;
    const baseHeaderId = header?.id || `header-${slugify(headerName)}` || `header-${hIndex}`;
    const headerId = ensureUniqueId(baseHeaderId, usedIds);

    const services = Array.isArray(header.services) ? header.services : [];
    const normalizedServices = services.map((service, sIndex) => {
      const serviceName = service?.name || service?.label || service?.title || `Service ${sIndex + 1}`;
      const baseServiceId = service?.id || `${headerId}-service-${slugify(serviceName)}` || `${headerId}-service-${sIndex}`;
      const serviceId = ensureUniqueId(baseServiceId, usedIds);

      // Try to find the actual service data from servicesData.js
      let actualServiceData = null;
      if (service?.id) {
        actualServiceData = findServiceById(service.id);
      }
      if (!actualServiceData && serviceName) {
        actualServiceData = findServiceByName(serviceName);
      }

      let normalizedSubServices = [];
      
      if (actualServiceData && actualServiceData.subServices) {
        // Use the actual subservices from servicesData.js
        normalizedSubServices = actualServiceData.subServices.map((sub) => ({
          id: sub.id,
          name: sub.name
        }));
      } else {
        // Fallback to the subservices from the API data if available
        const rawSubServices = Array.isArray(service.subServices) ? service.subServices : [];
        normalizedSubServices = rawSubServices.map((sub, subIndex) => {
          if (typeof sub === 'string') {
            const name = sub;
            const baseSubId = `${serviceId}-sub-${slugify(name)}` || `${serviceId}-sub-${subIndex}`;
            const subId = ensureUniqueId(baseSubId, usedIds);
            return { id: subId, name };
          }

          const subName = sub?.name || sub?.label || sub?.title || `Sub ${subIndex + 1}`;
          const baseSubId = sub?.id || `${serviceId}-sub-${slugify(subName)}` || `${serviceId}-sub-${subIndex}`;
          const subId = ensureUniqueId(baseSubId, usedIds);
          return { id: subId, name: subName };
        });
      }

      return {
        id: serviceId,
        name: serviceName,
        subServices: normalizedSubServices,
        price: service?.price || 0
      };
    });

    return {
      id: headerId,
      name: headerName,
      services: normalizedServices
    };
  });

  return normalized;
};

const QuotationSummary = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/quotations/${id}`);
        if (!response.ok) throw new Error('Failed to fetch quotation');
        
        const payload = await response.json();
        const rawData = payload?.data || payload || {};
        
        const normalized = normalizeQuotation(rawData);
        console.log('Normalized quotation with actual subservices:', normalized);
        setQuotation(normalized);
      } catch (err) {
        console.error('Error fetching quotation:', err);
        setError(err.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchQuotation();
  }, [id]);

  const handleDownload = () => {
    if (!quotation) return;

    const quotationData = {
      id: quotation.id,
      projectDetails: {
        developerName: quotation.developerName,
        projectName: quotation.projectName,
        developerType: quotation.developerType,
        projectRegion: quotation.projectRegion,
        plotArea: quotation.plotArea,
        validity: quotation.validity,
        paymentSchedule: quotation.paymentSchedule,
        reraNumber: quotation.reraNumber
      },
      services: quotation.headers?.map(h => ({
        id: h.id,
        name: h.name,
        services: h.services?.map(s => ({
          id: s.id,
          name: s.name,
          price: s.price,
          subServices: s.subServices?.map(ss => ({
            id: ss.id,
            name: ss.name
          })) || []
        })) || []
      })) || [],
      pricing: quotation.pricingBreakdown || [],
      totalAmount: quotation.totalAmount || 0,
      createdAt: quotation.createdAt
    };

    const blob = new Blob([JSON.stringify(quotationData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotation-${quotation.id || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCompleteQuotation = () => {
    navigate('/dashboard');
  };

  const calculateTotalAmount = () => {
    if (!quotation?.headers) return 0;
    
    return quotation.headers.reduce((total, header) => {
      return total + header.services.reduce((headerTotal, service) => {
        return headerTotal + (service.price || 0);
      }, 0);
    }, 0);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">
          Error loading quotation: {error}
        </Alert>
      </Box>
    );
  }

  if (!quotation) {
    return (
      <Box p={3}>
        <Alert severity="warning">
          No quotation data available
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '1200px', margin: '0 auto', p: 3, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* PDF-like Header */}
      <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{ 
          background: 'linear-gradient(45deg, #1976d2 30%, #21CBF3 90%)',
          color: 'white',
          p: 3,
          textAlign: 'center'
        }}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            QUOTATION SUMMARY
          </Typography>
          <Typography variant="h6">
            {quotation.projectName || quotation.developerName}
          </Typography>
          <Chip 
            label={`ID: ${quotation.id}`}
            variant="outlined"
            sx={{ 
              color: 'white', 
              borderColor: 'white',
              mt: 1,
              fontWeight: 'bold'
            }}
          />
        </Box>
      </Paper>

      {/* Project Details Card */}
      <Paper elevation={2} sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h5" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <BusinessIcon sx={{ mr: 1 }} />
            Project Details
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" color="secondary" gutterBottom>
                    Developer Information
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      <strong>Developer:</strong> {quotation.developerName || 'N/A'}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      <strong>Type:</strong> {quotation.developerType || 'N/A'}
                    </Typography>
                    <Typography variant="body1">
                      <strong>RERA Number:</strong> {quotation.reraNumber || 'N/A'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" color="secondary" gutterBottom>
                    Project Information
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body1" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                      <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
                      <strong>Region:</strong> {quotation.projectRegion || 'N/A'}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      <strong>Plot Area:</strong> {quotation.plotArea || 'N/A'}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                      <CalendarIcon sx={{ mr: 1, fontSize: 16 }} />
                      <strong>Validity:</strong> {quotation.validity || 'N/A'}
                    </Typography>
                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center' }}>
                      <AccountBalanceIcon sx={{ mr: 1, fontSize: 16 }} />
                      <strong>Payment:</strong> {quotation.paymentSchedule || 'N/A'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Services Section */}
      <Paper elevation={2} sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h5" color="primary" gutterBottom sx={{ mb: 3 }}>
            Selected Services
          </Typography>

          {quotation.headers && quotation.headers.length > 0 ? (
            quotation.headers.map((header) => (
              <Box key={header.id} sx={{ mb: 4 }}>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    mb: 2, 
                    p: 2, 
                    backgroundColor: 'primary.main', 
                    color: 'white', 
                    borderRadius: 1,
                    fontWeight: 'bold'
                  }}
                >
                  {header.name}
                </Typography>

                {header.services && header.services.length > 0 ? (
                  header.services.map((service) => (
                    <Card key={service.id} variant="outlined" sx={{ mb: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Typography variant="h6" color="secondary" sx={{ flex: 1 }}>
                            {service.name}
                          </Typography>
                          {service.price > 0 && (
                            <Chip 
                              label={`₹${service.price.toLocaleString()}`}
                              color="primary"
                              variant="filled"
                              sx={{ 
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                ml: 2
                              }}
                            />
                          )}
                        </Box>

                        {service.subServices && service.subServices.length > 0 && (
                          <TableContainer component={Box}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                                    Sub-Services
                                  </TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {service.subServices.map((subService, index) => (
                                  <TableRow key={subService.id} sx={{ 
                                    '&:nth-of-type(odd)': { backgroundColor: '#fafafa' }
                                  }}>
                                    <TableCell>
                                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                        <CheckCircleIcon 
                                          sx={{ 
                                            mt: 0.2,
                                            fontSize: 16, 
                                            color: 'success.main',
                                            flexShrink: 0
                                          }} 
                                        />
                                        <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                                          {subService.name}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', ml: 2 }}>
                    No services selected for this category
                  </Typography>
                )}
              </Box>
            ))
          ) : (
            <Alert severity="info">
              No services selected
            </Alert>
          )}
        </Box>
      </Paper>

      {/* Total Amount Section - Simplified */}
      <Paper elevation={2} sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            p: 3,
            backgroundColor: 'success.light',
            borderRadius: 2
          }}>
            <Typography variant="h4" fontWeight="bold" color="success.main">
              Total Amount
            </Typography>
            <Typography variant="h3" fontWeight="bold" color="success.main">
              ₹{(quotation.totalAmount || calculateTotalAmount()).toLocaleString()}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 4 }}>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          size="large"
        >
          Download Quotation
        </Button>
        
        <Button
          variant="contained"
          startIcon={<CheckCircleIcon />}
          onClick={handleCompleteQuotation}
          size="large"
          sx={{ 
            px: 4,
            background: 'linear-gradient(45deg, #4caf50 30%, #8bc34a 90%)'
          }}
        >
          Complete Quotation
        </Button>
      </Box>

      {/* Footer */}
      <Box sx={{ textAlign: 'center', mt: 4, p: 2, color: 'text.secondary' }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body2">
          Generated on {new Date().toLocaleDateString()} | 
          Quotation ID: {quotation.id}
        </Typography>
      </Box>
    </Box>
  );
};

export default QuotationSummary;