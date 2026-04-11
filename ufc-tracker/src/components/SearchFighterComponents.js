import React, { useState, useEffect } from 'react';

/**
 * Multi-select dropdown component with search functionality
 * Accepts styles prop for CSS module support
 */
export const MultiSelectDropdown = ({ 
  options, 
  selectedValues, 
  onChange, 
  placeholder, 
  selectAllLabel = "Select All", 
  searchable = false,
  styles = {} // Accept styles prop
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOptions = searchable ? 
    options.filter(option => option.toLowerCase().includes(searchTerm.toLowerCase())) : 
    options;

  const handleSelectAll = () => {
    if (selectedValues.length === filteredOptions.length) {
      onChange([]);
    } else {
      onChange(filteredOptions);
    }
  };

  const handleOptionToggle = (option) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter(v => v !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const isAllSelected = selectedValues.length === filteredOptions.length && filteredOptions.length > 0;
  const displayText = selectedValues.length === 0 ? placeholder : 
    selectedValues.length === 1 ? selectedValues[0] :
    `${selectedValues.length} selected`;

  return (
    <div className={styles.multiSelectContainer || 'multi-select-container'}>
      <div 
        className={styles.multiSelectTrigger || 'multi-select-trigger'} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{displayText}</span>
        <span className={styles.dropdownArrow || 'dropdown-arrow'}>{isOpen ? '▲' : '▼'}</span>
      </div>
      
      {isOpen && (
        <div className={styles.multiSelectDropdown || 'multi-select-dropdown'}>
          {searchable && (
            <>
              <div className={styles.searchInputContainer || 'search-input-container'}>
                <input
                  type="text"
                  className={styles.dropdownSearch || 'dropdown-search'}
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className={styles.dropdownDivider || 'dropdown-divider'}></div>
            </>
          )}
          <div className={styles.selectAllOption || 'select-all-option'} onClick={handleSelectAll}>
            <input 
              type="checkbox" 
              checked={isAllSelected}
              onChange={() => {}}
            />
            <span>{selectAllLabel}</span>
          </div>
          <div className={styles.dropdownDivider || 'dropdown-divider'}></div>
          {filteredOptions.map(option => (
            <div 
              key={option} 
              className={styles.dropdownOption || 'dropdown-option'}
              onClick={() => handleOptionToggle(option)}
            >
              <input 
                type="checkbox" 
                checked={selectedValues.includes(option)}
                onChange={() => {}}
              />
              <span>{option}</span>
            </div>
          ))}
          {searchable && filteredOptions.length === 0 && (
            <div className={styles.noOptions || 'no-options'}>No results found</div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Toast notification component with auto-dismiss
 */
export const Toast = ({ message, type, onClose, styles = {} }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`${styles.toast || 'toast'} ${styles[`toast${type.charAt(0).toUpperCase() + type.slice(1)}`] || `toast-${type}`}`}>
      {message}
      <button className={styles.toastClose || 'toast-close'} onClick={onClose}>×</button>
    </div>
  );
};

/**
 * Loading spinner component
 */
export const LoadingSpinner = ({ size = "small", styles = {} }) => (
  <div className={`${styles.spinner || 'spinner'} ${styles[`spinner${size.charAt(0).toUpperCase() + size.slice(1)}`] || `spinner-${size}`}`}>
    <div className={styles.spinnerRing || 'spinner-ring'}></div>
  </div>
);