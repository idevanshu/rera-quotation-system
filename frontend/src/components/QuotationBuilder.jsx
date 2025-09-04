import React, { useState, useEffect } from "react";
import { 
  getAvailableHeaders, 
  getServicesForHeader, 
  expandPackageServices, 
  isPackageHeader, 
  getAllServices as getAllServicesData,
  SERVICES,
  YEAR_OPTIONS,
  QUARTER_OPTIONS,
  getAllQuartersForYears
} from "../lib/servicesData";

export default function QuotationBuilder({ onComplete }) {
  const [selectedHeaders, setSelectedHeaders] = useState([]);
  const [selectedServices, setSelectedServices] = useState({});
  const [currentHeader, setCurrentHeader] = useState(null);
  const [summary, setSummary] = useState({});
  const [allSelectedServices, setAllSelectedServices] = useState([]);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customHeaderName, setCustomHeaderName] = useState("");
  const [selectedYears, setSelectedYears] = useState({});
  const [selectedQuarters, setSelectedQuarters] = useState({});

  // Helper function to find service in servicesData by ID
  const findServiceInServicesData = (serviceId) => {
    for (const headerName in SERVICES) {
      const services = SERVICES[headerName] || [];
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
      const services = SERVICES[headerName] || [];
      for (const service of services) {
        if (service.name === serviceName) {
          return service;
        }
      }
    }
    return null;
  };

  // Update summary whenever selected services change
  useEffect(() => {
    const newSummary = {};
    let totalServices = 0;

    selectedHeaders.forEach(headerName => {
      const headerServices = selectedServices[headerName] || [];
      newSummary[headerName] = headerServices.length;
      totalServices += headerServices.length;
    });

    setSummary({ ...newSummary, total: totalServices });
    setAllSelectedServices(Object.values(selectedServices).flat());
  }, [selectedServices, selectedHeaders]);

  // Handle header selection
  const handleHeaderSelect = (headerName) => {
    if (!selectedHeaders.includes(headerName)) {
      setSelectedHeaders([...selectedHeaders, headerName]);
      setSelectedServices(prev => ({ ...prev, [headerName]: [] }));
    }
    setCurrentHeader(headerName);
  };

  // Handle service selection/deselection
  const handleServiceToggle = (serviceId, selected) => {
    setSelectedServices(prev => {
      const updated = { ...prev };
      const headerServices = updated[currentHeader] || [];
      
      if (selected) {
        // Find the actual service data from servicesData.js
        const actualService = findServiceInServicesData(serviceId);
        
        if (actualService) {
          // Create service object with proper subServices structure
          const serviceWithSubServices = {
            id: actualService.id,
            name: actualService.name,
            label: actualService.name,
            // Map subServices properly with actual names and IDs
            subServices: actualService.subServices ? actualService.subServices.map(sub => ({
              id: sub.id,
              name: sub.name,
              included: true
            })) : []
          };
          
          // Only add if not already present
          if (!headerServices.some(s => s.id === serviceId)) {
            updated[currentHeader] = [...headerServices, serviceWithSubServices];
          }
          
          console.log('Added service with proper subServices:', serviceWithSubServices);
        }
      } else {
        // Remove service
        updated[currentHeader] = headerServices.filter(s => s.id !== serviceId);
      }
      
      return updated;
    });
  };

  // Handle subservice toggle
  const handleSubServiceToggle = (serviceId, subServiceId, included) => {
    setSelectedServices(prev => {
      const updated = { ...prev };
      const headerServices = updated[currentHeader] || [];
      const serviceIndex = headerServices.findIndex(s => s.id === serviceId);
      
      if (serviceIndex >= 0) {
        const service = { ...headerServices[serviceIndex] };
        service.subServices = service.subServices.map(sub => 
          sub.id === subServiceId ? { ...sub, included } : sub
        );
        headerServices[serviceIndex] = service;
        updated[currentHeader] = headerServices;
      }
      
      return updated;
    });
  };

  // Handle year/quarter selection for forms
  const handleYearChange = (serviceId, years) => {
    setSelectedYears(prev => ({ ...prev, [serviceId]: years }));
    
    // Auto-select all quarters for selected years
    const allQuarters = getAllQuartersForYears(years);
    setSelectedQuarters(prev => ({ ...prev, [serviceId]: allQuarters }));
  };

  const handleQuarterChange = (serviceId, quarters) => {
    setSelectedQuarters(prev => ({ ...prev, [serviceId]: quarters }));
  };

  // Remove header
  const handleRemoveHeader = (headerName) => {
    setSelectedHeaders(selectedHeaders.filter(h => h !== headerName));
    setSelectedServices(prev => {
      const updated = { ...prev };
      delete updated[headerName];
      return updated;
    });
    
    if (currentHeader === headerName) {
      setCurrentHeader(selectedHeaders[0] || null);
    }
  };

  // Handle custom header
  const handleAddCustomHeader = () => {
    if (customHeaderName.trim()) {
      const headerName = customHeaderName.trim();
      handleHeaderSelect(headerName);
      setCustomHeaderName("");
      setIsCustomizing(false);
    }
  };

  // Complete quotation
  const handleComplete = () => {
    const formattedHeaders = selectedHeaders.map(headerName => {
      const services = selectedServices[headerName] || [];
      
      return {
        header: headerName,
        name: headerName,
        services: services.map(service => ({
          id: service.id,
          name: service.name,
          label: service.name,
          subServices: service.subServices || []
        }))
      };
    });

    console.log('Completing quotation with properly formatted headers:', formattedHeaders);
    
    if (onComplete) {
      onComplete(formattedHeaders);
    }
  };

  // Get available services for current header
  const getServicesForCurrentHeader = () => {
    if (!currentHeader) return [];
    return getServicesForHeader(currentHeader);
  };

  // Check if service is selected
  const isServiceSelected = (serviceId) => {
    const headerServices = selectedServices[currentHeader] || [];
    return headerServices.some(s => s.id === serviceId);
  };

  // Service Card Component
  const ServiceCard = ({ service }) => {
    const isSelected = isServiceSelected(service.id);
    const selectedService = selectedServices[currentHeader]?.find(s => s.id === service.id);
    const requiresYearQuarter = service.requiresYearQuarter;

    return (
      <div className={`service-card ${isSelected ? 'selected' : ''}`}>
        <div className="service-header">
          <label className="service-checkbox">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleServiceToggle(service.id, e.target.checked)}
            />
            <span className="service-name">{service.name}</span>
          </label>
          {service.category === 'addon' && (
            <span className="addon-badge">Add-on</span>
          )}
        </div>

        {isSelected && (
          <div className="service-details">
            {/* Year/Quarter Selection for Forms */}
            {requiresYearQuarter && (
              <div className="year-quarter-selection">
                <div className="form-field">
                  <label>Select Years:</label>
                  <select
                    multiple
                    value={selectedYears[service.id] || []}
                    onChange={(e) => {
                      const years = Array.from(e.target.selectedOptions, option => option.value);
                      handleYearChange(service.id, years);
                    }}
                    className="year-select"
                  >
                    {YEAR_OPTIONS.map(year => (
                      <option key={year.value} value={year.value}>
                        {year.label}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedYears[service.id]?.length > 0 && (
                  <div className="form-field">
                    <label>Select Quarters:</label>
                    <select
                      multiple
                      value={selectedQuarters[service.id] || []}
                      onChange={(e) => {
                        const quarters = Array.from(e.target.selectedOptions, option => option.value);
                        handleQuarterChange(service.id, quarters);
                      }}
                      className="quarter-select"
                    >
                      {selectedYears[service.id]?.map(year => 
                        QUARTER_OPTIONS[year]?.map(quarter => (
                          <option key={quarter.value} value={quarter.value}>
                            {quarter.label}
                          </option>
                        ))
                      ).flat()}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Sub-services */}
            {selectedService && selectedService.subServices?.length > 0 && (
              <div className="sub-services">
                <h4>Sub-services:</h4>
                <div className="sub-services-list">
                  {selectedService.subServices.map((subService, index) => (
                    <label key={subService.id || index} className="sub-service-item">
                      <input
                        type="checkbox"
                        checked={subService.included !== false}
                        onChange={(e) => handleSubServiceToggle(
                          service.id, 
                          subService.id, 
                          e.target.checked
                        )}
                      />
                      <span>{subService.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="quotation-builder">
      <div className="builder-container">
        {/* Header Section */}
        <div className="builder-header">
          <h2>Build Your Quotation</h2>
          <div className="progress-summary">
            <span>Headers: {selectedHeaders.length}</span>
            <span>Total Services: {summary.total || 0}</span>
          </div>
        </div>

        {/* Headers Selection */}
        <div className="headers-section">
          <h3>Select Service Categories</h3>
          <div className="headers-grid">
            {getAvailableHeaders(selectedHeaders).map(header => (
              <button
                key={header}
                onClick={() => handleHeaderSelect(header)}
                className="header-button"
              >
                {header}
              </button>
            ))}
            
            {!isCustomizing ? (
              <button
                onClick={() => setIsCustomizing(true)}
                className="header-button custom-button"
              >
                + Custom Header
              </button>
            ) : (
              <div className="custom-header-form">
                <input
                  type="text"
                  value={customHeaderName}
                  onChange={(e) => setCustomHeaderName(e.target.value)}
                  placeholder="Enter custom header name"
                  className="custom-header-input"
                />
                <button onClick={handleAddCustomHeader} className="add-button">
                  Add
                </button>
                <button 
                  onClick={() => {
                    setIsCustomizing(false);
                    setCustomHeaderName("");
                  }}
                  className="cancel-button"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Selected Headers */}
        {selectedHeaders.length > 0 && (
          <div className="selected-headers">
            <h3>Selected Categories</h3>
            <div className="headers-list">
              {selectedHeaders.map(header => (
                <div
                  key={header}
                  className={`header-tab ${currentHeader === header ? 'active' : ''}`}
                >
                  <button
                    onClick={() => setCurrentHeader(header)}
                    className="header-tab-button"
                  >
                    {header}
                    <span className="service-count">
                      ({selectedServices[header]?.length || 0})
                    </span>
                  </button>
                  <button
                    onClick={() => handleRemoveHeader(header)}
                    className="remove-header-button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services Selection */}
        {currentHeader && (
          <div className="services-section">
            <h3>Services for {currentHeader}</h3>
            <div className="services-grid">
              {getServicesForCurrentHeader().map(service => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {allSelectedServices.length > 0 && (
          <div className="selection-summary">
            <h3>Selection Summary</h3>
            {selectedHeaders.map(headerName => (
              <div key={headerName} className="header-summary">
                <h4>{headerName} ({selectedServices[headerName]?.length || 0})</h4>
                <ul>
                  {selectedServices[headerName]?.map(service => (
                    <li key={service.id}>
                      {service.name}
                      {service.subServices && service.subServices.filter(sub => sub.included).length > 0 && (
                        <span className="sub-count">
                          ({service.subServices.filter(sub => sub.included).length} sub-services)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          {allSelectedServices.length > 0 && (
            <button
              onClick={handleComplete}
              className="complete-button"
            >
              Continue to Pricing
            </button>
          )}
        </div>
      </div>

      {/* CSS Styles */}
      <style jsx>{`
        .quotation-builder {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: Arial, sans-serif;
        }

        .builder-container {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 24px;
        }

        .builder-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #e0e0e0;
        }

        .progress-summary {
          display: flex;
          gap: 16px;
          font-size: 14px;
          color: #666;
        }

        .headers-section {
          margin-bottom: 24px;
        }

        .headers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .header-button {
          padding: 12px 16px;
          border: 2px solid #ddd;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .header-button:hover {
          border-color: #007bff;
          background: #f8f9ff;
        }

        .custom-button {
          border-style: dashed;
          color: #666;
        }

        .custom-header-form {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 8px;
          background: white;
          border: 2px solid #ddd;
          border-radius: 6px;
        }

        .custom-header-input {
          flex: 1;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .add-button, .cancel-button {
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .add-button {
          background: #28a745;
          color: white;
        }

        .cancel-button {
          background: #6c757d;
          color: white;
        }

        .selected-headers {
          margin-bottom: 24px;
        }

        .headers-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .header-tab {
          display: flex;
          align-items: center;
          background: white;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .header-tab.active {
          background: #007bff;
          color: white;
        }

        .header-tab-button {
          padding: 12px 16px;
          border: none;
          background: none;
          cursor: pointer;
          flex: 1;
        }

        .header-tab.active .header-tab-button {
          color: white;
        }

        .service-count {
          margin-left: 8px;
          font-size: 12px;
          opacity: 0.8;
        }

        .remove-header-button {
          padding: 12px;
          border: none;
          background: #dc3545;
          color: white;
          cursor: pointer;
        }

        .services-section {
          margin-bottom: 24px;
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
        }

        .service-card {
          background: white;
          border: 2px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          transition: all 0.3s;
        }

        .service-card.selected {
          border-color: #007bff;
          background: #f8f9ff;
        }

        .service-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .service-checkbox {
          display: flex;
          align-items: center;
          cursor: pointer;
          flex: 1;
        }

        .service-checkbox input {
          margin-right: 12px;
        }

        .service-name {
          font-weight: 500;
        }

        .addon-badge {
          background: #ffc107;
          color: #212529;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .service-details {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e0e0e0;
        }

        .year-quarter-selection {
          margin-bottom: 16px;
        }

        .form-field {
          margin-bottom: 12px;
        }

        .form-field label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
        }

        .year-select, .quarter-select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .sub-services h4 {
          margin-bottom: 8px;
          font-size: 14px;
          color: #333;
        }

        .sub-services-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 8px;
        }

        .sub-service-item {
          display: flex;
          align-items: flex-start;
          cursor: pointer;
          padding: 4px 0;
          font-size: 13px;
        }

        .sub-service-item input {
          margin-right: 8px;
          margin-top: 2px;
        }

        .selection-summary {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .header-summary {
          margin-bottom: 16px;
        }

        .header-summary h4 {
          color: #007bff;
          margin-bottom: 8px;
        }

        .header-summary ul {
          list-style: none;
          padding-left: 16px;
        }

        .header-summary li {
          margin-bottom: 4px;
          position: relative;
        }

        .header-summary li:before {
          content: "•";
          color: #007bff;
          position: absolute;
          left: -12px;
        }

        .sub-count {
          color: #666;
          font-size: 12px;
        }

        .action-buttons {
          text-align: center;
        }

        .complete-button {
          background: #28a745;
          color: white;
          padding: 16px 32px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
        }

        .complete-button:hover {
          background: #218838;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
