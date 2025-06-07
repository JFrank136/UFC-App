import React, { useState, useEffect } from 'react';
import { Crown, TrendingUp, TrendingDown, Calendar, MapPin, ArrowUp, ArrowDown, Minus, Search, X, Sun, Moon, Filter, Users, Zap, Shield, BarChart3, Star } from 'lucide-react';
import supabase from '../api/supabaseClient';

const Rankings = () => {
  const [selectedDivision, setSelectedDivision] = useState('Pound-for-Pound');
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

  const divisions = [
    'Pound-for-Pound',
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

  const sortOptions = [
    { value: 'rank', label: 'Rank' },
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'upcoming', label: 'Upcoming Fights' },
    { value: 'movement', label: 'Recent Movement' }
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
    const { data, error } = await supabase
      .from('rankings')
      .select(`
        *,
        fighters:uuid (
          id,
          name,
          nickname,
          country,
          wins_total,
          losses_total,
          image_url,
          age,
          weight_class,
          height,
          reach,
          strikes_landed_per_min,
          striking_defense,
          takedown_avg
        )
      `)
      .not('rank', 'eq', 'NR')
      .order('division')
      .order('rank');

    if (error) throw error;

    return data.map(ranking => ({
      ...ranking.fighters,
      division: ranking.division,
      rank: ranking.rank,
      change: ranking.change,
      country_code: getCountryCode(ranking.fighters?.country)
    }));
  };

  const fetchUpcomingFights = async () => {
    const { data, error } = await supabase
      .from('upcoming_fights')
      .select('*')
      .order('event_date');

    if (error) throw error;
    return data;
  };

  const getCountryCode = (country) => {
    const countryCodeMap = {
      'United States': 'US', 'Brazil': 'BR', 'Russia': 'RU', 'Armenia': 'AM',
      'United Kingdom': 'GB', 'Canada': 'CA', 'Mexico': 'MX', 'Australia': 'AU',
      'Ireland': 'IE', 'Poland': 'PL', 'Sweden': 'SE', 'Norway': 'NO',
      'Netherlands': 'NL', 'Germany': 'DE', 'France': 'FR', 'Spain': 'ES',
      'Italy': 'IT', 'Japan': 'JP', 'South Korea': 'KR', 'China': 'CN',
      'New Zealand': 'NZ', 'Argentina': 'AR', 'Chile': 'CL', 'Venezuela': 'VE',
      'Colombia': 'CO', 'Peru': 'PE', 'Ecuador': 'EC', 'Uruguay': 'UY',
      'Kazakhstan': 'KZ', 'Georgia': 'GE', 'Ukraine': 'UA', 'Belarus': 'BY',
      'Lithuania': 'LT', 'Latvia': 'LV', 'Estonia': 'EE', 'Finland': 'FI',
      'Denmark': 'DK', 'Austria': 'AT', 'Switzerland': 'CH', 'Belgium': 'BE',
      'Czech Republic': 'CZ', 'Slovakia': 'SK', 'Hungary': 'HU', 'Romania': 'RO',
      'Bulgaria': 'BG', 'Serbia': 'RS', 'Croatia': 'HR', 'Slovenia': 'SI',
      'Bosnia and Herzegovina': 'BA', 'Montenegro': 'ME', 'North Macedonia': 'MK',
      'Albania': 'AL', 'Greece': 'GR', 'Turkey': 'TR', 'Cyprus': 'CY',
      'Malta': 'MT', 'Portugal': 'PT', 'Israel': 'IL', 'Lebanon': 'LB',
      'Jordan': 'JO', 'Syria': 'SY', 'Iraq': 'IQ', 'Iran': 'IR',
      'Afghanistan': 'AF', 'Pakistan': 'PK', 'India': 'IN', 'Bangladesh': 'BD',
      'Sri Lanka': 'LK', 'Nepal': 'NP', 'Bhutan': 'BT', 'Myanmar': 'MM',
      'Thailand': 'TH', 'Laos': 'LA', 'Cambodia': 'KH', 'Vietnam': 'VN',
      'Malaysia': 'MY', 'Singapore': 'SG', 'Indonesia': 'ID', 'Philippines': 'PH',
      'Mongolia': 'MN', 'Taiwan': 'TW', 'Hong Kong': 'HK', 'Macau': 'MO',
      'North Korea': 'KP', 'South Africa': 'ZA', 'Egypt': 'EG', 'Morocco': 'MA',
      'Algeria': 'DZ', 'Tunisia': 'TN', 'Libya': 'LY', 'Sudan': 'SD',
      'Ethiopia': 'ET', 'Kenya': 'KE', 'Uganda': 'UG', 'Tanzania': 'TZ',
      'Rwanda': 'RW', 'Burundi': 'BI', 'Democratic Republic of the Congo': 'CD',
      'Republic of the Congo': 'CG', 'Central African Republic': 'CF', 'Chad': 'TD',
      'Niger': 'NE', 'Mali': 'ML', 'Burkina Faso': 'BF', 'Senegal': 'SN',
      'Gambia': 'GM', 'Guinea-Bissau': 'GW', 'Guinea': 'GN', 'Sierra Leone': 'SL',
      'Liberia': 'LR', 'Ivory Coast': 'CI', 'Ghana': 'GH', 'Togo': 'TG',
      'Benin': 'BJ', 'Nigeria': 'NG', 'Cameroon': 'CM', 'Equatorial Guinea': 'GQ',
      'Gabon': 'GA', 'Sao Tome and Principe': 'ST', 'Angola': 'AO', 'Zambia': 'ZM',
      'Malawi': 'MW', 'Mozambique': 'MZ', 'Madagascar': 'MG', 'Mauritius': 'MU',
      'Comoros': 'KM', 'Seychelles': 'SC', 'Djibouti': 'DJ', 'Eritrea': 'ER',
      'Somalia': 'SO', 'Botswana': 'BW', 'Namibia': 'NA', 'Lesotho': 'LS',
      'Swaziland': 'SZ', 'Zimbabwe': 'ZW'
    };
    
    return countryCodeMap[country] || null;
  };

  const parseRankChange = (changeText) => {
    if (!changeText) return null;
    
    if (changeText.toLowerCase().includes('new') || changeText.toLowerCase().includes('debut')) {
      return 'NEW';
    }
    if (changeText.toLowerCase().includes('return')) {
      return 'RET';
    }
    if (changeText.toLowerCase().includes('interim')) {
      return 'INTERIM';
    }
    
    const increaseMatch = changeText.match(/increased by (\d+)/i);
    if (increaseMatch) {
      return parseInt(increaseMatch[1]);
    }
    
    const decreaseMatch = changeText.match(/decreased by (\d+)/i);
    if (decreaseMatch) {
      return -parseInt(decreaseMatch[1]);
    }
    
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
    }

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(fighter => 
        fighter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fighter.country?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Champions only filter
    if (showChampionsOnly) {
      filtered = filtered.filter(fighter => fighter.rank === 'C');
    }

    // Movers only filter
    if (showMoversOnly) {
      filtered = filtered.filter(fighter => {
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

    // Sort fighters
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'upcoming':
        filtered.sort((a, b) => {
          if (a.hasUpcomingFight && !b.hasUpcomingFight) return -1;
          if (!a.hasUpcomingFight && b.hasUpcomingFight) return 1;
          return 0;
        });
        break;
      case 'movement':
        filtered.sort((a, b) => {
          const aChange = Math.abs(a.parsedChange || 0);
          const bChange = Math.abs(b.parsedChange || 0);
          return bChange - aChange;
        });
        break;
      default: // rank
        filtered.sort((a, b) => {
          if (a.rank === 'C') return -1;
          if (b.rank === 'C') return 1;
          return parseInt(a.rank) - parseInt(b.rank);
        });
        break;
    }

    // If showing movers only, also sort by division
    if (showMoversOnly) {
      filtered.sort((a, b) => {
        const divisionOrder = divisions.indexOf(a.division) - divisions.indexOf(b.division);
        if (divisionOrder !== 0) return divisionOrder;
        
        if (a.rank === 'C') return -1;
        if (b.rank === 'C') return 1;
        return parseInt(a.rank) - parseInt(b.rank);
      });
    }

    return filtered;
  };

  const getCountryFlag = (countryCode) => {
    if (!countryCode) return null;
    return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;
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

  const formatStat = (value, decimals = 1) => {
    if (!value) return 'N/A';
    if (typeof value === 'string' && value.includes('(')) return value;
    const num = parseFloat(value);
    if (!isNaN(num)) return num.toFixed(decimals);
    return value.toString();
  };

  const filteredFighters = getFilteredAndSortedFighters();

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
                onChange={(e) => setSelectedDivision(e.target.value)}
                disabled={showMoversOnly}
              >
                {divisions.map(division => (
                  <option key={division} value={division}>{division}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort Options */}
          <div className="control-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {sortOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {/* Toggle Filters */}
          <div className="toggle-filters">
            <button
              className={`filter-btn ${showMoversOnly ? 'active' : ''}`}
              onClick={() => setShowMoversOnly(!showMoversOnly)}
            >
              <TrendingUp size={16} />
              <span>{showMoversOnly ? 'All Movers' : 'Movers Only'}</span>
            </button>
            
            <button
              className={`filter-btn ${showChampionsOnly ? 'active' : ''}`}
              onClick={() => setShowChampionsOnly(!showChampionsOnly)}
            >
              <Crown size={16} />
              <span>Champions</span>
            </button>
          </div>
        </div>

        {/* Results Summary */}
        <div className="results-summary">
          <div className="summary-stats">
            <div className="stat-item">
              <Users size={16} />
              <span>{filteredFighters.length} fighters</span>
            </div>
            {showMoversOnly && (
              <div className="stat-item">
                <TrendingUp size={16} />
                <span>across all divisions</span>
              </div>
            )}
            {searchQuery && (
              <div className="stat-item search-indicator">
                <Search size={16} />
                <span>"{searchQuery}"</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Fighters List */}
      <div className="fighters-container">
        {filteredFighters.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🥊</div>
            <h3>No fighters found</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="desktop-table">
              <table className="fighters-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    {showMoversOnly && <th>Division</th>}
                    <th>Fighter</th>
                    <th>Record</th>
                    <th>Country</th>
                    <th>Stats</th>
                    <th>Change</th>
                    <th>Next Fight</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFighters.map((fighter, index) => (
                    <tr key={`${fighter.id}-${fighter.division}`} className="fighter-row">
                      <td className="rank-cell">
                        {fighter.rank === 'C' ? (
                          <div className="champion-rank">
                            <Crown className="w-5 h-5 text-yellow-500" />
                            <span className="champion-text">C</span>
                          </div>
                        ) : (
                          <span className="rank-number">#{fighter.rank}</span>
                        )}
                      </td>
                      
                      {showMoversOnly && (
                        <td className="division-cell">
                          <span className="division-badge">{fighter.division}</span>
                        </td>
                      )}
                      
                      <td className="fighter-cell">
                        <div className="fighter-info">
                          <div className="fighter-image-container">
                            <img
                              src={fighter.image_url}
                              alt={fighter.name}
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/48x48/gray/white?text=' + fighter.name?.charAt(0);
                              }}
                            />
                            {fighter.hasUpcomingFight && (
                              <div className="fight-indicator">🥊</div>
                            )}
                          </div>
                          <div className="fighter-details">
                            <div className="fighter-name">{fighter.name}</div>
                            {fighter.nickname && (
                              <div className="fighter-nickname">"{fighter.nickname}"</div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="record-cell">
                        <span className="record">{fighter.wins_total}-{fighter.losses_total}</span>
                      </td>
                      
                      <td className="country-cell">
                        <div className="country-info">
                          {fighter.country_code && (
                            <img
                              src={getCountryFlag(fighter.country_code)}
                              alt={fighter.country}
                              className="flag-img"
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          )}
                          <span className="country-name">{fighter.country}</span>
                        </div>
                      </td>
                      
                      <td className="stats-cell">
                        <div className="quick-stats">
                          <div className="stat-item">
                            <Zap size={12} />
                            <span>{formatStat(fighter.strikes_landed_per_min)}</span>
                          </div>
                          <div className="stat-item">
                            <Shield size={12} />
                            <span>{formatStat(fighter.striking_defense)}</span>
                          </div>
                        </div>
                      </td>
                      
                      <td className="change-cell">
                        {getRankChangeIcon(fighter.parsedChange)}
                      </td>
                      
                      <td className="fight-cell">
                        {fighter.upcomingFight ? (
                          <div className="next-fight">
                            <div className="fight-event">{fighter.upcomingFight.event}</div>
                            <div className="fight-date">
                              <Calendar size={12} />
                              {formatDate(fighter.upcomingFight.event_date)}
                            </div>
                          </div>
                        ) : (
                          <span className="no-fight">No fight scheduled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                            {fighter.country_code && (
                              <img
                                src={getCountryFlag(fighter.country_code)}
                                alt={fighter.country}
                                className="flag-img"
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            )}
                            <span>{fighter.country}</span>
                          </div>
                          <span className="record">{fighter.wins_total}-{fighter.losses_total}</span>
                        </div>
                      </div>
                    </div>

                    <div className="card-stats">
                      <div className="stat-item">
                        <Zap size={14} />
                        <span>Strikes: {formatStat(fighter.strikes_landed_per_min)}/min</span>
                      </div>
                      <div className="stat-item">
                        <Shield size={14} />
                        <span>Defense: {formatStat(fighter.striking_defense)}</span>
                      </div>
                      <div className="stat-item">
                        <BarChart3 size={14} />
                        <span>Takedowns: {formatStat(fighter.takedown_avg)}/15min</span>
                      </div>
                    </div>

                    {fighter.upcomingFight && (
                      <div className="upcoming-fight">
                        <div className="fight-header">
                          <Calendar size={14} />
                          <span>Next Fight</span>
                        </div>
                        <div className="fight-details">
                          <div className="fight-event">{fighter.upcomingFight.event}</div>
                          <div className="fight-date">{formatDate(fighter.upcomingFight.event_date)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .rankings-container {
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: all 0.3s ease;
        }

        .rankings-container.dark {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
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
          --border-color: rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
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
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
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
          --btn-color: #fbbf24;
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
          border-color: #fbbf24;
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
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 150px;
        }

        .control-group label {
          font-size: 0.85rem;
          color: #fbbf24;
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
          border-color: #fbbf24;
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

        .toggle-filters {
          display: flex;
          gap: 1rem;
          align-items: center;
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
          border-color: #fbbf24;
        }

        .dark .filter-btn:hover {
          --filter-btn-hover: rgba(251, 191, 36, 0.1);
        }

        .light .filter-btn:hover {
          --filter-btn-hover: rgba(251, 191, 36, 0.1);
        }

        .filter-btn.active {
          background: var(--filter-btn-active);
          border-color: #fbbf24;
          color: #fbbf24;
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
          color: #fbbf24;
        }

        .search-indicator {
          color: #fbbf24;
          opacity: 1;
          font-weight: 500;
        }

        /* Fighters Container */
        .fighters-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* Desktop Table */
        .desktop-table {
          display: block;
          background: var(--table-bg);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 20px var(--table-shadow);
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
          color: #fbbf24;
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
          color: #fbbf24;
        }

        .division-cell {
          font-size: 0.85rem;
        }

        .division-badge {
          background: var(--division-bg);
          color: #fbbf24;
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
          color: #fbbf24;
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
          color: #fbbf24;
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
          color: #fbbf24;
        }

        .no-fight {
          opacity: 0.5;
          font-style: italic;
          font-size: 0.85rem;
        }

        /* Mobile Cards */
        .mobile-cards {
          display: none;
          gap: 1.5rem;
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
          border-color: #fbbf24;
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
          color: #fbbf24;
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
          border-top-color: #fbbf24;
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
          color: #fbbf24;
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