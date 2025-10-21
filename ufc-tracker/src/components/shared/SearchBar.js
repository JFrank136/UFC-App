import React from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search fighters...',
  darkMode = true,
  className = ''
}) => {
  return (
    <div className={`search-bar ${darkMode ? 'dark' : 'light'} ${className}`}>
      <Search size={18} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="clear-search"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      )}

      <style jsx>{`
        .search-bar {
          max-width: 400px;
          position: relative;
          display: flex;
          align-items: center;
          background: var(--search-bg);
          border: 1px solid var(--search-border);
          border-radius: 10px;
          padding: 0 0.75rem;
          transition: all 0.3s ease;
        }

        .search-bar.dark {
          --search-bg: rgba(255, 255, 255, 0.05);
          --search-border: rgba(255, 255, 255, 0.1);
        }

        .search-bar.light {
          --search-bg: rgba(255, 255, 255, 0.9);
          --search-border: rgba(0, 0, 0, 0.1);
        }

        .search-bar:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .search-bar :global(svg:first-child) {
          opacity: 0.5;
          flex-shrink: 0;
          color: inherit;
        }

        .search-bar input {
          flex: 1;
          background: none;
          border: none;
          color: inherit;
          padding: 0.75rem;
          font-size: 0.95rem;
          outline: none;
        }

        .search-bar input::placeholder {
          opacity: 0.5;
        }

        .clear-search {
          background: none;
          border: none;
          color: inherit;
          opacity: 0.5;
          cursor: pointer;
          padding: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          border-radius: 4px;
        }

        .clear-search:hover {
          opacity: 1;
          background: var(--clear-hover);
          color: #ef4444;
        }

        .dark .clear-search:hover {
          --clear-hover: rgba(239, 68, 68, 0.1);
        }

        .light .clear-search:hover {
          --clear-hover: rgba(239, 68, 68, 0.1);
        }
      `}</style>
    </div>
  );
};

export default SearchBar;
