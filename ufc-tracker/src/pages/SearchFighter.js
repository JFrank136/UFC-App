import React, { useState, useEffect, useCallback } from "react";
import {addToFavorites, removeFavorite, getUserFavorites } from "../api/fighters";
import supabase from "../api/supabaseClient";

const USERS = ["Jared", "Mars"];

const getThemeColors = (user) => {
  return user === "Mars" ? {
    primary: '#dc2626', // Red
    primaryLight: 'rgba(220, 38, 38, 0.1)',
    primaryBorder: 'rgba(220, 38, 38, 0.3)',
    gradient: 'linear-gradient(45deg, #dc2626, #ef4444)',
    secondary: '#b91c1c'
  } : {
    primary: '#2563eb', // Blue  
    primaryLight: 'rgba(37, 99, 235, 0.1)',
    primaryBorder: 'rgba(37, 99, 235, 0.3)', 
    gradient: 'linear-gradient(45deg, #2563eb, #3b82f6)',
    secondary: '#1d4ed8'
  };
};

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

// Flag component for countries
const FlagIcon = ({ country }) => {
  const flagMap = {
    'Russia': '🇷🇺',
    'USA': '🇺🇸',
    'United States': '🇺🇸',
    'Brazil': '🇧🇷',
    'Canada': '🇨🇦',
    'United Kingdom': '🇬🇧',
    'England': '🇬🇧',      // England (using UK flag)
    'Ireland': '🇮🇪',
    'Australia': '🇦🇺',
    'Mexico': '🇲🇽',
    'France': '🇫🇷',
    'Germany': '🇩🇪',
    'Poland': '🇵🇱',
    'Sweden': '🇸🇪',
    'Norway': '🇳🇴',
    'Netherlands': '🇳🇱',
    'China': '🇨🇳',
    'Japan': '🇯🇵',
    'South Korea': '🇰🇷',
    'Georgia': '🇬🇪',
    'Dagestan': '🇷🇺',      // Dagestan uses Russia flag
    'Chechnya': '🇷🇺',      // Chechnya uses Russia flag
    'Turkey': '🇹🇷',
    'Bolivia': '🇧🇴',
    'Bahrain': '🇧🇭',
    'Nigeria': '🇳🇬',
    'Romania': '🇷🇴',
    'Chile': '🇨🇱',
    'Jamaica': '🇯🇲',
    'Lithuania': '🇱🇹',
    'South Africa': '🇿🇦',
    'Scotland': '🏴',       // (Scottish flag; may fallback to UK depending on platform)
    'Moldova': '🇲🇩',
    'Thailand': '🇹🇭',
    'Denmark': '🇩🇰',
    'Cuba': '🇨🇺',
    'Venezuela': '🇻🇪',
    'Croatia': '🇭🇷',
    'Kazakhstan': '🇰🇿',
  };

  return <span className="flag-icon">{flagMap[country] || '🏴'}</span>;
};

const SearchFighter = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [fighters, setFighters] = useState([]);
  const [filteredFighters, setFilteredFighters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(USERS[0]);
  const [userTheme, setUserTheme] = useState('jared'); // Default theme
  const [favStatus, setFavStatus] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
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

  // Filter fighters based on search query
  const filterFighters = useCallback((searchQuery) => {
    if (!searchQuery.trim()) {
      setFilteredFighters(fighters);
      return;
    }
    
    const filtered = fighters.filter(fighter => 
      fighter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fighter.weight_class?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fighter.country?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    setFilteredFighters(filtered);
  }, [fighters]);

  // Handle query change with debouncing
  const handleQueryChange = (value) => {
    setQuery(value);
    
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set new timer for filtering
    const timer = setTimeout(() => {
      filterFighters(value);
    }, 300);
    
    setDebounceTimer(timer);
  };

  // Load all fighters on component mount
  useEffect(() => {
    const fetchFighters = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("fighters")
        .select("*");
      if (error) {
        setError("Error fetching fighters.");
        setFighters([]);
        setFilteredFighters([]);
      } else {
        setFighters(data);
        setFilteredFighters(data); // Show all fighters initially
        setError("");
      }
      setLoading(false);
    };
    fetchFighters();
  }, []);

  // Update favorite status when fighters or user changes
  useEffect(() => {
    if (filteredFighters.length) {
      fetchFavStatus(filteredFighters);
    }
  }, [filteredFighters, user]);

  
  const updateStatus = async (fighter, newStatus) => {
    const loadingKey = `${fighter.name}-${newStatus}`;
    setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      // Remove current status
      const current = favStatus[fighter.name];
      if (current) {
        await removeFavorite(current.id);
      }
      
      if (newStatus === "none") {
        setFavStatus((s) => ({ ...s, [fighter.name]: undefined }));
        showToast(`Removed ${fighter.name} from your list`, "info");
      } else {
        // Add new status
        const newRow = await addToFavorites({
          fighterName: fighter.name,
          fighter_id: fighter.id,
          group: user,
          priority: newStatus,
        });
        setFavStatus((s) => ({
          ...s,
          [fighter.name]: { status: newStatus, id: newRow.id },
        }));
        showToast(`Added ${fighter.name} to ${newStatus}s!`, "success");
      }
    } catch (err) {
      showToast(`Failed to update ${fighter.name}`, "error");
    }
    
    setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
  };

  const capitalize = (str) =>
    str
      ?.split(" ")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ") || "";


  // Get ranking display for a fighter
  const getRankingDisplay = (rankings) => {
    if (!rankings || !Array.isArray(rankings)) return null;
    
    const p4p = rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divisionRank = rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
    
    return { p4p, divisionRank };
  };

  return (
    <>
      <style jsx>{`
        :root {
          --theme-primary: ${getThemeColors(user).primary};
          --theme-primary-light: ${getThemeColors(user).primaryLight};
          --theme-primary-border: ${getThemeColors(user).primaryBorder};
          --theme-gradient: ${getThemeColors(user).gradient};
          --theme-secondary: ${getThemeColors(user).secondary};
        }
        
        .search-container {
          width: 100%;
          margin: 0;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #ffffff;
          min-height: 100vh;
          color: #1a1a1a;
        }
        
        .header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .header h1 {
          font-size: 2.5rem;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0;
          text-align: center;
        }
        
        .controls {
          background: rgba(37, 99, 235, 0.05);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid var(--theme-primary-border);
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
          color: var(--theme-primary);
        }
        
        .user-selector select {
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
          color: #1a1a1a;
          font-size: 1rem;
          transition: all 0.3s ease;
        }

        .user-selector select:focus {
          outline: none;
          border-color: var(--theme-primary);
          box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2);
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
          background: #ffffff;
          color: #1a1a1a;
          font-size: 1rem;
          transition: all 0.3s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--theme-primary);
          box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2);
        }

        .search-input::placeholder {
          color: rgba(26, 26, 26, 0.6);
        }
        
        .suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.95);
          border: 2px solid rgba(255, 215, 0, 0.3);
          border-top: none;
          border-radius: 0 0 8px 8px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 10;
        }

        .suggestion-item {
          padding: 0.75rem 1rem;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 215, 0, 0.1);
          transition: background-color 0.2s;
          color: #ffffff;
        }

        .suggestion-item:hover {
          background: var(--theme-primary-light);
        }

        .suggestion-item:last-child {
          border-bottom: none;
        }
        
        .favorites-link {
          text-align: center;
          margin: 1rem 0;
        }
        
        .favorites-link a {
          color: var(--theme-primary);
          text-decoration: none;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .favorites-link a:hover {
          background: var(--theme-primary-light);
        }
        
        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
          margin-top: 2rem;
        }
        
        .fighter-card {
          background: linear-gradient(145deg, #ffffff, #f8f9fa);
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .fighter-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #FFD700, #FFA500);
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .fighter-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(255, 215, 0, 0.2);
          border-color: var(--theme-primary);
        }

        .fighter-card:hover::before {
          transform: scaleX(1);
        }
        
        .fighter-card.p4p-champion {
          border: 2px solid #ffd700;
          box-shadow: 0 4px 20px rgba(255, 215, 0, 0.4);
        }

        .fighter-card.p4p-champion::before {
          transform: scaleX(1);
        }
        
       
        .p4p-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: var(--theme-gradient);
          color: #1a1a1a;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          border: 2px solid white;
        }
        
        .fighter-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .fighter-image {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          object-fit: cover;
          object-position: top;
          flex-shrink: 0;
        }
        
        .fighter-info {
          flex: 1;
        }
        
        .fighter-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 0.5rem 0;
        }

        .fighter-name a {
          color: inherit;
          text-decoration: none;
          transition: color 0.2s;
        }

        .fighter-name a:hover {
          color: var(--theme-primary);
        }  

        .fighter-nickname {
          font-style: italic;
          font-size: 0.9rem;
          color: rgba(26, 26, 26, 0.7);
          margin-bottom: 0.25rem;
        }

        .fighter-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }
        
        .detail-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(26, 26, 26, 0.8);
        }
        
        .flag-icon {
          font-size: 1rem;
        }
        
        .record {
          font-weight: 600;
          color: #1a1a1a;
        }
        
        .ranking-info {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        
        .rank-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        
        .rank-division {
          background: rgba(255, 215, 0, 0.2);
          color: var(--theme-primary);
          border: 1px solid rgba(255, 215, 0, 0.4);
        }

        .rank-p4p {
          background: #ffd700;
          color: #1a1a1a;
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
          border-color: var(--theme-primary);
          color: var(--theme-primary);
          background: var(--theme-primary-light);
        }

        .favorite-btn:hover:not(:disabled) {
          background: rgba(255, 215, 0, 0.2);
          transform: scale(1.05);
        }

        .favorite-btn.selected {
          background: rgba(255, 215, 0, 0.3);
          color: var(--theme-primary);
        }

        .interested-btn {
          border-color: #FFA500;
          color: #FFA500;
          background: rgba(255, 165, 0, 0.1);
        }

        .interested-btn:hover:not(:disabled) {
          background: rgba(255, 165, 0, 0.2);
          transform: scale(1.05);
        }

        .interested-btn.selected {
          background: rgba(255, 165, 0, 0.3);
          color: #FFA500;
        }        

        .no-results {
          text-align: center;
          padding: 3rem 1rem;
          color: rgba(255, 255, 255, 0.7);
          font-size: 1.125rem;
        }
        
        .error-message {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          color: #ff6b6b;
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
        }
        
        .loading-container {
          text-align: center;
          padding: 3rem;
          color: rgba(255, 255, 255, 0.8);
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
          border: 2px solid rgba(255, 215, 0, 0.2);
          border-top: 2px solid #FFD700;
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
          
          .fighter-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          
          .fighter-details {
            grid-template-columns: 1fr;
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
              const newUser = e.target.value;
              setUser(newUser);
              setUserTheme(newUser.toLowerCase());
              if (filteredFighters.length) {
                await fetchFavStatus(filteredFighters);
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
            <div className="search-input-container">
              <input
                type="text"
                className="search-input"
                placeholder="Search fighters by name, division, or country..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="favorites-link">
          <a href="/Favorites">← View All Favorites</a>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading && (
          <div className="loading-container">
            <LoadingSpinner />
            <p>Loading fighters...</p>
          </div>
        )}

        {!loading && filteredFighters.length === 0 && query.trim() && (
          <div className="no-results">
            No fighters found for "{query}". Try a different search term.
          </div>
        )}

        <div className="results-grid">
          {filteredFighters.map((fighter) => {
            const fighterName = fighter.name;
            const status = favStatus[fighterName]?.status;
            const favoriteLoading = loadingStates[`${fighterName}-favorite`];
            const interestedLoading = loadingStates[`${fighterName}-interested`];
            const rankings = getRankingDisplay(fighter.ufc_rankings);
            const isP4PChampion = rankings.p4p && rankings.p4p.rank === 1;
            
            return (
              <div 
                key={fighter.id} 
                className={`fighter-card${isP4PChampion ? ' p4p-champion' : ''}`}
              >
                {isP4PChampion && (
                  <div className="p4p-badge">👑 P4P #1</div>
                )}
                
                <div className="fighter-header">
                  {(fighter.image_url || fighter.image_local_path) && (
                    <img
                      src={fighter.image_url || fighter.image_local_path}
                      alt={fighter.name}
                      className="fighter-image"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  
                  <div className="fighter-info">
<                   h2 className="fighter-name">
                      {fighter.profile_url_ufc ? (
                        <a href={fighter.profile_url_ufc} target="_blank" rel="noreferrer">
                          {capitalize(fighterName)}
                        </a>
                      ) : (
                        capitalize(fighterName)
                      )}
                    </h2>
                    {fighter.nickname && (
                      <div className="fighter-nickname">
                        "{fighter.nickname}"
                      </div>
                    )}                    
                    <div className="fighter-details">
                      {fighter.country && (
                        <div
                          className="detail-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4em",
                            whiteSpace: "nowrap"
                          }}
                        >
                          <FlagIcon country={fighter.country} />
                          <span>{fighter.country}</span>
                        </div>
                      )}
                      
                      <div className="detail-item">
                        <span>{fighter.age ? `Age: ${fighter.age}` : ''}</span>
                      </div>
                      
                      {fighter.weight_class && (
                        <div className="detail-item">
                          <span>{fighter.weight_class}</span>
                        </div>
                      )}
                      
                      <div className="detail-item record">
                        {fighter.wins_total}-{fighter.losses_total}
                        {fighter.draws_total && parseInt(fighter.draws_total) > 0 && `-${fighter.draws_total}`}
                      </div>
                    </div>
                  </div>
                </div>
                
                {rankings && (rankings.p4p || rankings.divisionRank) && (
                  <div className="ranking-info">
                    {rankings.p4p && (
                      <span className="rank-badge rank-p4p">
                        P4P #{rankings.p4p.rank}
                      </span>
                    )}
                    {rankings.divisionRank && (
                      <span className="rank-badge rank-division">
                        {rankings.divisionRank.division} #{rankings.divisionRank.rank}
                      </span>
                    )}
                  </div>
                )}
                
                <div className="action-buttons">
                  <button
                    className={`action-btn favorite-btn${status === "favorite" ? " selected" : ""}`}
                    onClick={() =>
                      status === "favorite"
                        ? updateStatus(fighter, "none")
                        : updateStatus(fighter, "favorite")
                    }
                    disabled={favoriteLoading}
                  >
                    {favoriteLoading ? (
                      <LoadingSpinner size="small" />
                    ) : status === "favorite" ? (
                      "👑 Favorited"
                    ) : (
                      "⭐ Favorite"
                    )}
                  </button>
                  
                  <button
                    className={`action-btn interested-btn${status === "interested" ? " selected" : ""}`}
                    onClick={() =>
                      status === "interested"
                        ? updateStatus(fighter, "none")
                        : updateStatus(fighter, "interested")
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