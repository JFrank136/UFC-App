import React, { useState, useEffect } from 'react';
import { Crown, TrendingUp, TrendingDown, Calendar, MapPin, ArrowUp, ArrowDown, Minus, Sun, Moon, Filter, Search, X, Users, Zap, Shield, BarChart3 } from 'lucide-react';
import supabase from '../api/supabaseClient';
import countryCodes from '../utils/countryCodes';

const Rankings = () => {
  const [selectedDivision, setSelectedDivision] = useState("Men's Pound-for-Pound");
  const [showMoversOnly, setShowMoversOnly] = useState(false);
  const [rankedFighters, setRankedFighters] = useState([]);
  const [upcomingFights, setUpcomingFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showChampionsOnly, setShowChampionsOnly] = useState(false);
  const [sortBy, setSortBy] = useState('rank');
const [darkMode, setDarkMode] = useState(true);
const [showFilters, setShowFilters] = useState(false);
const [selectedFight, setSelectedFight] = useState(null);
const [divisionScrollIndex, setDivisionScrollIndex] = useState(0);
const [touchStart, setTouchStart] = useState(null);
const [touchEnd, setTouchEnd] = useState(null);

  const divisions = [
    'Flyweight',
    'Bantamweight', 
    'Featherweight',
    'Lightweight',
    'Welterweight',
    'Middleweight',
    'Light Heavyweight',
    'Heavyweight',
    "Women's Strawweight",
    "Women's Flyweight",
    "Women's Bantamweight",
    "Women's Featherweight"
  ];

  const p4pDivisions = [
    "Men's Pound-for-Pound",
    "Women's Pound-for-Pound"
  ];

  useEffect(() => {
    fetchData();
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
    // First, get all rankings
    const { data: rankings, error: rankingsError } = await supabase
      .from('rankings')
      .select('*')
      .not('rank', 'eq', 'NR')
      .order('division')
      .order('rank');

    if (rankingsError) throw rankingsError;

    console.log('Rankings data:', rankings);
    console.log('Number of rankings:', rankings?.length);

    // Get all unique fighter IDs
    const fighterIds = [...new Set(rankings.map(r => r.uuid).filter(Boolean))];
    console.log('Fighter IDs:', fighterIds);

    // Then get all fighters for those IDs
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select('id, name, nickname, country, wins_total, losses_total, image_url')
      .in('id', fighterIds);

    if (fightersError) throw fightersError;

    console.log('Fighters data:', fighters);
    console.log('Number of fighters:', fighters?.length);

    // Create a map for quick lookups
    const fightersMap = {};
    fighters?.forEach(fighter => {
      fightersMap[fighter.id] = fighter;
    });

    console.log('Fighters map keys (first 5):', Object.keys(fightersMap).slice(0, 5));
    console.log('Sample fighter from map:', fightersMap[Object.keys(fightersMap)[0]]);

    // Combine the data
    const result = rankings.map((ranking, index) => {
      const fighter = fightersMap[ranking.uuid] || {};
      
      if (index < 3) { // Log first 3 for debugging
        console.log(`Ranking ${index}:`, {
          rankingUuid: ranking.uuid,
          fighterFound: !!fighter.id,
          fighter: fighter,
          ranking: ranking
        });
      }
      
      return {
        ...fighter,
        division: ranking.division,
        rank: ranking.rank,
        change: ranking.change,
        country_code: fighter.country
      };
    });

    console.log('Final result:', result);
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

  const parseRankChange = (changeText) => {
    if (!changeText) return null;
    
    // Handle special cases
    if (changeText.toLowerCase().includes('new') || changeText.toLowerCase().includes('debut')) {
      return 'NEW';
    }
    if (changeText.toLowerCase().includes('return')) {
      return 'RET';
    }
    if (changeText.toLowerCase().includes('interim')) {
      return 'INTERIM';
    }
    
    // Extract numeric changes - updated patterns for your data
    const increaseMatch = changeText.match(/increased by (\d+)/i);
    if (increaseMatch) {
      return parseInt(increaseMatch[1]);
    }
    
    const decreaseMatch = changeText.match(/decreased by (\d+)/i);
    if (decreaseMatch) {
      return -parseInt(decreaseMatch[1]);
    }
    
    // Handle "RANK INCREASED BY X" format from your schema
    const rankIncreaseMatch = changeText.match(/rank increased by (\d+)/i);
    if (rankIncreaseMatch) {
      return parseInt(rankIncreaseMatch[1]);
    }
    
    const rankDecreaseMatch = changeText.match(/rank decreased by (\d+)/i);
    if (rankDecreaseMatch) {
      return -parseInt(rankDecreaseMatch[1]);
    }
    
    // Look for +/- patterns
    const plusMatch = changeText.match(/\+(\d+)/);
    if (plusMatch) {
      return parseInt(plusMatch[1]);
    }
    
    const minusMatch = changeText.match(/-(\d+)/);
    if (minusMatch) {
      return -parseInt(minusMatch[1]);
    }
    
    return 0;
  };

  const getFilteredAndSortedFighters = () => {
    let filtered = rankedFighters;

    // Division filter
    if (!showMoversOnly) {
      filtered = filtered.filter(fighter => fighter.division === selectedDivision);
    } else {
      // For movers only, include all divisions
      filtered = rankedFighters;
    }

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(fighter => 
        fighter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.country?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Champions only filter - show champions across all divisions
    if (showChampionsOnly) {
      filtered = rankedFighters.filter(fighter => fighter.rank === 'C');
    }

    // Movers only filter
    if (showMoversOnly) {
      filtered = rankedFighters.filter(fighter => {
        const parsedChange = parseRankChange(fighter.change);
        return parsedChange !== null && parsedChange !== 0;
      });
    }

    // Add upcoming fight data and parsed change
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

    // Sort fighters based on current view
    if (showMoversOnly) {
      // Sort movers by magnitude of change, then by division
      filtered.sort((a, b) => {
        const aChange = Math.abs(a.parsedChange || 0);
        const bChange = Math.abs(b.parsedChange || 0);
        if (aChange !== bChange) return bChange - aChange;
        
        // Secondary sort by division order
        const aDivIndex = [...divisions, ...p4pDivisions].indexOf(a.division);
        const bDivIndex = [...divisions, ...p4pDivisions].indexOf(b.division);
        if (aDivIndex !== bDivIndex) return aDivIndex - bDivIndex;
        
        // Tertiary sort by rank
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank || 999) - parseInt(b.rank || 999);
      });
    } else if (showChampionsOnly) {
      // Sort champions by division order
      filtered.sort((a, b) => {
        const aDivIndex = [...divisions, ...p4pDivisions].indexOf(a.division);
        const bDivIndex = [...divisions, ...p4pDivisions].indexOf(b.division);
        return aDivIndex - bDivIndex;
      });
    } else {
      // Default rank sorting
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

  const getRankChangeIcon = (change) => {
    if (!change || change === 0) return <Minus className="w-4 h-4 text-gray-400" />;
    if (change === 'NEW') return <span className="text-green-600 font-semibold text-sm">NEW</span>;
    if (change === 'RET') return <span className="text-blue-600 font-semibold text-sm">RET</span>;
    if (change === 'INTERIM') return <span className="text-purple-600 font-semibold text-sm">INT</span>;
    if (change > 0) return (
      <div className="flex items-center text-green-600">
        <ArrowUp className="w-4 h-4" />
        <span className="text-sm font-semibold">{change}</span>
      </div>
    );
    return (
      <div className="flex items-center text-red-600">
        <ArrowDown className="w-4 h-4" />
        <span className="text-sm font-semibold">{Math.abs(change)}</span>
      </div>
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
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

const formatStat = (value, decimals = 1) => {
    if (!value) return 'N/A';
    if (typeof value === 'string' && value.includes('(')) return value;
    const num = parseFloat(value);
    if (!isNaN(num)) return num.toFixed(decimals);
    return value.toString();
  };

  const filteredFighters = getFilteredAndSortedFighters();

  const FightModal = ({ fight, onClose }) => {
    if (!fight) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Fight Details</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <span className="font-medium text-gray-900">Event:</span>
              <span className="ml-2 text-gray-700">{fight.event}</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">Date:</span>
              <span className="ml-2 text-gray-700">{formatDate(fight.event_date)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">Fighters:</span>
              <span className="ml-2 text-gray-700">{fight.fighter1} vs {fight.fighter2}</span>
            </div>
            {fight.weight_class && (
              <div>
                <span className="font-medium text-gray-900">Weight Class:</span>
                <span className="ml-2 text-gray-700">{fight.weight_class}</span>
              </div>
            )}
            {fight.location && (
              <div>
                <span className="font-medium text-gray-900">Location:</span>
                <span className="ml-2 text-gray-700">{fight.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`rankings-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading rankings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rankings-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Error Loading Rankings</h3>
          <p>{error}</p>
          <button onClick={fetchData} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rankings-container ${darkMode ? 'dark' : 'light'}`}>
      {/* Enhanced Header */}
      <header className="page-header">
        <div className="header-content">
          <div className="title-section">
            <h1>🏆 UFC Rankings</h1>
            <p>Official UFC fighter rankings updated weekly</p>
          </div>
          
          <div className="header-controls">
            <button 
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <button 
              className="filter-toggle mobile-only"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={20} />
              <span>Filters</span>
            </button>
          </div>
        </div>
      </header>

      {/* Enhanced Controls */}
      <div className={`controls-section ${showFilters ? 'mobile-visible' : ''}`}>
        {/* Search Bar */}
        <div className="search-section">
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search fighters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="filter-controls">
          {/* Division Selector */}
          <div className="division-selector">
            <div className="control-group">
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
              <div className="division-navigation">
                <button 
                  className="nav-btn prev"
                  onClick={() => navigateDivision('prev')}
                  disabled={showMoversOnly}
                >
                  ←
                </button>
                <span className="division-indicator">
                  {divisionScrollIndex + 1} / {divisions.length}
                </span>
                <button 
                  className="nav-btn next"
                  onClick={() => navigateDivision('next')}
                  disabled={showMoversOnly}
                >
                  →
                </button>
              </div>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="filter-buttons">
            <button
              className={`filter-btn ${showChampionsOnly ? 'active' : ''}`}
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
              className={`filter-btn ${showMoversOnly ? 'active' : ''}`}
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
              className={`filter-btn ${selectedDivision === "Men's Pound-for-Pound" ? 'active' : ''}`}
              onClick={() => {
                setSelectedDivision("Men's Pound-for-Pound");
                setShowMoversOnly(false);
                setShowChampionsOnly(false);
              }}
            >
              <span>Men's P4P</span>
            </button>
            
            <button
              className={`filter-btn ${selectedDivision === "Women's Pound-for-Pound" ? 'active' : ''}`}
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

        {/* Search indicator only */}
        {searchQuery && (
          <div className="search-indicator">
            <Search size={16} />
            <span>"{searchQuery}"</span>
          </div>
        )}
      </div>

      {/* Enhanced Fighters List */}
      <div 
        className="fighters-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {filteredFighters.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🥊</div>
            <h3>No fighters found</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <>
            {/* Grid Layout */}
            <div className="fighters-grid">
              {filteredFighters.map((fighter, index) => (
                <div key={`${fighter.id}-${fighter.division}`} className={`fighter-card ${fighter.rank === 'C' ? 'champion-card' : ''}`}>
                  {fighter.rank === 'C' && (
                    <div className="champion-banner">
                      <Crown size={16} />
                      <span>CHAMPION</span>
                    </div>
                  )}
                  
                  <div className="fighter-image-container">
                    <img
                      src={fighter.image_url}
                      alt={fighter.name}
                      onError={(e) => {
                        e.target.src = `https://via.placeholder.com/120x120/333/white?text=${fighter.name?.charAt(0) || '?'}`;
                      }}
                    />
                    {fighter.hasUpcomingFight && (
                      <div className="fight-indicator">
                        <span>NEXT FIGHT</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="fighter-info">
                    <div className="rank-section">
                      <span className="rank-number">
                        {fighter.rank === 'C' ? 'C' : `#${fighter.rank}`}
                      </span>
                      {(showMoversOnly || showChampionsOnly) && (
                        <span className="division-badge">{fighter.division}</span>
                      )}
                    </div>
                    
                    <h3 className="fighter-name">{fighter.name}</h3>
                    {fighter.nickname && (
                      <p className="fighter-nickname">"{fighter.nickname}"</p>
                    )}
                    
                    <div className="fighter-meta">
                      <div className="record">{fighter.wins_total}-{fighter.losses_total}</div>
                      <div className="country">
                        <span className="flag">{getCountryFlag(fighter.country)}</span>
                        <span className="country-name">{fighter.country}</span>
                      </div>
                    </div>
                    
                    {fighter.parsedChange !== null && fighter.parsedChange !== 0 && (
                      <div className="rank-change">
                        {getRankChangeIcon(fighter.parsedChange)}
                      </div>
                    )}
                    
                    {fighter.upcomingFight && (
                      <button 
                        className="upcoming-fight"
                        onClick={() => setSelectedFight(fighter.upcomingFight)}
                      >
                        <Calendar size={14} />
                        <span>{formatDate(fighter.upcomingFight.event_date)}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile Cards */}
            <div className="mobile-cards">
              {filteredFighters.map((fighter, index) => (
                <div key={`${fighter.id}-${fighter.division}`} className="fighter-card">
                  <div className="card-header">
                    <div className="rank-section">
                      {fighter.rank === 'C' ? (
                        <div className="champion-rank">
                          <Crown className="w-5 h-5 text-yellow-500" />
                          <span className="champion-text">C</span>
                        </div>
                      ) : (
                        <span className="rank-number">#{fighter.rank}</span>
                      )}
                      {showMoversOnly && (
                        <span className="division-badge mobile">{fighter.division}</span>
                      )}
                    </div>
                    
                    <div className="change-section">
                      {getRankChangeIcon(fighter.parsedChange)}
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="fighter-main-info">
                      <div className="fighter-image-container">
                        <img
                          src={fighter.image_url}
                          alt={fighter.name}
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/60x60/gray/white?text=' + fighter.name?.charAt(0);
                          }}
                        />
                        {fighter.hasUpcomingFight && (
                          <div className="fight-indicator mobile">🥊</div>
                        )}
                      </div>
                      
                      <div className="fighter-info">
                        <h3 className="fighter-name">{fighter.name}</h3>
                        {fighter.nickname && (
                          <p className="fighter-nickname">"{fighter.nickname}"</p>
                        )}
                        
                        <div className="fighter-meta">
                          <div className="country-info">
                            <span className="text-lg">{getCountryFlag(fighter.country)}</span>
                            <span>{fighter.country}</span>
                          </div>
                          <span className="record">{fighter.wins_total}-{fighter.losses_total}</span>
                        </div>
                      </div>
                    </div>

                    <div className="card-stats">
                      <div className="stat-item">
                        <Zap size={14} />
                        <span>Strikes: {formatStat(fighter.sig_strikes_landed_per_min)}/min</span>
                      </div>
                      <div className="stat-item">
                        <Shield size={14} />
                        <span>Defense: {formatStat(fighter.sig_str_defense)}</span>
                      </div>
                      <div className="stat-item">
                        <BarChart3 size={14} />
                        <span>Takedowns: {formatStat(fighter.takedown_avg_per_15min)}/15min</span>
                      </div>
                    </div>

                    {fighter.upcomingFight && (
                      <button 
                        className="upcoming-fight clickable"
                        onClick={() => setSelectedFight(fighter.upcomingFight)}
                      >
                        <div className="fight-header">
                          <Calendar size={14} />
                          <span>Next Fight</span>
                        </div>
                        <div className="fight-details">
                          <div className="fight-event">{fighter.upcomingFight.event}</div>
                          <div className="fight-date">{formatDate(fighter.upcomingFight.event_date)}</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedFight && (
        <FightModal 
          fight={selectedFight} 
          onClose={() => setSelectedFight(null)} 
        />
      )}

      <style jsx>{`
        .rankings-container {
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: all 0.3s ease;
        }

        .rankings-container.dark {
          background: linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #2d2d2d 100%);
          color: #fff;
        }

        .rankings-container.light {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
          color: #1e293b;
        }

        /* Header */
        .page-header {
          padding: 2rem;
          border-bottom: 1px solid var(--border-color);
          backdrop-filter: blur(10px);
        }

        .dark .page-header {
          --border-color: rgba(220, 38, 38, 0.3);
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(26, 26, 26, 0.9) 100%);
        }

        .light .page-header {
          --border-color: rgba(0, 0, 0, 0.1);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%);
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1400px;
          margin: 0 auto;
        }

        .title-section h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .title-section p {
          font-size: 1.1rem;
          margin: 0;
          opacity: 0.7;
        }

        .header-controls {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .theme-toggle, .filter-toggle {
          background: var(--btn-bg);
          border: 1px solid var(--btn-border);
          border-radius: 12px;
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--btn-color);
        }

        .dark .theme-toggle, .dark .filter-toggle {
          --btn-bg: rgba(251, 191, 36, 0.1);
          --btn-border: rgba(251, 191, 36, 0.3);
          --btn-color: #dc2626;
        }

        .light .theme-toggle, .light .filter-toggle {
          --btn-bg: rgba(251, 191, 36, 0.1);
          --btn-border: rgba(251, 191, 36, 0.3);
          --btn-color: #d97706;
        }

        .theme-toggle:hover, .filter-toggle:hover {
          transform: scale(1.05);
          background: var(--btn-hover);
        }

        .dark .theme-toggle:hover, .dark .filter-toggle:hover {
          --btn-hover: rgba(251, 191, 36, 0.2);
        }

        .light .theme-toggle:hover, .light .filter-toggle:hover {
          --btn-hover: rgba(251, 191, 36, 0.15);
        }

        .mobile-only {
          display: none;
        }

        /* Controls Section */
        .controls-section {
          padding: 1.5rem 2rem;
          background: var(--controls-bg);
          border-bottom: 1px solid var(--border-color);
          max-width: 1400px;
          margin: 0 auto;
        }

        .dark .controls-section {
          --controls-bg: rgba(255, 255, 255, 0.02);
        }

        .light .controls-section {
          --controls-bg: rgba(255, 255, 255, 0.7);
        }

        .search-section {
          margin-bottom: 1.5rem;
        }

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

        .dark .search-bar {
          --search-bg: rgba(255, 255, 255, 0.05);
          --search-border: rgba(255, 255, 255, 0.1);
        }

        .light .search-bar {
          --search-bg: rgba(255, 255, 255, 0.9);
          --search-border: rgba(0, 0, 0, 0.1);
        }

        .search-bar:focus-within {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.1);
        }

        .search-bar svg {
          opacity: 0.5;
          flex-shrink: 0;
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

        .filter-controls {
          display: flex;
          gap: 2rem;
          align-items: end;
          flex-wrap: wrap;
        }

        .division-selector {
          min-width: 200px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .division-navigation {
          display: flex;
          align-items: center;
          gap: 1rem;
          justify-content: center;
        }

        .nav-btn {
          background: var(--nav-btn-bg);
          border: 1px solid var(--nav-btn-border);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          font-weight: bold;
          color: #dc2626;
        }

        .dark .nav-btn {
          --nav-btn-bg: rgba(30, 64, 175, 0.1);
          --nav-btn-border: rgba(30, 64, 175, 0.3);
        }

        .light .nav-btn {
          --nav-btn-bg: rgba(30, 64, 175, 0.05);
          --nav-btn-border: rgba(30, 64, 175, 0.2);
        }

        .nav-btn:hover:not(:disabled) {
          background: var(--nav-btn-hover);
          transform: scale(1.1);
        }

        .dark .nav-btn:hover:not(:disabled) {
          --nav-btn-hover: rgba(30, 64, 175, 0.2);
        }

        .light .nav-btn:hover:not(:disabled) {
          --nav-btn-hover: rgba(30, 64, 175, 0.1);
        }

        .nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .division-indicator {
          font-size: 0.9rem;
          color: #dc2626;
          font-weight: 600;
          min-width: 60px;
          text-align: center;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 150px;
        }

        .control-group label {
          font-size: 0.85rem;
          color: #dc2626;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .control-group select {
          background: var(--select-bg);
          border: 1px solid var(--select-border);
          border-radius: 8px;
          padding: 0.6rem 0.8rem;
          color: inherit;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          outline: none;
        }

        .dark .control-group select {
          --select-bg: rgba(255, 255, 255, 0.05);
          --select-border: rgba(255, 255, 255, 0.1);
        }

        .light .control-group select {
          --select-bg: rgba(255, 255, 255, 0.9);
          --select-border: rgba(0, 0, 0, 0.1);
        }

        .control-group select:hover,
        .control-group select:focus {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.1);
        }

        .dark .control-group select option {
          background: #1e293b;
          color: #fff;
        }

        .light .control-group select option {
          background: #fff;
          color: #1e293b;
        }

        .filter-buttons {
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .filter-btn {
          background: var(--filter-btn-bg);
          border: 1px solid var(--filter-btn-border);
          border-radius: 8px;
          padding: 0.6rem 1rem;
          color: inherit;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 500;
        }

        .dark .filter-btn {
          --filter-btn-bg: rgba(255, 255, 255, 0.05);
          --filter-btn-border: rgba(255, 255, 255, 0.1);
        }

        .light .filter-btn {
          --filter-btn-bg: rgba(255, 255, 255, 0.7);
          --filter-btn-border: rgba(0, 0, 0, 0.1);
        }

        .filter-btn:hover {
          background: var(--filter-btn-hover);
          border-color: #dc2626;
        }

        .dark .filter-btn:hover {
          --filter-btn-hover: rgba(251, 191, 36, 0.1);
        }

        .light .filter-btn:hover {
          --filter-btn-hover: rgba(251, 191, 36, 0.1);
        }

        .filter-btn.active {
          background: var(--filter-btn-active);
          border-color: #dc2626;
          color: #dc2626;
        }

        .dark .filter-btn.active {
          --filter-btn-active: rgba(251, 191, 36, 0.15);
        }

        .light .filter-btn.active {
          --filter-btn-active: rgba(251, 191, 36, 0.1);
        }

        .results-summary {
          margin-top: 1.5rem;
          padding: 1rem;
          background: var(--summary-bg);
          border-radius: 8px;
          border: 1px solid var(--summary-border);
        }

        .dark .results-summary {
          --summary-bg: rgba(251, 191, 36, 0.05);
          --summary-border: rgba(251, 191, 36, 0.1);
        }

        .light .results-summary {
          --summary-bg: rgba(251, 191, 36, 0.03);
          --summary-border: rgba(251, 191, 36, 0.1);
        }

        .summary-stats {
          display: flex;
          gap: 2rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.7;
          font-size: 0.9rem;
        }

        .stat-item svg {
          color: #dc2626;
        }

        .search-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #dc2626;
          opacity: 1;
          font-weight: 500;
          padding: 0.75rem;
          background: var(--search-indicator-bg);
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .dark .search-indicator {
          --search-indicator-bg: rgba(220, 38, 38, 0.1);
        }

        .light .search-indicator {
          --search-indicator-bg: rgba(220, 38, 38, 0.05);
        }

        /* Fighters Container */
        .fighters-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* Fighters Grid */
        .fighters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-top: 2rem;
        }

        .dark .desktop-table {
          --table-bg: rgba(255, 255, 255, 0.02);
          --table-shadow: rgba(0, 0, 0, 0.2);
        }

        .light .desktop-table {
          --table-bg: rgba(255, 255, 255, 0.9);
          --table-shadow: rgba(0, 0, 0, 0.1);
        }

        .fighters-table {
          width: 100%;
          border-collapse: collapse;
        }

        .fighters-table thead {
          background: var(--thead-bg);
        }

        .dark .fighters-table thead {
          --thead-bg: rgba(251, 191, 36, 0.1);
        }

        .light .fighters-table thead {
          --thead-bg: rgba(251, 191, 36, 0.05);
        }

        .fighters-table th {
          padding: 1rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.9rem;
          color: #dc2626;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid rgba(251, 191, 36, 0.2);
        }

        .fighter-row {
          border-bottom: 1px solid var(--row-border);
          transition: all 0.3s ease;
        }

        .dark .fighter-row {
          --row-border: rgba(255, 255, 255, 0.05);
        }

        .light .fighter-row {
          --row-border: rgba(0, 0, 0, 0.05);
        }

        .fighter-row:hover {
          background: var(--row-hover);
        }

        .dark .fighter-row:hover {
          --row-hover: rgba(251, 191, 36, 0.05);
        }

        .light .fighter-row:hover {
          --row-hover: rgba(251, 191, 36, 0.03);
        }

        .fighters-table td {
          padding: 1rem;
          vertical-align: middle;
        }

        .rank-cell {
          font-weight: 700;
          font-size: 1.1rem;
        }

        .champion-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }

        .champion-header {
          font-size: 0.7rem;
          font-weight: 800;
          color: #fbbf24;
          text-transform: uppercase;
          letter-spacing: 1px;
          background: linear-gradient(45deg, #fbbf24, #f59e0b);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          color: #000;
        }

        .champion-rank {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #fbbf24;
        }

        .champion-text {
          font-size: 1.2rem;
          font-weight: 800;
        }

        .rank-number {
          color: #dc2626;
        }

        .division-cell {
          font-size: 0.85rem;
        }

        .division-badge {
          background: var(--division-bg);
          color: #dc2626;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8rem;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .dark .division-badge {
          --division-bg: rgba(251, 191, 36, 0.1);
        }

        .light .division-badge {
          --division-bg: rgba(251, 191, 36, 0.08);
        }

        .fighter-cell {
          min-width: 250px;
        }

        .fighter-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .fighter-image-container {
          position: relative;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid var(--image-border);
          flex-shrink: 0;
        }

        .dark .fighter-image-container {
          --image-border: rgba(251, 191, 36, 0.3);
        }

        .light .fighter-image-container {
          --image-border: rgba(251, 191, 36, 0.4);
        }

        .fighter-image-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }

        .fight-indicator {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 20px;
          height: 20px;
          background: #ef4444;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          border: 2px solid var(--bg-color);
        }

        .dark .fight-indicator {
          --bg-color: #0f172a;
        }

        .light .fight-indicator {
          --bg-color: #f8fafc;
        }

        .fighter-details {
          flex: 1;
        }

        .fighter-name {
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 0.25rem 0;
        }

        .fighter-nickname {
          font-size: 0.85rem;
          opacity: 0.6;
          font-style: italic;
          margin: 0;
        }

        .record-cell {
          font-weight: 600;
          color: #dc2626;
        }

        .country-cell {
          min-width: 150px;
        }

        .country-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .flag-img {
          width: 20px;
          height: 15px;
          object-fit: cover;
          border-radius: 2px;
        }

        .country-name {
          font-size: 0.9rem;
        }

        .stats-cell {
          min-width: 120px;
        }

        .quick-stats {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .quick-stats .stat-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          opacity: 0.7;
        }

        .quick-stats .stat-item svg {
          color: #dc2626;
        }

        .change-cell {
          text-align: center;
          min-width: 80px;
        }

        .fight-cell {
          min-width: 180px;
        }

        .next-fight {
          font-size: 0.85rem;
        }

        .fight-event {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .fight-date {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          opacity: 0.7;
          font-size: 0.8rem;
        }

        .fight-date svg {
          color: #dc2626;
        }

        .no-fight {
          opacity: 0.5;
          font-style: italic;
          font-size: 0.85rem;
        }

        .next-fight.clickable,
        .upcoming-fight.clickable {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: left;
          width: 100%;
          padding: 0.5rem;
          border-radius: 6px;
        }

        .next-fight.clickable:hover,
        .upcoming-fight.clickable:hover {
          background: var(--fight-hover);
          transform: scale(1.02);
        }

        .dark .next-fight.clickable:hover,
        .dark .upcoming-fight.clickable:hover {
          --fight-hover: rgba(239, 68, 68, 0.1);
        }

        .light .next-fight.clickable:hover,
        .light .upcoming-fight.clickable:hover {
          --fight-hover: rgba(239, 68, 68, 0.05);
        }

        /* Fighter Cards */
        .fighter-card {
          background: var(--card-bg);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease;
          position: relative;
          border: none;
          box-shadow: 0 4px 12px var(--card-shadow);
        }

        .dark .fighter-card {
          --card-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          --card-shadow: rgba(0, 0, 0, 0.3);
        }

        .light .fighter-card {
          --card-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
          --card-shadow: rgba(0, 0, 0, 0.1);
        }

        .fighter-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px var(--card-hover-shadow);
        }

        .dark .fighter-card:hover {
          --card-hover-shadow: rgba(220, 38, 38, 0.2);
        }

        .light .fighter-card:hover {
          --card-hover-shadow: rgba(220, 38, 38, 0.15);
        }

        .fighter-card.champion-card {
          border: 2px solid #ffd700;
          box-shadow: 0 8px 25px rgba(255, 215, 0, 0.3);
        }

        .champion-banner {
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          color: #000;
          padding: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .fighter-image-container {
          position: relative;
          width: 100%;
          height: 200px;
          overflow: hidden;
        }

        .fighter-image-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
          transition: transform 0.3s ease;
        }

        .fighter-card:hover .fighter-image-container img {
          transform: scale(1.05);
        }

        .fight-indicator {
          position: absolute;
          bottom: 0.5rem;
          right: 0.5rem;
          background: #dc2626;
          color: #fff;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .fighter-info {
          padding: 1rem;
        }

        .rank-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .rank-number {
          font-size: 1.5rem;
          font-weight: 800;
          color: #dc2626;
        }

        .division-badge {
          background: var(--division-bg);
          color: #dc2626;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.7rem;
          text-transform: uppercase;
        }

        .dark .division-badge {
          --division-bg: rgba(220, 38, 38, 0.1);
        }

        .light .division-badge {
          --division-bg: rgba(220, 38, 38, 0.08);
        }

        .fighter-name {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0 0 0.25rem 0;
          line-height: 1.2;
        }

        .fighter-nickname {
          font-size: 0.9rem;
          opacity: 0.7;
          font-style: italic;
          margin: 0 0 0.75rem 0;
        }

        .fighter-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          padding: 0.5rem 0;
          border-top: 1px solid var(--border-color);
          border-bottom: 1px solid var(--border-color);
        }

        .record {
          font-weight: 700;
          color: #dc2626;
          font-size: 1rem;
        }

        .country {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .flag {
          font-size: 1.2rem;
        }

        .country-name {
          font-size: 0.85rem;
          opacity: 0.8;
        }

        .rank-change {
          display: flex;
          justify-content: center;
          margin-bottom: 0.75rem;
        }

        .upcoming-fight {
          width: 100%;
          background: var(--fight-bg);
          border: 1px solid rgba(220, 38, 38, 0.3);
          border-radius: 6px;
          padding: 0.5rem;
          color: inherit;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }

        .dark .upcoming-fight {
          --fight-bg: rgba(220, 38, 38, 0.1);
        }

        .light .upcoming-fight {
          --fight-bg: rgba(220, 38, 38, 0.05);
        }

        .upcoming-fight:hover {
          background: rgba(220, 38, 38, 0.2);
        }

        /* Mobile Cards - Remove */
        .mobile-cards {
          display: none;
        }

        .fighter-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .dark .fighter-card {
          --card-bg: rgba(255, 255, 255, 0.02);
          --card-border: rgba(255, 255, 255, 0.1);
        }

        .light .fighter-card {
          --card-bg: rgba(255, 255, 255, 0.9);
          --card-border: rgba(0, 0, 0, 0.1);
        }

        .fighter-card:hover {
          border-color: #dc2626;
          box-shadow: 0 8px 25px var(--card-shadow);
          transform: translateY(-2px);
        }

        .dark .fighter-card:hover {
          --card-shadow: rgba(251, 191, 36, 0.1);
        }

        .light .fighter-card:hover {
          --card-shadow: rgba(251, 191, 36, 0.15);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: var(--card-header-bg);
          border-bottom: 1px solid var(--border-color);
        }

        .dark .card-header {
          --card-header-bg: rgba(251, 191, 36, 0.05);
        }

        .light .card-header {
          --card-header-bg: rgba(251, 191, 36, 0.03);
        }

        .rank-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .division-badge.mobile {
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
        }

        .card-body {
          padding: 1.5rem;
        }

        .fighter-main-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .mobile .fighter-image-container {
          width: 60px;
          height: 60px;
        }

        .mobile .fight-indicator {
          width: 18px;
          height: 18px;
          font-size: 8px;
        }

        .fighter-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.5rem;
        }

        .card-stats {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
          padding: 1rem;
          background: var(--stats-bg);
          border-radius: 8px;
        }

        .dark .card-stats {
          --stats-bg: rgba(255, 255, 255, 0.02);
        }

        .light .card-stats {
          --stats-bg: rgba(0, 0, 0, 0.02);
        }

        .card-stats .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }

        .card-stats .stat-item svg {
          color: #dc2626;
        }

        .upcoming-fight {
          background: var(--fight-bg);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          padding: 1rem;
          margin-top: 1rem;
        }

        .dark .upcoming-fight {
          --fight-bg: rgba(239, 68, 68, 0.1);
        }

        .light .upcoming-fight {
          --fight-bg: rgba(239, 68, 68, 0.05);
        }

        .fight-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          color: #ef4444;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .fight-details .fight-event {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .fight-details .fight-date {
          opacity: 0.7;
          font-size: 0.85rem;
        }

        /* Loading, Error, Empty States */
        .loading-state, .error-state, .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          padding: 2rem;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid var(--spinner-track);
          border-top-color: #dc2626;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .dark .spinner {
          --spinner-track: rgba(251, 191, 36, 0.2);
        }

        .light .spinner {
          --spinner-track: rgba(251, 191, 36, 0.3);
        }

        .error-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .error-state h3 {
          color: #ef4444;
          margin-bottom: 1rem;
        }

        .error-state p {
          opacity: 0.7;
          margin-bottom: 2rem;
        }

        .retry-btn {
          background: #ef4444;
          color: #fff;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .retry-btn:hover {
          background: #dc2626;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .empty-state h3 {
          color: #dc2626;
          margin-bottom: 1rem;
        }

        .empty-state p {
          opacity: 0.7;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .filter-controls {
            gap: 1rem;
          }

          .control-group {
            min-width: 120px;
          }

          .summary-stats {
            gap: 1rem;
          }
        }

        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }

          .title-section h1 {
            font-size: 2rem;
          }

          .mobile-only {
            display: flex;
          }

          .controls-section {
            padding: 1rem;
          }

          .controls-section.mobile-visible {
            display: block;
          }

          .search-bar {
            max-width: none;
          }

          .filter-controls {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
          }

          .division-selector,
          .control-group {
            min-width: auto;
          }

          .toggle-filters {
            flex-direction: column;
            gap: 0.5rem;
          }

          .desktop-table {
            display: none;
          }

          .mobile-cards {
            display: flex;
            flex-direction: column;
          }

          .fighters-container {
            padding: 1rem;
          }
        }

        @media (max-width: 480px) {
          .page-header {
            padding: 1.5rem 1rem;
          }

          .title-section h1 {
            font-size: 1.8rem;
          }

          .filter-btn {
            padding: 0.5rem 0.75rem;
            font-size: 0.85rem;
          }

          .fighter-card {
            border-radius: 12px;
          }

          .card-header,
          .card-body {
            padding: 1rem;
          }

          .fighter-main-info {
            flex-direction: column;
            text-align: center;
          }

          .fighter-meta {
            flex-direction: column;
            gap: 0.5rem;
          }
        }

        /* Hidden mobile filters by default */
        @media (max-width: 768px) {
          .controls-section:not(.mobile-visible) {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default Rankings;