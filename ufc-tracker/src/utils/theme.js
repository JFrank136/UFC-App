// Theme utility for consistent color management across the app
// Default theme is blue (Jared's theme)

export const getThemeColors = () => {
  return {
    primary: '#2563eb', // Blue  
    primaryLight: 'rgba(37, 99, 235, 0.1)',
    primaryBorder: 'rgba(37, 99, 235, 0.3)', 
    gradient: 'linear-gradient(45deg, #2563eb, #3b82f6)',
    secondary: '#1d4ed8'
  };
};

export default getThemeColors;