import React, { useState, useEffect, useCallback } from "react";
import { addToFavorites, removeFavorite, getUserFavorites } from "../api/fighters";
import supabase from "../api/supabaseClient";
import countryCodes from '../utils/countryCodes';
import { capitalize, getRankingDisplayForSearch } from '../utils/fighterHelpers';
import { inferGender, extractFilterOptions, hasActiveFilters as checkActiveFilters } from '../utils/filterHelpers';
import { MultiSelectDropdown, Toast, LoadingSpinner } from '../components/SearchFighterComponents';
import styles from '../styles/SearchFighter.module.css';

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

  const hasActiveFiltersLocal = () => {
    return checkActiveFilters({
      selectedGender,
      selectedCountries,
      selectedDivisions,
      showRankedOnly,
      showP4POnly,
      showFavoritesOnly,
      showInterestedOnly,
      sortBy,
      query
    });
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
    <div className={styles.searchContainer}>
      <div className={styles.header}>
        <div className={styles.headerBackground}></div>
        <div className={styles.headerContent}>
          <h1>🥊 Fighter Search</h1>
          <p>Discover and track your favorite UFC fighters</p>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchSection}>
          <div className={styles.searchInputContainer}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search fighters by name or nickname..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>
          
          <div className={styles.filterHeader}>
            <button 
              className={styles.mobileFilterToggle}
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            >
              <span>Filters</span>
              <span className={`${styles.toggleIcon} ${filtersCollapsed ? styles.collapsed : ''}`}>▼</span>
            </button>
            
            {hasActiveFiltersLocal() && (
              <button className={styles.clearFiltersBtn} onClick={clearAllFilters}>
                Clear All
              </button>
            )}
          </div>

          <div className={`${styles.filterControls} ${filtersCollapsed ? styles.collapsed : ''}`}>
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

            <div className={styles.genderSelector}>
              <div 
                className={styles.genderDropdownTrigger} 
                onClick={() => setGenderDropdownOpen(!genderDropdownOpen)}
              >
                <span>
                  {selectedGender === 'All' ? '👥 All Fighters' : 
                   selectedGender === 'Men' ? 'Men\'s Divisions' : 
                   'Women\'s Divisions'}
                </span>
                <span className={styles.dropdownArrow}>{genderDropdownOpen ? '▲' : '▼'}</span>
              </div>
              
              {genderDropdownOpen && (
                <div className={styles.genderDropdown}>
                  {[
                    { value: 'All', label: '👥 All Fighters' },
                    { value: 'Men', label: 'Men\'s Divisions' },
                    { value: 'Women', label: 'Women\'s Divisions' }
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
            
            <MultiSelectDropdown
              options={availableCountries}
              selectedValues={selectedCountries}
              onChange={setSelectedCountries}
              placeholder="All Countries"
              searchable={true}
              styles={styles}
            />
            
            <MultiSelectDropdown
              options={availableDivisions}
              selectedValues={selectedDivisions}
              onChange={setSelectedDivisions}
              placeholder="All Divisions"
              styles={styles}
            />
            
            <label 
              className={`${styles.checkboxFilter} ${showRankedOnly ? styles.active : ''}`}
            >
              <input
                type="checkbox"
                checked={showRankedOnly}
                onChange={(e) => setShowRankedOnly(e.target.checked)}
              />
              Ranked Only
            </label>
            
            <label 
              className={`${styles.checkboxFilter} ${showP4POnly ? styles.active : ''}`}
            >
              <input
                type="checkbox"
                checked={showP4POnly}
                onChange={(e) => setShowP4POnly(e.target.checked)}
              />
              P4P Only
            </label>

            <label 
              className={`${styles.checkboxFilter} ${showFavoritesOnly ? styles.active : ''}`}
            >
              <input
                type="checkbox"
                checked={showFavoritesOnly}
                onChange={(e) => setShowFavoritesOnly(e.target.checked)}
              />
              ⭐ Favorites
            </label>

            <label 
              className={`${styles.checkboxFilter} ${showInterestedOnly ? styles.active : ''}`}
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
          {hasActiveFiltersLocal() && (
            <div className={styles.filterSummary}>
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

      <div className={styles.resultsGrid}>
        {filteredFighters.map((fighter) => {
          const fighterName = fighter.name;
          const status = favStatus[fighterName]?.status;
          const favoriteLoading = loadingStates[`${fighterName}-favorite`];
          const interestedLoading = loadingStates[`${fighterName}-interested`];
          const rankings = getRankingDisplayForSearch(fighter.rankings);
          const statusLabel =
            status === "favorite" ? "⭐ Favorited" :
            status === "interested" ? "👀 Interested" :
            "—";
          const isP4PChampion = rankings?.p4p && rankings.p4p.rank !== 'NR';
          
          return (
            <div 
              key={fighter.id} 
              className={`${styles.fighterCard}${isP4PChampion ? ` ${styles.p4pChampion}` : ''}${
                status === 'favorite' ? ` ${styles.favoritedCard}` : 
                status === 'interested' ? ` ${styles.interestedCard}` : ''
              }`}
            >
              {rankings?.p4p && (
                <div className={styles.p4pBadge}>
                  P4P #{rankings.p4p.rank}
                </div>
              )}

              <div className={styles.statusBadge}>
                {statusLabel}
              </div>
              
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
                  {fighter.nickname && (
                    <div className={styles.fighterNickname}>
                      "{fighter.nickname}"
                    </div>
                  )}                 
                  <div className={styles.fighterDetails}>
                    {fighter.country && (
                      <div className={styles.detailItem}>
                        <span style={{ fontSize: "1.5rem" }}>
                          {countryCodes[fighter.country?.trim()]}
                        </span>
                      </div>
                    )}
                    
                    <div className={styles.detailItem}>
                      <span>{fighter.age ? `Age: ${fighter.age}` : ''}</span>
                    </div>
                    
                    {fighter.weight_class && (
                      <div className={styles.detailItem}>
                        <span>{fighter.weight_class}</span>
                      </div>
                    )}
                    
                    <div className={`${styles.detailItem} ${styles.record}`}>
                      {fighter.wins_total}-{fighter.losses_total}
                      {fighter.draws_total && parseInt(fighter.draws_total) > 0 && `-${fighter.draws_total}`}
                    </div>
                  </div>
                </div>
              </div>
              
              {rankings && (rankings.divisionRank || rankings.p4p) && (
                <div className={styles.rankingInfo}>
                  {rankings.divisionRank && (
                    <span className={`${styles.rankBadge} ${styles.rankDivision}`}>
                      {rankings.divisionRank.rank === 'C' ? 'Champion' : `#${rankings.divisionRank.rank}`} {rankings.divisionRank.division}
                    </span>
                  )}
                  {rankings.p4p && (
                    <span className={`${styles.rankBadge} ${styles.rankP4p}`}>
                      P4P #{rankings.p4p.rank}
                    </span>
                  )}
                </div>
              )}
              
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