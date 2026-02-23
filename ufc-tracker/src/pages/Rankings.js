import React, { useState, useEffect } from 'react';
import { Crown, TrendingUp, Calendar, Sun, Moon, Filter, Search, X } from 'lucide-react';
import supabase from '../api/supabaseClient';
import countryCodes from '../utils/countryCodes';
import { parseRankChange, DIVISIONS, P4P_DIVISIONS } from '../utils/rankingsHelpers';
import { RankChangeIcon, FightModal } from '../components/RankingsComponents';
import { formatDate } from '../utils/eventHelpers';
import styles from '../styles/Rankings.module.css';

const Rankings = () => {
  const [selectedDivision, setSelectedDivision] = useState("Men's Pound-for-Pound");
  const [showMoversOnly, setShowMoversOnly] = useState(false);
  const [rankedFighters, setRankedFighters] = useState([]);
  const [upcomingFights, setUpcomingFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showChampionsOnly, setShowChampionsOnly] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFight, setSelectedFight] = useState(null);
  const [divisionScrollIndex, setDivisionScrollIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const divisions = DIVISIONS;
  const p4pDivisions = P4P_DIVISIONS;

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [rankingsData, upcomingFightsData] = await Promise.all([
        fetchRankingsWithFighters(),
        fetchUpcomingFights()
      ]);

      setRankedFighters(rankingsData);
      setUpcomingFights(upcomingFightsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRankingsWithFighters = async () => {
    const { data: rankings, error: rankingsError } = await supabase
      .from('rankings')
      .select('*')
      .not('rank', 'eq', 'NR')
      .order('division')
      .order('rank');

    if (rankingsError) throw rankingsError;

    const fighterIds = [...new Set(rankings.map(r => r.uuid).filter(Boolean))];

    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select('id, name, nickname, country, wins_total, losses_total, image_url, sig_strikes_landed_per_min, sig_str_defense, takedown_avg_per_15min')
      .in('id', fighterIds);

    if (fightersError) throw fightersError;

    const fightersMap = {};
    fighters?.forEach(fighter => {
      fightersMap[fighter.id] = fighter;
    });

    const result = rankings.map(ranking => {
      const fighter = fightersMap[ranking.uuid] || {};
      return {
        ...fighter,
        division: ranking.division,
        rank: ranking.rank,
        change: ranking.change,
        country_code: fighter.country
      };
    });

    return result;
  };

  const fetchUpcomingFights = async () => {
    const { data, error } = await supabase
      .from('upcoming_fights')
      .select('*')
      .order('event_date');

    if (error) throw error;
    return data;
  };

  const getFilteredAndSortedFighters = () => {
    let filtered = rankedFighters;

    if (!showMoversOnly) {
      filtered = filtered.filter(fighter => fighter.division === selectedDivision);
    } else {
      filtered = rankedFighters;
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter(fighter => 
        fighter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.country?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (showChampionsOnly) {
      filtered = rankedFighters.filter(fighter => fighter.rank === 'C');
    }

    if (showMoversOnly) {
      filtered = rankedFighters.filter(fighter => {
        const parsedChange = parseRankChange(fighter.change);
        return parsedChange !== null && parsedChange !== 0;
      });
    }

    filtered = filtered.map(fighter => {
      const upcomingFight = upcomingFights.find(
        fight => fight.fighter1_id === fighter.id || fight.fighter2_id === fighter.id
      );
      
      return {
        ...fighter,
        parsedChange: parseRankChange(fighter.change),
        upcomingFight,
        hasUpcomingFight: !!upcomingFight
      };
    });

    if (showMoversOnly) {
      filtered.sort((a, b) => {
        const aChange = Math.abs(a.parsedChange || 0);
        const bChange = Math.abs(b.parsedChange || 0);
        if (aChange !== bChange) return bChange - aChange;
        
        const aDivIndex = [...divisions, ...p4pDivisions].indexOf(a.division);
        const bDivIndex = [...divisions, ...p4pDivisions].indexOf(b.division);
        if (aDivIndex !== bDivIndex) return aDivIndex - bDivIndex;
        
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank || 999) - parseInt(b.rank || 999);
      });
    } else if (showChampionsOnly) {
      filtered.sort((a, b) => {
        const aDivIndex = [...divisions, ...p4pDivisions].indexOf(a.division);
        const bDivIndex = [...divisions, ...p4pDivisions].indexOf(b.division);
        return aDivIndex - bDivIndex;
      });
    } else {
      filtered.sort((a, b) => {
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank || 999) - parseInt(b.rank || 999);
      });
    }

    return filtered;
  };

  const getCountryFlag = (country) => {
    return countryCodes[country] || '🏴';
  };

  const navigateDivision = (direction) => {
    if (showMoversOnly) return;
    
    const totalDivisions = divisions.length;
    if (direction === 'next') {
      setDivisionScrollIndex((prev) => (prev + 1) % totalDivisions);
      setSelectedDivision(divisions[(divisionScrollIndex + 1) % totalDivisions]);
    } else {
      setDivisionScrollIndex((prev) => (prev - 1 + totalDivisions) % totalDivisions);
      setSelectedDivision(divisions[(divisionScrollIndex - 1 + totalDivisions) % totalDivisions]);
    }
  };

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      navigateDivision('next');
    }
    if (isRightSwipe) {
      navigateDivision('prev');
    }
  };

  const filteredFighters = getFilteredAndSortedFighters();

  if (loading) {
    return (
      <div className={`${styles.rankingsContainer} ${darkMode ? styles.dark : styles.light}`}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading rankings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.rankingsContainer} ${darkMode ? styles.dark : styles.light}`}>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3>Error Loading Rankings</h3>
          <p className={styles.errorMessage}>{error}</p>
          <button onClick={fetchData} className={styles.retryBtn}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.rankingsContainer} ${darkMode ? styles.dark : styles.light}`}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <div className={styles.titleSection}>
            <h1>🏆 UFC Rankings</h1>
            <p>Official UFC fighter rankings updated weekly</p>
          </div>
          
          <div className={styles.headerControls}>
            <button 
              className={styles.themeToggle}
              onClick={() => setDarkMode(!darkMode)}
              title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <button 
              className={`${styles.filterToggle} ${styles.mobileOnly}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={20} />
              <span>Filters</span>
            </button>
          </div>
        </div>
      </header>

      <div className={`${styles.controlsSection} ${showFilters ? styles.mobileVisible : ''}`}>
        <div className={styles.searchSection}>
          <div className={styles.searchBar}>
            <Search size={18} />
            <input
              type="text"
              placeholder="Search fighters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button 
                className={styles.clearSearch}
                onClick={() => setSearchQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.filterControls}>
          <div className={styles.divisionSelector}>
            <div className={styles.controlGroup}>
              <label>Division</label>
              <select 
                value={selectedDivision} 
                onChange={(e) => {
                  setSelectedDivision(e.target.value);
                  const index = divisions.indexOf(e.target.value);
                  if (index !== -1) setDivisionScrollIndex(index);
                }}
                disabled={showMoversOnly}
              >
                {[...divisions, ...p4pDivisions].map(division => (
                  <option key={division} value={division}>{division}</option>
                ))}
              </select>
            </div>

            {!showMoversOnly && (
              <div className={styles.divisionNav}>
                <button 
                  className={styles.navButton}
                  onClick={() => navigateDivision('prev')}
                  disabled={showMoversOnly}
                >
                  ←
                </button>
                <span className={styles.currentDivision}>
                  {divisionScrollIndex + 1} / {divisions.length}
                </span>
                <button 
                  className={styles.navButton}
                  onClick={() => navigateDivision('next')}
                  disabled={showMoversOnly}
                >
                  →
                </button>
              </div>
            )}
          </div>

          <div className={styles.filterToggles}>
            <button
              className={`${styles.filterToggleButton} ${showChampionsOnly ? styles.active : ''}`}
              onClick={() => {
                setShowChampionsOnly(!showChampionsOnly);
                setShowMoversOnly(false);
                if (!showChampionsOnly) {
                  setSelectedDivision(divisions[0]);
                }
              }}
            >
              <Crown size={16} />
              <span>Champions</span>
            </button>
            
            <button
              className={`${styles.filterToggleButton} ${showMoversOnly ? styles.active : ''}`}
              onClick={() => {
                setShowMoversOnly(!showMoversOnly);
                setShowChampionsOnly(false);
                if (!showMoversOnly) {
                  setSelectedDivision(divisions[0]);
                }
              }}
            >
              <TrendingUp size={16} />
              <span>Movers</span>
            </button>
            
            <button
              className={`${styles.filterToggleButton} ${selectedDivision === "Men's Pound-for-Pound" ? styles.active : ''}`}
              onClick={() => {
                setSelectedDivision("Men's Pound-for-Pound");
                setShowMoversOnly(false);
                setShowChampionsOnly(false);
              }}
            >
              <span>Men's P4P</span>
            </button>
            
            <button
              className={`${styles.filterToggleButton} ${selectedDivision === "Women's Pound-for-Pound" ? styles.active : ''}`}
              onClick={() => {
                setSelectedDivision("Women's Pound-for-Pound");
                setShowMoversOnly(false);
                setShowChampionsOnly(false);
              }}
            >
              <span>Women's P4P</span>
            </button>
          </div>
        </div>

        {searchQuery && (
          <div className={styles.searchIndicator}>
            <Search size={16} />
            <span>"{searchQuery}"</span>
          </div>
        )}
      </div>

      <div 
        className={styles.mainContent}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {filteredFighters.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🥊</div>
            <h3>No fighters found</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className={styles.fighterList}>
            {filteredFighters.map((fighter) => (
              <div 
                key={`${fighter.id}-${fighter.division}`} 
                className={`${styles.fighterCard} ${fighter.rank === 'C' ? styles.champion : ''}`}
              >
                {fighter.rank === 'C' && (
                  <div className={styles.championBadge}>
                    <Crown size={14} />
                    <span>CHAMPION</span>
                  </div>
                )}
                
                <div className={styles.rankNumber}>
                  {fighter.rank === 'C' ? 'C' : `#${fighter.rank}`}
                </div>

                {fighter.image_url && (
                  <img
                    src={fighter.image_url}
                    alt={fighter.name}
                    className={styles.fighterImage}
                    onError={(e) => {
                      e.target.src = `https://via.placeholder.com/80x80/333/white?text=${fighter.name?.charAt(0) || '?'}`;
                    }}
                  />
                )}

                <div className={styles.fighterInfo}>
                  <div className={styles.fighterDetails}>
                    <h3 className={styles.fighterName}>{fighter.name}</h3>
                    {fighter.nickname && (
                      <p className={styles.fighterNickname}>"{fighter.nickname}"</p>
                    )}
                    
                    <div className={styles.fighterStats}>
                      <span>{getCountryFlag(fighter.country)} {fighter.country}</span>
                      <span>•</span>
                      <span>{fighter.wins_total}-{fighter.losses_total}</span>
                      {(showMoversOnly || showChampionsOnly) && (
                        <>
                          <span>•</span>
                          <span>{fighter.division}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {fighter.parsedChange !== null && fighter.parsedChange !== 0 && (
                  <div className={styles.rankChange}>
                    <RankChangeIcon change={fighter.parsedChange} />
                  </div>
                )}

                {fighter.upcomingFight && (
                  <button 
                    className={styles.upcomingFightBadge}
                    onClick={() => setSelectedFight(fighter.upcomingFight)}
                  >
                    <Calendar size={14} />
                    <span>{formatDate(fighter.upcomingFight.event_date)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedFight && (
        <FightModal 
          fight={selectedFight} 
          onClose={() => setSelectedFight(null)} 
        />
      )}
    </div>
  );
};

export default Rankings;