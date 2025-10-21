import React from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle = ({ darkMode, onToggle, className = '' }) => {
  return (
    <button
      className={`theme-toggle ${darkMode ? 'dark' : 'light'} ${className}`}
      onClick={onToggle}
      title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
    >
      {darkMode ? <Sun size={20} /> : <Moon size={20} />}

      <style jsx>{`
        .theme-toggle {
          background: var(--toggle-bg);
          border: 1px solid var(--toggle-border);
          border-radius: 12px;
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--toggle-color);
        }

        .theme-toggle.dark {
          --toggle-bg: rgba(255, 215, 0, 0.1);
          --toggle-border: rgba(255, 215, 0, 0.3);
          --toggle-color: #FFD700;
        }

        .theme-toggle.light {
          --toggle-bg: rgba(0, 0, 0, 0.05);
          --toggle-border: rgba(0, 0, 0, 0.1);
          --toggle-color: #1a1a1a;
        }

        .theme-toggle:hover {
          transform: scale(1.1);
          background: var(--toggle-hover);
        }

        .theme-toggle.dark:hover {
          --toggle-hover: rgba(255, 215, 0, 0.2);
        }

        .theme-toggle.light:hover {
          --toggle-hover: rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </button>
  );
};

export default ThemeToggle;
