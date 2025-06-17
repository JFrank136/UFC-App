import React, { useState, useEffect, useCallback } from "react";
import {addToFavorites, removeFavorite, getUserFavorites } from "../api/fighters";
import { searchFightersWithRanking } from "../api/supabaseQueries";
import supabase from "../api/supabaseClient";
import countryCodes from '../utils/countryCodes';

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

// Multi-select dropdown component with search
const MultiSelectDropdown = ({ options, selectedValues, onChange, placeholder, selectAllLabel = "Select All", searchable = false }) => {
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
    <div className="multi-select-container">
      <div 
        className="multi-select-trigger" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{displayText}</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      
      {isOpen && (
        <div className="multi-select-dropdown">
          {searchable && (
            <>
              <div className="search-input-container">
                <input
                  type="text"
                  className="dropdown-search"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="dropdown-divider"></div>
            </>
          )}
          <div className="select-all-option" onClick={handleSelectAll}>
            <input 
              type="checkbox" 
              checked={isAllSelected}
              onChange={() => {}}
            />
            <span>{selectAllLabel}</span>
          </div>
          <div className="dropdown-divider"></div>
          {filteredOptions.map(option => (
            <div 
              key={option} 
              className="dropdown-option"
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
            <div className="no-options">No results found</div>
          )}
        </div>
      )}
    </div>
  );
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

const SearchFighter = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [fighters, setFighters] = useState([]);
  const [filteredFighters, setFilteredFighters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(USERS[0]);
  const [userTheme, setUserTheme] = useState('jared');
  const [favStatus, setFavStatus] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
  const [debounceTimer, setDebounceTimer] = useState(null);

  // Filter states
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [selectedGender, setSelectedGender] = useState('All');
  const [showRankedOnly, setShowRankedOnly] = useState(false);
  const [showP4POnly, setShowP4POnly] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showInterestedOnly, setShowInterestedOnly] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  // Available options for filters
  const [availableCountries, setAvailableCountries] = useState([]);
  const [availableDivisions, setAvailableDivisions] = useState([]);

  // Sort options
  const sortOptions = [
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'recent_fights', label: 'Most Recent Fights' },
    { value: 'upcoming_fights', label: 'Upcoming Fights' },
    { value: 'ranking', label: 'Ranking' }
  ];

  // Gender inference helper - now uses database column
const inferGender = (fighter) => {
  return fighter.gender || 'Unknown';
};
  

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const clearAllFilters = () => {
    setSelectedGender('All');
    setSelectedCountries([]);
    setSelectedDivisions([]);
    setShowRankedOnly(false);
    setShowP4POnly(false);
    setShowFavoritesOnly(false);
    setShowInterestedOnly(false);
    setSortBy('name');
    setQuery('');
    showToast('Filters cleared', 'info');
  };

  const hasActiveFilters = () => {
    return selectedGender !== 'All' || 
          selectedCountries.length > 0 || 
          selectedDivisions.length > 0 || 
          showRankedOnly || 
          showP4POnly ||
          showFavoritesOnly ||
          showInterestedOnly ||
          sortBy !== 'name' ||
          query.trim() !== '';
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

  // Extract unique countries and divisions from fighters
  const extractFilterOptions = useCallback((fightersData) => {
    const countries = [...new Set(fightersData.map(f => f.country).filter(Boolean))].sort();
    const divisions = [...new Set(fightersData.map(f => f.weight_class).filter(Boolean))].sort();
    
    setAvailableCountries(countries);
    setAvailableDivisions(divisions);
  }, []);

  // Filter fighters based on all criteria
  const filterFighters = useCallback((searchQuery) => {
    let filtered = fighters;

    // Text search - name and nickname only
    if (searchQuery.trim()) {
      filtered = filtered.filter(fighter => 
        fighter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.nickname?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Gender filter - using database column
    if (selectedGender !== 'All') {
      const targetGender = selectedGender === 'Men' ? 'Male' : selectedGender === 'Women' ? 'Female' : selectedGender;
      filtered = filtered.filter(fighter => {
        const fighterGender = inferGender(fighter);
        return fighterGender === targetGender;
      });
    }

    // Country filter
    if (selectedCountries.length > 0 && selectedCountries.length < availableCountries.length) {
      filtered = filtered.filter(fighter => 
        selectedCountries.includes(fighter.country)
      );
    }

    // Division filter
    if (selectedDivisions.length > 0 && selectedDivisions.length < availableDivisions.length) {
      filtered = filtered.filter(fighter => 
        selectedDivisions.includes(fighter.weight_class)
      );
    }

    // Ranked filter (has divisional ranking)
    if (showRankedOnly) {
      filtered = filtered.filter(fighter => {
        const rankings = getRankingDisplay(fighter.rankings);
        return rankings && rankings.divisionRank;
      });
    }

    // P4P filter
    if (showP4POnly) {
      filtered = filtered.filter(fighter => {
        const rankings = getRankingDisplay(fighter.rankings);
        return rankings && rankings.p4p;
      });
    }

    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter(fighter => 
        favStatus[fighter.name]?.status === 'favorite'
      );
    }

    // Interested filter
    if (showInterestedOnly) {
      filtered = filtered.filter(fighter => 
        favStatus[fighter.name]?.status === 'interested'
      );
    }

    // Sorting
    filtered = filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent_fights':
          const aRecentFight = a.fight_history?.length > 0 ? 
            new Date(Math.max(...a.fight_history.map(f => new Date(f.fight_date)))) : new Date(0);
          const bRecentFight = b.fight_history?.length > 0 ? 
            new Date(Math.max(...b.fight_history.map(f => new Date(f.fight_date)))) : new Date(0);
          return bRecentFight - aRecentFight;
          
        case 'upcoming_fights':
          const today = new Date();
          const aUpcoming = a.upcoming_fights?.filter(f => new Date(f.event_date) > today);
          const bUpcoming = b.upcoming_fights?.filter(f => new Date(f.event_date) > today);
          
          if (aUpcoming?.length > 0 && bUpcoming?.length === 0) return -1;
          if (aUpcoming?.length === 0 && bUpcoming?.length > 0) return 1;
          if (aUpcoming?.length > 0 && bUpcoming?.length > 0) {
            const aNextFight = new Date(Math.min(...aUpcoming.map(f => new Date(f.event_date))));
            const bNextFight = new Date(Math.min(...bUpcoming.map(f => new Date(f.event_date))));
            return aNextFight - bNextFight;
          }
          return a.name.localeCompare(b.name);
          
        case 'ranking':
          const aRankings = getRankingDisplay(a.rankings);
          const bRankings = getRankingDisplay(b.rankings);
          
          // P4P rankings take priority
          if (aRankings?.p4p && bRankings?.p4p) {
            return aRankings.p4p.rank - bRankings.p4p.rank;
          }
          if (aRankings?.p4p && !bRankings?.p4p) return -1;
          if (!aRankings?.p4p && bRankings?.p4p) return 1;
          
          // Then divisional rankings
          if (aRankings?.divisionRank && bRankings?.divisionRank) {
            return aRankings.divisionRank.rank - bRankings.divisionRank.rank;
          }
          if (aRankings?.divisionRank && !bRankings?.divisionRank) return -1;
          if (!aRankings?.divisionRank && bRankings?.divisionRank) return 1;
          
          return a.name.localeCompare(b.name);
          
        default: // name
          return a.name.localeCompare(b.name);
      }
    });
    
    setFilteredFighters(filtered);
  }, [fighters, selectedGender, selectedCountries, selectedDivisions, showRankedOnly, showP4POnly, showFavoritesOnly, showInterestedOnly, sortBy, favStatus, availableCountries.length, availableDivisions.length]);

  // Handle query change with debouncing
  const handleQueryChange = (value) => {
    setQuery(value);
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const timer = setTimeout(() => {
      filterFighters(value);
    }, 300);
    
    setDebounceTimer(timer);
  };

  // Re-filter when filter criteria change
  useEffect(() => {
    filterFighters(query);
  }, [filterFighters, query]);

  // Load all fighters on component mount with rankings
  useEffect(() => {
    const fetchFighters = async () => {
      setLoading(true);
      try {
        // First get all fighters for filtering options
        const { data: allFighters, error: fightersError } = await supabase
          .from("fighters")
          .select("*");
          
        if (fightersError) throw fightersError;
        
        // Get rankings, fight history, and upcoming fights data
        const [
          { data: allRankings, error: rankingsError },
          { data: allFightHistory, error: fightHistoryError },
          { data: allUpcomingFights, error: upcomingFightsError }
        ] = await Promise.all([
          supabase.from("rankings").select("*"),
          supabase.from("fight_history").select("*"),
          supabase.from("upcoming_fights").select("*")
        ]);
          
        if (rankingsError) throw rankingsError;
        if (fightHistoryError) throw fightHistoryError;
        if (upcomingFightsError) throw upcomingFightsError;
        
        // Combine fighters with their data
        const fightersWithRankings = allFighters.map(fighter => ({
          ...fighter,
          rankings: allRankings?.filter(r => r.uuid === fighter.id) || [],
          fight_history: allFightHistory?.filter(f => f.fighter_id === fighter.id) || [],
          upcoming_fights: allUpcomingFights?.filter(f => 
            f.fighter1_id === fighter.id || f.fighter2_id === fighter.id) || []
        }));
        
        setFighters(fightersWithRankings);
        setFilteredFighters(fightersWithRankings);
        extractFilterOptions(fightersWithRankings);
        setError("");
      } catch (err) {
        console.error("Error fetching fighters:", err);
        setError("Error fetching fighters.");
        setFighters([]);
        setFilteredFighters([]);
      }
      setLoading(false);
    };
    fetchFighters();
  }, [extractFilterOptions]);

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
      const current = favStatus[fighter.name];
      if (current) {
        await removeFavorite(current.id);
      }
      
      if (newStatus === "none") {
        setFavStatus((s) => ({ ...s, [fighter.name]: undefined }));
        showToast(`Removed ${fighter.name} from your list`, "info");
      } else {
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
    const divisionRank = rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound') && r.rank !== 'NR');
    
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
          position: relative;
          text-align: center;
          margin-bottom: 2rem;
          padding: 3rem 2rem;
          border-radius: 20px;
          overflow: hidden;
          background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .header-background {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(45deg, 
            rgba(255, 215, 0, 0.1) 0%, 
            rgba(255, 140, 0, 0.1) 25%,
            rgba(220, 38, 38, 0.1) 50%,
            rgba(59, 130, 246, 0.1) 75%,
            rgba(16, 185, 129, 0.1) 100%
          );
          animation: gradientShift 8s ease-in-out infinite;
        }

        @keyframes gradientShift {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }

        .header-content {
          position: relative;
          z-index: 2;
        }
        
        .header h1 {
          font-size: 3rem;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 0.5rem 0;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
          background: linear-gradient(135deg, #ffd700 0%, #ff8c00 50%, #ff4500 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header p {
          font-size: 1.2rem;
          color: rgba(255, 255, 255, 0.9);
          margin: 0;
          font-weight: 500;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
        }
        
        .controls {
          background: rgba(37, 99, 235, 0.05);
          padding: 2rem;
          border-radius: 16px;
          border: 1px solid var(--theme-primary-border);
          margin-bottom: 2rem;
        }
        
        .user-selector {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
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
          box-shadow: 0 0 0 3px var(--theme-primary-light);
        }
        
        .search-section {
          position: relative;
        }
        
        .search-input-container {
          display: flex;
          gap: 0.75rem;
          position: relative;
          margin-bottom: 1.5rem;
        }

        .filter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .mobile-filter-toggle {
          display: none;
          background: none;
          border: 2px solid var(--theme-primary-border);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: inherit;
          font-weight: 600;
          cursor: pointer;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.3s ease;
        }

        .mobile-filter-toggle:hover {
          border-color: var(--theme-primary);
          background: var(--theme-primary-light);
        }

        .toggle-icon {
          transition: transform 0.3s ease;
          font-size: 0.8rem;
        }

        .toggle-icon.collapsed {
          transform: rotate(-90deg);
        }

        .clear-filters-btn {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 6px;
          padding: 0.5rem 1rem;
          color: #ef4444;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .clear-filters-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          transform: scale(1.05);
        }

        .country-display {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .country-flag {
          font-size: 1.2rem;
          min-width: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .country-name {
          font-size: 0.85rem;
          opacity: 0.8;
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
        
        .filter-controls {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--theme-primary);
          box-shadow: 0 0 0 3px var(--theme-primary-light);
        }

        .search-input::placeholder {
          color: rgba(26, 26, 26, 0.6);
        }

        .multi-select-container {
          position: relative;
          min-width: 180px;
          flex-shrink: 0;
        }

        .multi-select-trigger {
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
          color: #1a1a1a;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.3s ease;
          white-space: nowrap;
        }

        .multi-select-trigger:hover {
          border-color: var(--theme-primary);
        }

        .dropdown-arrow {
          font-size: 0.8rem;
          color: #666;
          transition: transform 0.2s ease;
        }

        .multi-select-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 2px solid var(--theme-primary-border);
          border-top: none;
          border-radius: 0 0 8px 8px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .select-all-option, .dropdown-option {
          padding: 0.5rem 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: background-color 0.2s;
          font-size: 0.9rem;
        }

        .select-all-option:hover, .dropdown-option:hover {
          background: var(--theme-primary-light);
        }

        .select-all-option {
          font-weight: 600;
          color: var(--theme-primary);
        }

        .dropdown-divider {
          height: 1px;
          background: #e5e7eb;
          margin: 0.25rem 0;
        }

        .checkbox-filter {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 0.9rem;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .checkbox-filter:hover {
          border-color: var(--theme-primary);
          background: var(--theme-primary-light);
        }

        .checkbox-filter.active {
          border-color: var(--theme-primary);
          background: var(--theme-primary-light);
          color: var(--theme-primary);
        }

        .checkbox-filter input[type="checkbox"] {
          margin: 0;
        }

        .gender-selector {
          position: relative;
          min-width: 160px;
          flex-shrink: 0;
        }

        .gender-dropdown-trigger {
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
          color: #1a1a1a;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.3s ease;
          font-weight: 500;
          white-space: nowrap;
        }

        .gender-dropdown-trigger:hover {
          border-color: var(--theme-primary);
        }

        .gender-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 2px solid var(--theme-primary-border);
          border-top: none;
          border-radius: 0 0 8px 8px;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .gender-option {
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
          font-size: 0.9rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .gender-option:hover {
          background: var(--theme-primary-light);
        }

        .gender-option.selected {
          background: var(--theme-primary-light);
          color: var(--theme-primary);
          font-weight: 600;
        }

        .dropdown-search {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          font-size: 0.85rem;
          outline: none;
        }

        .dropdown-search:focus {
          border-color: var(--theme-primary);
        }

        .search-input-container {
          padding: 0.5rem;
        }

        .no-options {
          padding: 0.75rem;
          text-align: center;
          color: #666;
          font-size: 0.9rem;
          font-style: italic;
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
        
        .fighter-card.favorited-card {
          background: ${user === 'Mars' ? 
            'linear-gradient(145deg, #fee2e2, #fecaca)' : 
            'linear-gradient(145deg, #dbeafe, #bfdbfe)'
          };
          border: 3px solid ${user === 'Mars' ? '#ef4444' : '#3b82f6'};
          box-shadow: 0 8px 25px ${user === 'Mars' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'};
          transform: scale(1.02);
        }

        .control-group select:focus, .sort-select:focus {
          border-color: var(--theme-primary);
          box-shadow: 0 0 0 3px var(--theme-primary-light);
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 160px;
          flex-shrink: 0;
        }

        .control-group label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--theme-primary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .sort-select {
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
          color: #1a1a1a;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          outline: none;
          font-weight: 500;
        }

        .sort-select:hover {
          border-color: var(--theme-primary);
        }

        .fighter-card.interested-card {
          background: ${user === 'Mars' ? 
            'linear-gradient(145deg, #fef2f2, #fecaca)' : 
            'linear-gradient(145deg, #eff6ff, #dbeafe)'
          };
          border: 2px solid ${user === 'Mars' ? '#dc2626' : '#2563eb'};
          box-shadow: 0 6px 20px ${user === 'Mars' ? 'rgba(220, 38, 38, 0.25)' : 'rgba(37, 99, 235, 0.25)'};
          transform: scale(1.01);
        }
        
        .p4p-badge {
          position: absolute;
          top: 0;
          right: 0;
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          color: #1a1a1a;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.5rem 0.8rem 0.3rem 0.5rem;
          clip-path: polygon(0 0, 100% 0, 100% 100%, 0 85%);
          border-bottom-left-radius: 6px;
          box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
          white-space: nowrap;
          z-index: 2;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border: 1px solid #f59e0b;
          border-top: none;
          border-right: none;
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
          background: rgba(37, 99, 235, 0.1);
          color: var(--theme-primary);
          border: 1px solid var(--theme-primary-border);
        }
        
        .rank-p4p {
          background: rgba(255, 215, 0, 0.1);
          color: #b8860b;
          border: 1px solid rgba(255, 215, 0, 0.3);
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
          background: var(--theme-primary-light);
          transform: scale(1.05);
        }

        .favorite-btn.selected {
          background: var(--theme-primary);
          color: white;
        }

        .interested-btn {
          border-color: var(--theme-primary);
          color: var(--theme-primary);
          background: transparent;
        }

        .interested-btn:hover:not(:disabled) {
          background: var(--theme-primary-light);
          transform: scale(1.05);
        }

        .interested-btn.selected {
          background: var(--theme-primary-light);
          color: var(--theme-primary);
        }        

        .no-results {
          text-align: center;
          padding: 3rem 1rem;
          color: rgba(26, 26, 26, 0.7);
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
          color: rgba(26, 26, 26, 0.8);
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
          border: 2px solid var(--theme-primary-light);
          border-top: 2px solid var(--theme-primary);
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

        .filter-summary {
          background: var(--theme-primary-light);
          border: 1px solid var(--theme-primary-border);
          border-radius: 8px;
          padding: 1rem;
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--theme-primary);
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

          .controls {
            padding: 1.5rem;
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
          }
          
          .results-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .search-input-container {
            flex-direction: column;
          }

          .filter-controls {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
          }

          .gender-selector, .multi-select-container, .checkbox-filter, .control-group {
            min-width: auto;
            flex-shrink: 1;
          }

          .header {
            padding: 2rem 1rem;
            margin-bottom: 1.5rem;
          }

          .header h1 {
            font-size: 2.2rem;
          }

          .header p {
            font-size: 1rem;
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
            flex-direction: row;
            gap: 0.5rem;
          }
          
          .action-btn {
            min-width: auto;
            flex: 1;
            padding: 0.75rem 0.5rem;
            font-size: 0.9rem;
          }

          .p4p-badge {
            top: 0;
            right: 0;
            padding: 0.3rem 0.6rem 0.2rem 0.4rem;
            font-size: 0.65rem;
          }

          .fighter-card {
            padding: 1rem;
          }

          .fighter-name {
            font-size: 1.1rem;
          }
        }

        @media (max-width: 1200px) {
          .filter-controls {
            flex-wrap: wrap;
            gap: 0.75rem;
          }

          .multi-select-container {
            min-width: 160px;
          }

          .gender-selector {
            min-width: 140px;
          }

          .control-group {
            min-width: 140px;
          }
        }
      `}</style>

      <div className="search-container">
        <div className="header">
          <div className="header-background"></div>
          <div className="header-content">
            <h1>🥊 Fighter Search</h1>
            <p>Discover and track your favorite UFC fighters</p>
          </div>
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
                placeholder="Search fighters by name or nickname..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
              />
            </div>
            
            <div className="filter-header">
              <button 
                className="mobile-filter-toggle"
                onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              >
                <span>Filters</span>
                <span className={`toggle-icon ${filtersCollapsed ? 'collapsed' : ''}`}>▼</span>
              </button>
              
              {hasActiveFilters() && (
                <button className="clear-filters-btn" onClick={clearAllFilters}>
                  Clear All
                </button>
              )}
            </div>

            <div className={`filter-controls ${filtersCollapsed ? 'collapsed' : ''}`}>
              <div className="control-group">
                <label>Sort By</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  className="sort-select"
                >
                  {sortOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="gender-selector">
                <div 
                  className="gender-dropdown-trigger" 
                  onClick={() => setGenderDropdownOpen(!genderDropdownOpen)}
                >
                  <span>
                    {selectedGender === 'All' ? '👥 All Fighters' : 
                     selectedGender === 'Men' ? 'Men\'s Divisions' : 
                     'Women\'s Divisions'}
                  </span>
                  <span className="dropdown-arrow">{genderDropdownOpen ? '▲' : '▼'}</span>
                </div>
                
                {genderDropdownOpen && (
                  <div className="gender-dropdown">
                    {[
                      { value: 'All', label: '👥 All Fighters' },
                      { value: 'Men', label: 'Men\'s Divisions' },
                      { value: 'Women', label: 'Women\'s Divisions' }
                    ].map(option => (
                      <div
                        key={option.value}
                        className={`gender-option ${selectedGender === option.value ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedGender(option.value);
                          setGenderDropdownOpen(false);
                        }}
                      >
                        {option.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <MultiSelectDropdown
                options={availableCountries}
                selectedValues={selectedCountries}
                onChange={setSelectedCountries}
                placeholder="All Countries"
                searchable={true}
              />
              
              <MultiSelectDropdown
                options={availableDivisions}
                selectedValues={selectedDivisions}
                onChange={setSelectedDivisions}
                placeholder="All Divisions"
              />
              
              <label 
                className={`checkbox-filter ${showRankedOnly ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={showRankedOnly}
                  onChange={(e) => setShowRankedOnly(e.target.checked)}
                />
                Ranked Only
              </label>
              
              <label 
                className={`checkbox-filter ${showP4POnly ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={showP4POnly}
                  onChange={(e) => setShowP4POnly(e.target.checked)}
                />
                P4P Only
              </label>

              <label 
                className={`checkbox-filter ${showFavoritesOnly ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={showFavoritesOnly}
                  onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                />
                ⭐ Favorites
              </label>

              <label 
                className={`checkbox-filter ${showInterestedOnly ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={showInterestedOnly}
                  onChange={(e) => setShowInterestedOnly(e.target.checked)}
                />
                👀 Interested
              </label>
            </div>

            {/* Filter Summary */}
            {hasActiveFilters() && (
              <div className="filter-summary">
                Showing {filteredFighters.length} fighters
                {sortBy !== 'name' && ` • Sorted by ${sortOptions.find(opt => opt.value === sortBy)?.label}`}
                {selectedGender !== 'All' && ` • ${selectedGender === 'Men' ? 'Men\'s' : 'Women\'s'} divisions`}
                {selectedCountries.length > 0 && selectedCountries.length < availableCountries.length && 
                  ` • Countries: ${selectedCountries.slice(0, 3).join(', ')}${selectedCountries.length > 3 ? ` +${selectedCountries.length - 3} more` : ''}`
                }
                {selectedDivisions.length > 0 && selectedDivisions.length < availableDivisions.length && 
                  ` • Divisions: ${selectedDivisions.slice(0, 2).join(', ')}${selectedDivisions.length > 2 ? ` +${selectedDivisions.length - 2} more` : ''}`
                }
                {showRankedOnly && ' • Ranked fighters only'}
                {showP4POnly && ' • P4P fighters only'}
                {showFavoritesOnly && ' • Favorites only'}
                {showInterestedOnly && ' • Interested only'}
              </div>
            )}
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

        {!loading && filteredFighters.length === 0 && (query.trim() || selectedGender !== 'All' || selectedCountries.length > 0 || selectedDivisions.length > 0 || showRankedOnly || showP4POnly) && (
          <div className="no-results">
            No fighters found matching your criteria. Try adjusting your filters.
          </div>
        )}

        <div className="results-grid">
          {filteredFighters.map((fighter) => {
            const fighterName = fighter.name;
            const status = favStatus[fighterName]?.status;
            const favoriteLoading = loadingStates[`${fighterName}-favorite`];
            const interestedLoading = loadingStates[`${fighterName}-interested`];
            const rankings = getRankingDisplay(fighter.rankings);
            const isP4PChampion = rankings?.p4p && rankings.p4p.rank !== 'NR';
            
            return (
              <div 
                key={fighter.id} 
                className={`fighter-card${isP4PChampion ? ' p4p-champion' : ''}${
                  status === 'favorite' ? ' favorited-card' : 
                  status === 'interested' ? ' interested-card' : ''
                }`}
              >
                {rankings?.p4p && (
                  <div className="p4p-badge">
                    P4P #{rankings.p4p.rank}
                  </div>
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
                    <h2 className="fighter-name">
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
                        <div className="detail-item">
                          <span style={{ fontSize: "1.5rem" }}>
                            {countryCodes[fighter.country?.trim()]}
                          </span>
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
                
                {rankings && (rankings.divisionRank || rankings.p4p) && (
                  <div className="ranking-info">
                    {rankings.divisionRank && (
                      <span className="rank-badge rank-division">
                        {rankings.divisionRank.rank === 'C' ? 'Champion' : `#${rankings.divisionRank.rank}`} {rankings.divisionRank.division}
                      </span>
                    )}
                    {rankings.p4p && (
                      <span className="rank-badge rank-p4p">
                        P4P #{rankings.p4p.rank}
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