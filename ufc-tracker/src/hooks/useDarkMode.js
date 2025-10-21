import { useState, useEffect } from 'react';

/**
 * Custom hook for managing dark mode state
 * @param {boolean} initialValue - Initial dark mode value (default: true)
 * @returns {[boolean, function]} - [darkMode, setDarkMode]
 */
const useDarkMode = (initialValue = true) => {
  // Try to get saved preference from localStorage
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const savedMode = localStorage.getItem('darkMode');
      return savedMode !== null ? JSON.parse(savedMode) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  // Save to localStorage whenever dark mode changes
  useEffect(() => {
    try {
      localStorage.setItem('darkMode', JSON.stringify(darkMode));
    } catch (error) {
      console.error('Failed to save dark mode preference:', error);
    }
  }, [darkMode]);

  return [darkMode, setDarkMode];
};

export default useDarkMode;
