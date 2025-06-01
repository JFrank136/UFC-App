import React, { useState, useEffect, useCallback } from "react";
import { searchFighters, addToFavorites, removeFavorite, getUserFavorites } from "../api/fighters";

const USERS = ["Jared", "Mars"];

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      {message}
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  );
};

// Loading spinner component
const LoadingSpinner = ({ size = "small" }) => (
  <div className={`spinner spinner-${size}`}>
    <div className="spinner-ring"></div>
  </div>
);

const SearchFighter = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(USERS[0]);
  const [favStatus, setFavStatus] = useState({});
  const [searched, setSearched] = useState(false);
  const [loadingStates, setLoadingStates] = useState({});
  const [toast, setToast] = useState(null);

  // Debounced search for real-time suggestions
  const [debounceTimer, setDebounceTimer] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const closeToast = () => {
    setToast(null);
  };

  // Fetch current status for these fighters for this user
  const fetchFavStatus = async (fighters) => {
    if (!fighters.length) {
      setFavStatus({});
      return;
    }
    try {
      const allFavorites = await getUserFavorites({ group: user, priority: "favorite" });
      const allInterested = await getUserFavorites({ group: user, priority: "interested" });
      const statusMap = {};
      allFavorites.forEach(row => {
        statusMap[row.fighter] = { status: "favorite", id: row.id };
      });
      allInterested.forEach(row => {
        if (!statusMap[row.fighter]) {
          statusMap[row.fighter] = { status: "interested", id: row.id };
        }
      });
      setFavStatus(statusMap);
    } catch (err) {
      console.error("Failed to fetch favorite status:", err);
    }
  };

  // Real-time search suggestions
  const fetchSuggestions = useCallback(async (searchQuery) => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    
    try {
      const fighters = await searchFighters(searchQuery);
      setSuggestions(fighters.slice(0, 5)); // Limit to 5 suggestions
    } catch (err) {
      setSuggestions([]);
    }
  }, []);

  // Handle query change with debouncing
  const handleQueryChange = (value) => {
    setQuery(value);
    setShowSuggestions(true);
    
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set new timer for suggestions
    const timer = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
    
    setDebounceTimer(timer);
  };

  const handleSearch = async (searchQuery = query) => {
    setLoading(true);
    setError("");
    setSearched(false);
    setShowSuggestions(false);
    
    try {
      const fighters = await searchFighters(searchQuery);
      setResults(fighters);
      await fetchFavStatus(fighters);
      setSearched(true);
      if (fighters.length === 0) {
        showToast(`No fighters found for "${searchQuery}"`, "info");
      }
    } catch (err) {
      setError("Failed to load fighters.");
      showToast("Failed to search fighters", "error");
    }
    setLoading(false);
  };

  const updateStatus = async (fighterName, newStatus) => {
    const loadingKey = `${fighterName}-${newStatus}`;
    setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      // Remove current status
      const current = favStatus[fighterName];
      if (current) {
        await removeFavorite(current.id);
      }
      
      if (newStatus === "none") {
        setFavStatus((s) => ({ ...s, [fighterName]: undefined }));
        showToast(`Removed ${fighterName} from your list`, "info");
      } else {
        // Add new status
        const newRow = await addToFavorites({
          fighterName,
          group: user,
          priority: newStatus,
        });
        setFavStatus((s) => ({
          ...s,
          [fighterName]: { status: newStatus, id: newRow.id },
        }));
        showToast(`Added ${fighterName} to ${newStatus}s!`, "success");
      }
    } catch (err) {
      showToast(`Failed to update ${fighterName}`, "error");
    }
    
    setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
  };

  const capitalize = (str) =>
    str
      .split(" ")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");

  const handleSuggestionClick = (fighterName) => {
    setQuery(fighterName);
    setShowSuggestions(false);
    handleSearch(fighterName);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowSuggestions(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <>
      <style jsx>{`
        .search-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .header h1 {
          color: #1a1a1a;
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0;
        }
        
        .controls {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }
        
        .user-selector {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .user-selector label {
          font-weight: 600;
          color: #374151;
        }
        
        .user-selector select {
          padding: 0.5rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          background: white;
          transition: border-color 0.2s;
        }
        
        .user-selector select:focus {
          outline: none;
          border-color: #3b82f6;
        }
        
        .search-section {
          position: relative;
        }
        
        .search-input-container {
          display: flex;
          gap: 0.75rem;
          position: relative;
        }
        
        .search-input {
          flex: 1;
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .search-btn {
          padding: 0.75rem 1.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .search-btn:hover:not(:disabled) {
          background: #2563eb;
        }
        
        .search-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 60px;
          background: white;
          border: 2px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 8px 8px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 10;
        }
        
        .suggestion-item {
          padding: 0.75rem 1rem;
          cursor: pointer;
          border-bottom: 1px solid #f3f4f6;
          transition: background-color 0.2s;
        }
        
        .suggestion-item:hover {
          background: #f8fafc;
        }
        
        .suggestion-item:last-child {
          border-bottom: none;
        }
        
        .favorites-link {
          text-align: center;
          margin: 1rem 0;
        }
        
        .favorites-link a {
          color: #3b82f6;
          text-decoration: none;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          transition: all 0.2s;
        }
        
        .favorites-link a:hover {
          background: #eff6ff;
        }
        
        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-top: 2rem;
        }
        
        .fighter-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transition: all 0.2s;
          border: 1px solid #e5e7eb;
        }
        
        .fighter-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.15);
        }
        
        .fighter-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 0.5rem 0;
        }
        
        .fighter-division {
          color: #6b7280;
          margin-bottom: 1rem;
          font-weight: 500;
        }
        
        .fighter-link {
          display: inline-block;
          color: #3b82f6;
          text-decoration: none;
          font-weight: 600;
          margin-bottom: 1rem;
          transition: color 0.2s;
        }
        
        .fighter-link:hover {
          color: #2563eb;
        }
        
        .action-buttons {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }
        
        .action-btn {
          padding: 0.5rem 1rem;
          border: 2px solid;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 100px;
          justify-content: center;
        }
        
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .favorite-btn {
          border-color: #ef4444;
          color: #ef4444;
          background: white;
        }
        
        .favorite-btn:hover:not(:disabled) {
          background: #ef4444;
          color: white;
        }
        
        .favorite-btn.selected {
          background: #ef4444;
          color: white;
        }
        
        .interested-btn {
          border-color: #f59e0b;
          color: #f59e0b;
          background: white;
        }
        
        .interested-btn:hover:not(:disabled) {
          background: #f59e0b;
          color: white;
        }
        
        .interested-btn.selected {
          background: #f59e0b;
          color: white;
        }
        
        .status-label {
          font-size: 0.875rem;
          font-weight: 600;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          color: white;
        }
        
        .status-favorite {
          background: #ef4444;
        }
        
        .status-interested {
          background: #f59e0b;
        }
        
        .no-results {
          text-align: center;
          padding: 3rem 1rem;
          color: #6b7280;
          font-size: 1.125rem;
        }
        
        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
        }
        
        .toast {
          position: fixed;
          top: 2rem;
          right: 2rem;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 1rem;
          max-width: 300px;
          animation: slideIn 0.3s ease-out;
        }
        
        .toast-success {
          background: #10b981;
        }
        
        .toast-error {
          background: #ef4444;
        }
        
        .toast-info {
          background: #3b82f6;
        }
        
        .toast-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.25rem;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        
        .spinner {
          border: 2px solid #f3f4f6;
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        .spinner-small {
          width: 16px;
          height: 16px;
        }
        
        .spinner-ring {
          width: 100%;
          height: 100%;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @media (max-width: 768px) {
          .search-container {
            padding: 1rem;
          }
          
          .results-grid {
            grid-template-columns: 1fr;
          }
          
          .search-input-container {
            flex-direction: column;
          }
          
          .suggestions {
            right: 0;
          }
          
          .action-buttons {
            flex-direction: column;
            align-items: stretch;
          }
          
          .action-btn {
            min-width: auto;
          }
        }
      `}</style>

      <div className="search-container">
        <div className="header">
          <h1>🥊 Fighter Search</h1>
        </div>

        <div className="controls">
          <div className="user-selector">
            <label>Select user:</label>
            <select 
              value={user} 
              onChange={async (e) => {
                setUser(e.target.value);
                if (results.length) {
                  await fetchFavStatus(results);
                }
              }}
            >
              {USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div className="search-section">
            <div className="search-input-container" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                className="search-input"
                placeholder="Enter fighter name..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  } else if (e.key === "Escape") {
                    setShowSuggestions(false);
                  }
                }}
              />
              <button 
                className="search-btn" 
                onClick={() => handleSearch()} 
                disabled={loading}
              >
                {loading ? <LoadingSpinner size="small" /> : null}
                {loading ? "Searching..." : "Search"}
              </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((fighter) => {
                  const fighterName = fighter.name || fighter.fighter;
                  return (
                    <div
                      key={fighter.id || fighterName}
                      className="suggestion-item"
                      onClick={() => handleSuggestionClick(fighterName)}
                    >
                      {capitalize(fighterName)}
                      {fighter.division && (
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>
                          • {fighter.division}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="favorites-link">
          <a href="/Favorites">← View All Favorites</a>
        </div>

        {error && <div className="error-message">{error}</div>}

        {searched && results.length === 0 && !loading && (
          <div className="no-results">
            No fighters found for "{query}". Try a different search term.
          </div>
        )}

        <div className="results-grid">
          {results.map((fighter) => {
            const fighterName = fighter.name || fighter.fighter;
            const status = favStatus[fighterName]?.status;
            const favoriteLoading = loadingStates[`${fighterName}-favorite`];
            const interestedLoading = loadingStates[`${fighterName}-interested`];
            
            return (
              <div key={fighter.id || fighterName} className="fighter-card">
                <h2 className="fighter-name">{capitalize(fighterName)}</h2>
                
                {fighter.division && (
                  <p className="fighter-division">Division: {fighter.division}</p>
                )}
                
                {fighter.url && (
                  <a 
                    href={fighter.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="fighter-link"
                  >
                    View Profile →
                  </a>
                )}
                
                <div className="action-buttons">
                  <button
                    className={`action-btn favorite-btn${status === "favorite" ? " selected" : ""}`}
                    onClick={() =>
                      status === "favorite"
                        ? updateStatus(fighterName, "none")
                        : updateStatus(fighterName, "favorite")
                    }
                    disabled={favoriteLoading}
                  >
                    {favoriteLoading ? (
                      <LoadingSpinner size="small" />
                    ) : status === "favorite" ? (
                      "❤️ Favorited"
                    ) : (
                      "🤍 Favorite"
                    )}
                  </button>
                  
                  <button
                    className={`action-btn interested-btn${status === "interested" ? " selected" : ""}`}
                    onClick={() =>
                      status === "interested"
                        ? updateStatus(fighterName, "none")
                        : updateStatus(fighterName, "interested")
                    }
                    disabled={status === "favorite" || interestedLoading}
                    title={status === "favorite" ? "Already in favorites" : ""}
                  >
                    {interestedLoading ? (
                      <LoadingSpinner size="small" />
                    ) : status === "interested" ? (
                      "⭐ Interested"
                    ) : (
                      "☆ Interested"
                    )}
                  </button>
                  
                  {status && (
                    <span className={`status-label status-${status}`}>
                      {status === "favorite" ? "In Favorites" : "Interested"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </>
  );
};

export default SearchFighter;