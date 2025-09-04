import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  TextField,
  CircularProgress,
  Card,
  CardContent,
  Paper,
  Stack,
  Divider
} from "@mui/material";

const QuotationPricing = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [quotationData, setQuotationData] = useState(null);
  const [pricingBreakdown, setPricingBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [discountType, setDiscountType] = useState("none"); // global discount type
  const [discountAmount, setDiscountAmount] = useState(0);   // global amount
  const [discountPercent, setDiscountPercent] = useState(0); // global percent
  const [currentUser, setCurrentUser] = useState(null);
  const token = localStorage.getItem("token");

  // Fetch current user info
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (token) {
        try {
          const res = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const userData = await res.json();
            setCurrentUser(userData);
          }
        } catch (err) {
          console.error("Failed to fetch user profile");
        }
      }
    };
    fetchUserProfile();
  }, [token]);

  useEffect(() => {
    const fetchQuotationAndPricing = async () => {
      try {
        setLoading(true);
        const quotationResponse = await fetch(`/api/quotations/${id}`);
        if (!quotationResponse.ok) throw new Error("Failed to fetch quotation");

        const quotation = await quotationResponse.json();
        setQuotationData(quotation.data);

        const pricingResponse = await fetch(
          "/api/quotations/calculate-pricing",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              developerType: quotation.data.developerType,
              projectRegion: quotation.data.projectRegion,
              plotArea: quotation.data.plotArea,
              headers: quotation.data.headers || [],
            }),
          }
        );

        if (!pricingResponse.ok) throw new Error("Failed to calculate pricing");

        const pricingData = await pricingResponse.json();

        const initialPricingBreakdown = pricingData.breakdown.map((header) => ({
          ...header,
          services: header.services.map((service) => ({
            ...service,
            discountType: "none",
            discountAmount: 0,
            discountPercent: 0,
            finalAmount: service.totalAmount,
          })),
        }));

        setPricingBreakdown(initialPricingBreakdown);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchQuotationAndPricing();
  }, [id]);

  const handleServiceDiscountChange = (hi, si, field, value) => {
    setPricingBreakdown((prev) => {
      const updated = [...prev];
      const service = updated[hi].services[si];

      if (field === "discountType") {
        service.discountType = value;
        service.discountAmount = 0;
        service.discountPercent = 0;
        service.finalAmount = service.totalAmount;
      } else if (field === "discountAmount") {
        const amt = parseFloat(value) || 0;
        service.discountAmount = amt;
        service.finalAmount = Math.max((service.totalAmount || 0) - amt, 0);
      } else if (field === "discountPercent") {
        const pct = parseFloat(value) || 0;
        service.discountPercent = pct;
        const base = service.totalAmount || 0;
        service.finalAmount = Math.max(base - (base * pct) / 100, 0);
      }

      return updated;
    });
  };

  // Totals with stacked discounts: service-level first, then global
  const finalTotals = useMemo(() => {
    // A) Subtotal before any discounts
    const originalSubtotal = pricingBreakdown.reduce(
      (acc, header) =>
        acc +
        header.services.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
      0
    );

    // B) Subtotal after service discounts
    const serviceSubtotal = pricingBreakdown.reduce(
      (acc, header) =>
        acc +
        header.services.reduce((sum, s) => sum + (s.finalAmount || 0), 0),
      0
    );

    // C) Service discount amount (for display)
    const serviceDiscount = Math.max(originalSubtotal - serviceSubtotal, 0);

    // D) Global discount on top of service-discounted subtotal
    let globalDiscount = 0;
    if (discountType === "percent") {
      globalDiscount = (serviceSubtotal * (discountPercent || 0)) / 100;
    } else if (discountType === "amount") {
      globalDiscount = discountAmount || 0;
    }

    // Clamp to not exceed serviceSubtotal
    globalDiscount = Math.min(globalDiscount, serviceSubtotal);

    const subtotalAfterDiscount = Math.max(serviceSubtotal - globalDiscount, 0);
    const total = subtotalAfterDiscount;

    const totalDiscount = serviceDiscount + globalDiscount;

    const effectiveGlobalPercent =
      serviceSubtotal > 0
        ? (globalDiscount / serviceSubtotal) * 100
        : 0;

    return {
      originalSubtotal,
      serviceSubtotal,
      serviceDiscount,
      globalDiscount,
      subtotalAfterDiscount,
      total,
      totalDiscount,
      isGlobalDiscount: discountType !== "none",
      effectiveGlobalPercent,
    };
  }, [pricingBreakdown, discountType, discountAmount, discountPercent]);

  const handleSavePricing = async () => {
    try {
      setLoading(true);

      const payload = {
        totalAmount: finalTotals.total,
        // overall discount (service + global)
        discountAmount: finalTotals.totalDiscount,
        // breakdowns (useful for backend/audit)
        serviceDiscountAmount: finalTotals.serviceDiscount,
        globalDiscountAmount: finalTotals.globalDiscount,
        pricingBreakdown,
        headers: quotationData?.headers || []
      };

      await fetch(`/api/quotations/${id}/pricing`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      navigate(`/quotations/${id}/terms`);
    } catch (err) {
      setError("Failed to save pricing");
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <Box display="flex" justifyContent="center" alignItems="center" mt={4}>
        <CircularProgress />
        <Typography ml={2}>Loading...</Typography>
      </Box>
    );

  if (error)
    return (
      <Box p={3}>
        <Typography color="error">Error: {error}</Typography>
      </Box>
    );

  return (
    <Box p={4} maxWidth="1200px" mx="auto">
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" gutterBottom color="primary">
          Project: {quotationData?.projectName || quotationData?.developerName}
        </Typography>
        <Typography variant="h5" color="text.secondary">
          Service Pricing
        </Typography>
      </Box>

      {/* Service Breakdown */}
      {pricingBreakdown.map((header, hi) => (
        <Paper key={hi} sx={{ p: 3, mb: 3 }} elevation={2}>
          <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
            {header.header}
          </Typography>

          {header.services.map((service, si) => (
            <Card key={si} variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                  <Typography fontWeight={500} minWidth={200}>
                    {service.name}
                  </Typography>

                  <Typography fontWeight={600} color="success.main" minWidth={100}>
                    ₹{service.totalAmount?.toLocaleString()}
                  </Typography>

                  <Select
                    value={service.discountType}
                    onChange={(e) =>
                      handleServiceDiscountChange(hi, si, "discountType", e.target.value)
                    }
                    size="small"
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="none">No Discount</MenuItem>
                    <MenuItem value="percent">Percentage</MenuItem>
                    <MenuItem value="amount">Amount</MenuItem>
                  </Select>

                  {service.discountType !== "none" && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      {service.discountType === "amount" && (
                        <TextField
                          size="small"
                          type="text"
                          value={service.discountAmount}
                          onChange={(e) =>
                            handleServiceDiscountChange(hi, si, "discountAmount", e.target.value)
                          }
                          sx={{ width: 100 }}
                        />
                      )}
                      {service.discountType === "percent" && (
                        <TextField
                          size="small"
                          type="text"
                          value={service.discountPercent}
                          onChange={(e) =>
                            handleServiceDiscountChange(hi, si, "discountPercent", e.target.value)
                          }
                          sx={{ width: 100 }}
                          inputProps={{ min: 0, max: 100 }}
                        />
                      )}
                      <Typography fontWeight={500}>
                        Final: ₹{service.finalAmount?.toLocaleString()}
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Paper>
      ))}

      {/* Global Discount */}
      <Paper sx={{ p: 3, mt: 4, border: "2px solid", borderColor: "primary.main" }}>
        <Typography variant="h6" gutterBottom color="primary">
          Global Discount (Optional)
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Applying a global discount will be added on top of service-level discounts.
        </Typography>

        <FormControl sx={{ mt: 2 }}>
          <RadioGroup
            value={discountType}
            onChange={(e) => {
              setDiscountType(e.target.value);
              if (e.target.value === "none") {
                setDiscountAmount(0);
                setDiscountPercent(0);
              }
            }}
            row
          >
            <FormControlLabel value="none" control={<Radio />} label="No Discount" />
            <FormControlLabel value="percent" control={<Radio />} label="Percentage" />
            <FormControlLabel value="amount" control={<Radio />} label="Amount" />
          </RadioGroup>
        </FormControl>

        {discountType === "percent" && (
          <TextField
            label="Discount Percentage"
            type="text"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
            sx={{ mt: 2, width: 150 }}
            inputProps={{ min: 0, max: 100 }}
          />
        )}

        {discountType === "amount" && (
          <TextField
            label="Discount Amount"
            type="text"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
            sx={{ mt: 2, width: 150 }}
          />
        )}

        {discountType !== "none" && (
          <Box mt={2} p={2} bgcolor="warning.light" borderRadius={1}>
            <Typography variant="body2">
              <strong>Preview:</strong>{" "}
              {finalTotals.effectiveGlobalPercent.toFixed(2)}% global discount = ₹
              {finalTotals.globalDiscount.toLocaleString()} off
              {currentUser && finalTotals.effectiveGlobalPercent > (currentUser.threshold || 0) && (
                <span style={{ color: "#dc3545", marginLeft: "10px" }}>
                  ⚠️ Exceeds your threshold ({currentUser.threshold}%)
                </span>
              )}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Pricing Summary */}
      <Paper sx={{ p: 3, mt: 4 }} elevation={3}>
        <Typography variant="h6" gutterBottom color="primary">
          Pricing Summary
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between">
            <Typography>Subtotal (before discounts):</Typography>
            <Typography fontWeight={600}>₹{finalTotals.originalSubtotal.toLocaleString()}</Typography>
          </Stack>

          {finalTotals.serviceDiscount > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography color="error">Service Discounts:</Typography>
              <Typography fontWeight={600} color="error">
                -₹{finalTotals.serviceDiscount.toLocaleString()}
              </Typography>
            </Stack>
          )}

          {finalTotals.globalDiscount > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography color="error">
                Global Discount{discountType === "percent" ? ` (${discountPercent}%)` : ""}:
              </Typography>
              <Typography fontWeight={600} color="error">
                -₹{finalTotals.globalDiscount.toLocaleString()}
              </Typography>
            </Stack>
          )}

          <Stack direction="row" justifyContent="space-between">
            <Typography>After Discount:</Typography>
            <Typography fontWeight={600}>
              ₹{finalTotals.subtotalAfterDiscount.toLocaleString()}
            </Typography>
          </Stack>

          <Divider sx={{ mt: 2 }} />
          <Stack direction="row" justifyContent="space-between" pt={1}>
            <Typography variant="h6">Total:</Typography>
            <Typography variant="h6" color="primary" fontWeight="bold">
              ₹{finalTotals.total.toLocaleString()}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {/* Action Buttons */}
      <Stack direction="row" spacing={2} mt={4}>
        <Button variant="outlined" onClick={() => navigate(`/quotations/${id}/services`)}>
          Back
        </Button>
        <Button variant="contained" onClick={handleSavePricing} disabled={loading}>
          {loading ? "Saving..." : "Save & Continue"}
        </Button>
      </Stack>
    </Box>
  );
};

export default QuotationPricing;
