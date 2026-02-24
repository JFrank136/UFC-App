import React, { useState, useEffect, useCallback } from "react";
import { Sun, Moon } from 'lucide-react';
import { addToFavorites, removeFavorite, getUserFavorites } from "../api/fighters";
import supabase from "../api/supabaseClient";
import countryCodes from '../utils/countryCodes';
import { capitalize, getRankingDisplayForSearch } from '../utils/fighterHelpers';
import { inferGender, extractFilterOptions } from '../utils/filterHelpers';
import { MultiSelectDropdown, Toast, LoadingSpinner } from '../components/SearchFighterComponents';
import styles from '../styles/SearchFighter.module.css';

// Division color dot map
const DIVISION_COLORS = {
  'Strawweight': '#ec4899',
  'Flyweight': '#a855f7',
  'Bantamweight': '#3b82f6',
  'Featherweight': '#06b6d4',
  'Lightweight': '#10b981',
  'Welterweight': '#84cc16',
  'Middleweight': '#f59e0b',
  'Light Heavyweight': '#f97316',
  'Heavyweight': '#ef4444',
};

const getDivisionColor = (weightClass) => {
  if (!weightClass) return '#6b7280';
  for (const [key, color] of Object.entries(DIVISION_COLORS)) {
    if (weightClass.includes(key)) return color;
  }
  return '#6b7280';
};

const SearchFighter = () => {
  const [fighters, setFighters] = useState([]);
  const [filteredFighters, setFilteredFighters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [favStatus, setFavStatus] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
  const [debounceTimer, setDebounceTimer] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  // Filter states
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [selectedGender, setSelectedGender] = useState('All');
  const [showRankedOnly, setShowRankedOnly] = useState(false);
  const [showP4POnly, setShowP4POnly] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showInterestedOnly, setShowInterestedOnly] = useState(false);
  const [sortBy, setSortBy] = useState('recent_fights');
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true); // collapsed by default on mobile

  // Available options for filters
  const [availableCountries, setAvailableCountries] = useState([]);
  const [availableDivisions, setAvailableDivisions] = useState([]);

  const theme = darkMode ? 'dark' : 'light';

  // Sort options
  const sortOptions = [
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'recent_fights', label: 'Most Recent Fights' },
    { value: 'upcoming_fights', label: 'Upcoming Fights' },
    { value: 'ranking', label: 'Ranking' }
  ];

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
    setSortBy('recent_fights');
    setQuery('');
    showToast('Filters cleared', 'info');
  };

  const hasActiveFiltersLocal = () => {
    return (
      selectedGender !== 'All' ||
      (selectedCountries.length > 0 && selectedCountries.length < availableCountries.length) ||
      (selectedDivisions.length > 0 && selectedDivisions.length < availableDivisions.length) ||
      showRankedOnly ||
      showP4POnly ||
      showFavoritesOnly ||
      showInterestedOnly ||
      sortBy !== 'recent_fights' ||
      query.trim().length > 0
    );
  };

  // Count active filters for badge
  const activeFilterCount = [
    selectedGender !== 'All',
    selectedCountries.length > 0 && selectedCountries.length < availableCountries.length,
    selectedDivisions.length > 0 && selectedDivisions.length < availableDivisions.length,
    showRankedOnly,
    showP4POnly,
    showFavoritesOnly,
    showInterestedOnly,
    sortBy !== 'recent_fights',
    query.trim().length > 0,
  ].filter(Boolean).length;

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
      const allFavorites = await getUserFavorites({ group: "Jared", priority: "favorite" });
      const allInterested = await getUserFavorites({ group: "Jared", priority: "interested" });
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
  const extractFilterOptionsCallback = useCallback((fightersData) => {
    const { countries, divisions } = extractFilterOptions(fightersData);
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
        const rankings = getRankingDisplayForSearch(fighter.rankings);
        return rankings && rankings.divisionRank;
      });
    }

    // P4P filter
    if (showP4POnly) {
      filtered = filtered.filter(fighter => {
        const rankings = getRankingDisplayForSearch(fighter.rankings);
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
        case 'recent_fights': {
          const getLatestFight = (fh) => {
            if (!fh || fh.length === 0) return new Date(0);
            return fh.reduce((latest, f) => {
              const d = new Date(f.fight_date);
              return d > latest ? d : latest;
            }, new Date(0));
          };
          return getLatestFight(b.fight_history) - getLatestFight(a.fight_history);
        }
          
        case 'upcoming_fights': {
          const today = new Date();
          const aUpcoming = a.upcoming_fights?.filter(f => new Date(f.event_date) > today) || [];
          const bUpcoming = b.upcoming_fights?.filter(f => new Date(f.event_date) > today) || [];
          
          if (aUpcoming.length > 0 && bUpcoming.length === 0) return -1;
          if (aUpcoming.length === 0 && bUpcoming.length > 0) return 1;
          if (aUpcoming.length > 0 && bUpcoming.length > 0) {
            const aNext = aUpcoming.reduce((earliest, f) => {
              const d = new Date(f.event_date);
              return d < earliest ? d : earliest;
            }, new Date(aUpcoming[0].event_date));
            const bNext = bUpcoming.reduce((earliest, f) => {
              const d = new Date(f.event_date);
              return d < earliest ? d : earliest;
            }, new Date(bUpcoming[0].event_date));
            return aNext - bNext;
          }
          return a.name.localeCompare(b.name);
        }
          
        case 'ranking':
          const aRankings = getRankingDisplayForSearch(a.rankings);
          const bRankings = getRankingDisplayForSearch(b.rankings);
          
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
        const { data: allFighters, error: fightersError } = await supabase
          .from("fighters")
          .select("*");
          
        if (fightersError) throw fightersError;
        
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
        
        const fightersWithRankings = allFighters.map(fighter => ({
          ...fighter,
          rankings: allRankings?.filter(r => r.uuid === fighter.id) || [],
          fight_history: allFightHistory?.filter(f => f.fighter_id === fighter.id) || [],
          upcoming_fights: allUpcomingFights?.filter(f => 
            f.fighter1_id === fighter.id || f.fighter2_id === fighter.id) || []
        }));
        
        setFighters(fightersWithRankings);
        setFilteredFighters(fightersWithRankings);
        extractFilterOptionsCallback(fightersWithRankings);
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
  }, [extractFilterOptionsCallback]);

  // Update favorite status when fighters change
  useEffect(() => {
    if (filteredFighters.length) {
      fetchFavStatus(filteredFighters);
    }
  }, [filteredFighters]);

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
          group: "Jared",
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

  return (
    <div className={styles.searchContainer} data-theme={theme}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerBackground}></div>
        <div className={styles.headerContent}>
          <h1>🥊 Fighter Search</h1>
          <p>Discover and track your favorite UFC fighters</p>
        </div>
        <button
          className={styles.themeToggle}
          onClick={() => setDarkMode(!darkMode)}
          title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.searchSection}>

          {/* Search Input */}
          <div className={styles.searchInputWrapper}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search fighters by name or nickname..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
            {query && (
              <button
                className={styles.searchClear}
                onClick={() => handleQueryChange('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Header Row */}
          <div className={styles.filterHeader}>
            <button 
              className={`${styles.mobileFilterToggle} ${activeFilterCount > 0 ? styles.hasFilters : ''}`}
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            >
              <span>⚙ Filters</span>
              {activeFilterCount > 0 && (
                <span className={styles.filterBadge}>{activeFilterCount}</span>
              )}
              <span className={`${styles.toggleIcon} ${filtersCollapsed ? styles.collapsed : ''}`}>▼</span>
            </button>

            {/* Results count - always visible */}
            <span className={styles.resultsCount}>
              {filteredFighters.length} fighter{filteredFighters.length !== 1 ? 's' : ''}
            </span>
            
            {hasActiveFiltersLocal() && (
              <button className={styles.clearFiltersBtn} onClick={clearAllFilters}>
                Clear All
              </button>
            )}
          </div>

          {/* Filter Controls */}
          <div className={`${styles.filterControls} ${filtersCollapsed ? styles.collapsed : ''}`}>
            {/* Sort */}
            <div className={styles.controlGroup}>
              <label>Sort By</label>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className={styles.sortSelect}
              >
                {sortOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Gender */}
            <div className={styles.genderSelector}>
              <div 
                className={styles.genderDropdownTrigger} 
                onClick={() => setGenderDropdownOpen(!genderDropdownOpen)}
              >
                <span>
                  {selectedGender === 'All' ? '👥 All Fighters' : 
                   selectedGender === 'Men' ? "Men's Divisions" : 
                   "Women's Divisions"}
                </span>
                <span className={styles.dropdownArrow}>{genderDropdownOpen ? '▲' : '▼'}</span>
              </div>
              
              {genderDropdownOpen && (
                <div className={styles.genderDropdown}>
                  {[
                    { value: 'All', label: '👥 All Fighters' },
                    { value: 'Men', label: "Men's Divisions" },
                    { value: 'Women', label: "Women's Divisions" }
                  ].map(option => (
                    <div
                      key={option.value}
                      className={`${styles.genderOption} ${selectedGender === option.value ? styles.selected : ''}`}
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
            
            {/* Country */}
            <MultiSelectDropdown
              options={availableCountries}
              selectedValues={selectedCountries}
              onChange={setSelectedCountries}
              placeholder="All Countries"
              searchable={true}
              styles={styles}
            />
            
            {/* Division */}
            <MultiSelectDropdown
              options={availableDivisions}
              selectedValues={selectedDivisions}
              onChange={setSelectedDivisions}
              placeholder="All Divisions"
              styles={styles}
            />
            
            {/* Toggle pills for checkbox filters */}
            <div className={styles.togglePills}>
              <button
                className={`${styles.togglePill} ${showRankedOnly ? styles.pillActive : ''}`}
                onClick={() => setShowRankedOnly(!showRankedOnly)}
              >
                🏅 Ranked
              </button>
              <button
                className={`${styles.togglePill} ${showP4POnly ? styles.pillActive : ''}`}
                onClick={() => setShowP4POnly(!showP4POnly)}
              >
                🌍 P4P
              </button>
              <button
                className={`${styles.togglePill} ${showFavoritesOnly ? styles.pillActive : ''}`}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                ⭐ Favorites
              </button>
              <button
                className={`${styles.togglePill} ${showInterestedOnly ? styles.pillActive : ''}`}
                onClick={() => setShowInterestedOnly(!showInterestedOnly)}
              >
                👀 Interested
              </button>
            </div>

          </div>

          {/* Filter Summary */}
          {hasActiveFiltersLocal() && (
            <div className={styles.filterSummary}>
              Showing {filteredFighters.length} fighters
              {sortBy !== 'recent_fights' && ` • Sorted by ${sortOptions.find(opt => opt.value === sortBy)?.label}`}
              {selectedGender !== 'All' && ` • ${selectedGender === 'Men' ? "Men's" : "Women's"} divisions`}
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

      <div className={styles.favoritesLink}>
        <a href="/Favorites">← View All Favorites</a>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {loading && (
        <div className={styles.loadingContainer}>
          <LoadingSpinner styles={styles} />
          <p>Loading fighters...</p>
        </div>
      )}

      {!loading && filteredFighters.length === 0 && (query.trim() || selectedGender !== 'All' || selectedCountries.length > 0 || selectedDivisions.length > 0 || showRankedOnly || showP4POnly) && (
        <div className={styles.noResults}>
          No fighters found matching your criteria. Try adjusting your filters.
        </div>
      )}

      {/* Fighter Cards Grid */}
      <div className={styles.resultsGrid}>
        {filteredFighters.map((fighter) => {
          const fighterName = fighter.name;
          const status = favStatus[fighterName]?.status;
          const favoriteLoading = loadingStates[`${fighterName}-favorite`];
          const interestedLoading = loadingStates[`${fighterName}-interested`];
          const rankings = getRankingDisplayForSearch(fighter.rankings);
          const isP4PChampion = rankings?.p4p && rankings.p4p.rank !== 'NR';
          const divisionColor = getDivisionColor(fighter.weight_class);

          // Only show nickname if it exists and isn't "N/A"
          const showNickname = fighter.nickname && fighter.nickname !== 'N/A' && fighter.nickname.trim() !== '';

          return (
            <div 
              key={fighter.id} 
              className={`${styles.fighterCard}${isP4PChampion ? ` ${styles.p4pChampion}` : ''}`}
              style={{ '--division-color': divisionColor }}
            >
              {/* P4P corner badge */}
              {rankings?.p4p && (
                <div className={styles.p4pBadge}>
                  P4P #{rankings.p4p.rank}
                </div>
              )}

              {/* Status pill - only shown when favorited or interested */}
              {status && (
                <div className={`${styles.statusPill} ${status === 'favorite' ? styles.statusFavorite : styles.statusInterested}`}>
                  {status === 'favorite' ? '⭐ Favorited' : '👀 Interested'}
                </div>
              )}
              
              {/* Fighter Header */}
              <div className={styles.fighterHeader}>
                {(fighter.image_url || fighter.image_local_path) && (
                  <img
                    src={fighter.image_url || fighter.image_local_path}
                    alt={fighter.name}
                    className={styles.fighterImage}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
                
                <div className={styles.fighterInfo}>
                  <h2 className={styles.fighterName}>
                    {fighter.profile_url_ufc ? (
                      <a href={fighter.profile_url_ufc} target="_blank" rel="noreferrer">
                        {capitalize(fighterName)}
                      </a>
                    ) : (
                      capitalize(fighterName)
                    )}
                  </h2>

                  {showNickname && (
                    <div className={styles.fighterNickname}>
                      "{fighter.nickname}"
                    </div>
                  )}

                  <div className={styles.fighterMeta}>
                    {fighter.country && (
                      <span style={{ fontSize: "1.3rem" }}>
                        {countryCodes[fighter.country?.trim()]}
                      </span>
                    )}
                    {fighter.age && (
                      <span className={styles.metaText}>Age: {fighter.age}</span>
                    )}
                  </div>

                  <div className={styles.fighterStats}>
                    {fighter.weight_class && (
                      <span className={styles.weightClass}>
                        <span 
                          className={styles.divisionDot}
                          style={{ background: divisionColor }}
                        />
                        {fighter.weight_class}
                      </span>
                    )}
                    <span className={styles.record}>
                      {fighter.wins_total}-{fighter.losses_total}
                      {fighter.draws_total && parseInt(fighter.draws_total) > 0 ? `-${fighter.draws_total}` : ''}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Rankings */}
              {rankings && rankings.divisionRank && (
                <div className={styles.rankingInfo}>
                  <span className={styles.rankBadge}>
                    <span 
                      className={styles.divisionDot}
                      style={{ background: divisionColor }}
                    />
                    {rankings.divisionRank.rank === 'C' ? 'Champion' : `#${rankings.divisionRank.rank}`} {rankings.divisionRank.division}
                  </span>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className={styles.actionButtons}>
                <button
                  className={`${styles.actionBtn} ${styles.favoriteBtn}${status === "favorite" ? " " + styles.selected : ""}`}
                  onClick={() =>
                    status === "favorite"
                      ? updateStatus(fighter, "none")
                      : updateStatus(fighter, "favorite")
                  }
                  disabled={favoriteLoading}
                >
                  {favoriteLoading ? (
                    <LoadingSpinner size="small" styles={styles} />
                  ) : status === "favorite" ? (
                    "👑 Favorited"
                  ) : (
                    "⭐ Favorite"
                  )}
                </button>
                
                <button
                  className={`${styles.actionBtn} ${styles.interestedBtn}${status === "interested" ? " " + styles.selected : ""}`}
                  onClick={() =>
                    status === "interested"
                      ? updateStatus(fighter, "none")
                      : updateStatus(fighter, "interested")
                  }
                  disabled={status === "favorite" || interestedLoading}
                  title={status === "favorite" ? "Already in favorites" : ""}
                >
                  {interestedLoading ? (
                    <LoadingSpinner size="small" styles={styles} />
                  ) : status === "interested" ? (
                    "👀 Interested"
                  ) : (
                    "☆ Interested"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
          styles={styles}
        />
      )}
    </div>
  );
};

export default SearchFighter;