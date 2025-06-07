import React, { useEffect, useState, useMemo } from 'react';
import { Clock, Calendar, Search, X, Target, Shield, Zap, AlertCircle, ChevronDown, ChevronUp, BarChart2, Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getFullUpcomingFights } from '../api/supabaseQueries';
import countryCodes from '../utils/countryCodes';

const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [userFilter, setUserFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFights, setExpandedFights] = useState(new Set());
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [comparingFighters, setComparingFighters] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  // Load all fighters on component mount
  useEffect(() => {
    const fetchFightsWithFavorites = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get all upcoming fights with fighter data
        const upcomingFights = await getFullUpcomingFights();
        
        // Get user favorites to filter fights
        const { data: userFavorites, error: favError } = await supabase
          .from('user_favorites')
          .select('*');

        if (favError) throw favError;

        // Filter fights to only include those with fighters in user_favorites
        const fightsWithFavorites = upcomingFights.filter(fight => {
          const fighter1Favorites = userFavorites.filter(fav => fav.fighter_id === fight.fighter1_id);
          const fighter2Favorites = userFavorites.filter(fav => fav.fighter_id === fight.fighter2_id);
          
          return fighter1Favorites.length > 0 || fighter2Favorites.length > 0;
        }).map(fight => {
          // Add favorite data to each fight
          const fighter1Favorites = userFavorites.filter(fav => fav.fighter_id === fight.fighter1_id);
          const fighter2Favorites = userFavorites.filter(fav => fav.fighter_id === fight.fighter2_id);
          
          return {
            ...fight,
            fighter1_favorites: fighter1Favorites,
            fighter2_favorites: fighter2Favorites,
            // Ensure we have proper fighter data structure
            fighter1_data: fight.fighter1_data || {},
            fighter2_data: fight.fighter2_data || {}
          };
        });

        console.log('Processed fights with favorites:', fightsWithFavorites);
        setFights(fightsWithFavorites);
      } catch (err) {
        console.error('Error fetching fights:', err);
        setError('Failed to load upcoming fights. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchFightsWithFavorites();
  }, []);

  // Calculate countdown to next event
  const nextEventCountdown = useMemo(() => {
    if (fights.length === 0) return null;
    
    const now = new Date();
    const nextEvent = fights
      .map(f => new Date(f.event_date + 'T' + (f.event_time || '00:00')))
      .filter(date => date > now)
      .sort((a, b) => a - b)[0];
    
    if (!nextEvent) return null;
    
    const diff = nextEvent - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, eventDate: nextEvent };
  }, [fights]);

  // Filter fights based on search and user preferences
  const filteredFights = useMemo(() => {
    let filtered = fights;
    
    // Text search
    if (searchQuery.trim()) {
      filtered = filtered.filter(fight => 
        (fight.fighter1_data?.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (fight.fighter2_data?.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (fight.fighter1_data?.nickname?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (fight.fighter2_data?.nickname?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (fight.event?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    // User filter
    if (userFilter !== 'All') {
      filtered = filtered.filter(fight => {
        const f1HasUser = fight.fighter1_favorites?.some(f => f.user === userFilter);
        const f2HasUser = fight.fighter2_favorites?.some(f => f.user === userFilter);
        
        if (userFilter === 'Both') {
          const fightHasBothUsers = 
            ((fight.fighter1_favorites?.some(f => f.user === 'Jared')) || (fight.fighter2_favorites?.some(f => f.user === 'Jared'))) &&
            ((fight.fighter1_favorites?.some(f => f.user === 'Mars')) || (fight.fighter2_favorites?.some(f => f.user === 'Mars')));
          
          return fightHasBothUsers;
        }
        
        return f1HasUser || f2HasUser;
      });
    }
    
    // Priority filter
    if (priorityFilter !== 'All') {
      filtered = filtered.filter(fight => 
        (fight.fighter1_favorites?.some(f => f.priority === priorityFilter.toLowerCase())) ||
        (fight.fighter2_favorites?.some(f => f.priority === priorityFilter.toLowerCase()))
      );
    }
    
    return filtered;
  }, [fights, searchQuery, userFilter, priorityFilter]);

  // Group fights by event
  const groupedFights = useMemo(() => {
    const groups = {};
    filteredFights.forEach(fight => {
      const key = fight.event;
      if (!groups[key]) {
        groups[key] = {
          date: fight.event_date,
          time: fight.event_time,
          type: fight.event_type,
          fights: []
        };
      }
      groups[key].fights.push(fight);
    });
    
    // Sort fights within each event by fight order (higher numbers first for main card)
    Object.values(groups).forEach(group => {
      group.fights.sort((a, b) => (b.fight_order || 0) - (a.fight_order || 0));
    });
    
    return groups;
  }, [filteredFights]);

  // Initialize all events as expanded
  useEffect(() => {
    if (Object.keys(groupedFights).length > 0) {
      setExpandedEvents(new Set(Object.keys(groupedFights)));
    }
  }, [groupedFights]);

const toggleFightExpansion = (fightId) => {
    setExpandedFights(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fightId)) {
        newSet.delete(fightId);
      } else {
        newSet.add(fightId);
      }
      return newSet;
    });
  };

  const toggleCardExpansion = (fightId) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fightId)) {
        newSet.delete(fightId);
      } else {
        newSet.add(fightId);
      }
      return newSet;
    });
  };

  const toggleEventExpansion = (eventName) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventName)) {
        newSet.delete(eventName);
      } else {
        newSet.add(eventName);
      }
      return newSet;
    });
  };

  const startComparison = (fight) => {
    setComparingFighters(fight);
  };

  const closeComparison = () => {
    setComparingFighters(null);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Time TBA';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm} EST`;
  };

  const getFightOutcomeStats = (fighter, type = 'all') => {
    if (!fighter?.fight_history || fighter.fight_history.length === 0) {
      return { ko: 0, sub: 0, dec: 0, total: 0 };
    }

    let fights = fighter.fight_history;
    
    if (type === 'wins') {
      fights = fights.filter(f => f.result?.toLowerCase() === 'win');
    } else if (type === 'losses') {
      fights = fights.filter(f => f.result?.toLowerCase() === 'loss');
    }

    const total = fights.length;
    if (total === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };

    const ko = fights.filter(f => 
      f.method?.toLowerCase().includes('ko') || 
      f.method?.toLowerCase().includes('tko') ||
      f.method?.toLowerCase().includes('knockout')
    ).length;

    const sub = fights.filter(f => 
      f.method?.toLowerCase().includes('sub') ||
      f.method?.toLowerCase().includes('submission') ||
      f.method?.toLowerCase().includes('tap')
    ).length;

    const dec = fights.filter(f => 
      f.method?.toLowerCase().includes('decision') ||
      f.method?.toLowerCase().includes('unanimous') ||
      f.method?.toLowerCase().includes('majority') ||
      f.method?.toLowerCase().includes('split')
    ).length;

    return {
      ko: Math.round((ko / total) * 100),
      sub: Math.round((sub / total) * 100), 
      dec: Math.round((dec / total) * 100),
      total
    };
  };

  const getUserLabels = (favorites) => {
    if (!favorites || favorites.length === 0) return [];
    
    return favorites.map(fav => ({
      user: fav.user,
      priority: fav.priority,
      color: fav.user === 'Jared' ? '#3b82f6' : '#ef4444'
    }));
  };

  const checkBothUsersInterested = (fight) => {
    const hasJared = (fight.fighter1_favorites?.some(f => f.user === 'Jared')) || 
                     (fight.fighter2_favorites?.some(f => f.user === 'Jared'));
    const hasMars = (fight.fighter1_favorites?.some(f => f.user === 'Mars')) || 
                    (fight.fighter2_favorites?.some(f => f.user === 'Mars'));
    return hasJared && hasMars;
  };

  const getRankDisplay = (fighter) => {
    if (!fighter?.rankings || fighter.rankings.length === 0) return { divisional: null, p4p: null };
    
    const p4pRank = fighter.rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
    
    return { divisional: divRank, p4p: p4pRank };
  };

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.wins_total || 0;
    const losses = fighter.losses_total || 0;
    return `${wins}-${losses}`;
  };

  const getRecentFights = (fighter, limit = 3) => {
    if (!fighter?.fight_history) return [];
    return fighter.fight_history
      .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date))
      .slice(0, limit);
  };

// Helper function to safely format stats that might be strings like "4 (33%)" or numbers
  const formatStat = (value, decimals = 2, suffix = '') => {
    if (!value) return 'N/A';
    
    // If it's already a formatted string with parentheses, return as-is
    if (typeof value === 'string' && value.includes('(')) {
      return value;
    }
    
    // If it's a number or string number, format it
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return num.toFixed(decimals) + suffix;
    }
    
    return value.toString();
  };

  const ComparisonModal = ({ fight, onClose }) => {
    if (!fight) return null;
    
    const f1 = fight.fighter1_data;
    const f2 = fight.fighter2_data;
    
    if (!f1 || !f2) return null;

    const statComparisons = [
      { label: 'Age', f1: f1.age || 'N/A', f2: f2.age || 'N/A', inverse: true },
      { label: 'Height', f1: f1.height ? f1.height + '"' : 'N/A', f2: f2.height ? f2.height + '"' : 'N/A' },
      { label: 'Reach', f1: f1.reach ? f1.reach + '"' : 'N/A', f2: f2.reach ? f2.reach + '"' : 'N/A' },
      { label: 'Fight Finishes', 
        f1: (() => {
          const stats = getFightOutcomeStats(f1);
          return stats.total > 0 ? `${stats.ko}% KO, ${stats.dec}% Dec, ${stats.sub}% Sub` : 'N/A';
        })(), 
        f2: (() => {
          const stats = getFightOutcomeStats(f2);
          return stats.total > 0 ? `${stats.ko}% KO, ${stats.dec}% Dec, ${stats.sub}% Sub` : 'N/A';
        })()
      },
      { label: 'Strikes/Min', f1: formatStat(f1.strikes_landed_per_min), f2: formatStat(f2.strikes_landed_per_min) },
      { label: 'Strike Defense', f1: formatStat(f1.striking_defense), f2: formatStat(f2.striking_defense) },
      { label: 'Takedowns/15min', f1: formatStat(f1.takedown_avg, 1), f2: formatStat(f2.takedown_avg, 1) },
      { label: 'KO/TKO Wins', f1: f1.wins_ko || 0, f2: f2.wins_ko || 0 },
      { label: 'Submission Wins', f1: f1.wins_sub || 0, f2: f2.wins_sub || 0 }
    ];
    
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="comparison-modal" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
          
          <h2 className="comparison-title">Fighter Comparison</h2>
          
          <div className="comparison-header">
            <div className="fighter-summary">
              <div className="comparison-image-container">
                <img 
                  src={f1.image_url || '/static/images/placeholder.jpg'} 
                  alt={f1.name}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/100x100/gray/white?text=' + (f1.name?.charAt(0) || '?');
                  }}
                />
              </div>
              <h3>{f1.name}</h3>
              <p>{f1.nickname || ''}</p>
              <div className="record">{formatRecord(f1)}</div>
            </div>
            
            <div className="vs-divider">VS</div>
            
            <div className="fighter-summary">
              <div className="comparison-image-container">
                <img 
                  src={f2.image_url || '/static/images/placeholder.jpg'} 
                  alt={f2.name}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/100x100/gray/white?text=' + (f2.name?.charAt(0) || '?');
                  }}
                />
              </div>
              <h3>{f2.name}</h3>
              <p>{f2.nickname || ''}</p>
              <div className="record">{formatRecord(f2)}</div>
            </div>
          </div>
          
          <div className="comparison-stats">
            {statComparisons.map((stat, idx) => {
              const f1Val = parseFloat(stat.f1) || 0;
              const f2Val = parseFloat(stat.f2) || 0;
              const f1Better = stat.inverse ? f1Val < f2Val && f1Val > 0 : f1Val > f2Val;
              const f2Better = stat.inverse ? f2Val < f1Val && f2Val > 0 : f2Val > f1Val;
              
              return (
                <div key={idx} className="stat-comparison">
                  <div className={`stat-value ${f1Better ? 'better' : ''}`}>
                    {stat.f1}
                  </div>
                  <div className="stat-label">{stat.label}</div>
                  <div className={`stat-value ${f2Better ? 'better' : ''}`}>
                    {stat.f2}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="recent-fights-comparison">
            <div className="recent-fights">
              <h4>Recent Fights</h4>
              {getRecentFights(f1).map((fight, idx) => (
                <div key={idx} className={`fight-result ${fight.result?.toLowerCase() || ''}`}>
                  <span className="result-indicator">{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
                  <span className="opponent">{fight.opponent || 'Unknown'}</span>
                  <span className="method">{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                </div>
              ))}
              {getRecentFights(f1).length === 0 && (
                <div className="no-fights">No recent fights available</div>
              )}
            </div>
            
            <div className="recent-fights">
              <h4>Recent Fights</h4>
              {getRecentFights(f2).map((fight, idx) => (
                <div key={idx} className={`fight-result ${fight.result?.toLowerCase() || ''}`}>
                  <span className="result">{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
                  <span className="opponent">{fight.opponent || 'Unknown'}</span>
                  <span className="method">{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                </div>
              ))}
              {getRecentFights(f2).length === 0 && (
                <div className="no-fights">No recent fights available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const FighterCard = ({ fight, isExpanded }) => {
    const f1 = fight.fighter1_data;
    const f2 = fight.fighter2_data;
    const isCardExpanded = expandedCards.has(fight.id);
    
    if (!f1 || !f2) {
      console.log('Missing fighter data:', { f1: !!f1, f2: !!f2, fight: fight.id });
      return (
        <div className="fight-card error-card">
          <p>Fighter data unavailable for this fight</p>
        </div>
      );
    }
    
// Check if it's a championship fight
const isChampionshipFight = 
  (f1.rankings && f1.rankings.some(r => r.rank === 'C')) ||
  (f2.rankings && f2.rankings.some(r => r.rank === 'C')) ||
  (fight.event?.toLowerCase().includes('title')) ||
  (fight.fighter1?.toLowerCase().includes('title')) ||
  (fight.fighter2?.toLowerCase().includes('title'));

// Get proper division from rankings data
const getDivisionFromRankings = (fighter) => {
  if (!fighter?.rankings || fighter.rankings.length === 0) return null;
  const divisionRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
  return divisionRank?.division || null;
};

const actualDivision = getDivisionFromRankings(f1) || getDivisionFromRankings(f2);
    
    const f1Rankings = getRankDisplay(f1);
    const f2Rankings = getRankDisplay(f2);
    const f1Labels = getUserLabels(fight.fighter1_favorites);
    const f2Labels = getUserLabels(fight.fighter2_favorites);
    const isBothUsersInterested = checkBothUsersInterested(fight);
    
    // Get weight class display name using fighters' actual divisions
    const getWeightClassName = (weightClass, fighter1, fighter2) => {
      if (!weightClass || weightClass === 'TBA') return 'TBA';
      
      // First try to get division from fighters' rankings
      const f1Division = getDivisionFromRankings(fighter1);
      const f2Division = getDivisionFromRankings(fighter2);
      
      // If both fighters have the same division, use that
      if (f1Division && f2Division && f1Division === f2Division) {
        return f1Division;
      }
      
      // If only one has a division, use that
      if (f1Division && !f2Division) return f1Division;
      if (f2Division && !f1Division) return f2Division;
      
      // Fallback to weight class mapping with women's detection
      const weightMap = {
        '125': 'Flyweight',
        '135': 'Bantamweight', 
        '145': 'Featherweight',
        '155': 'Lightweight',
        '170': 'Welterweight',
        '185': 'Middleweight',
        '205': 'Light Heavyweight',
        '265': 'Heavyweight',
        '115': "Women's Strawweight"
      };
      
      let division = weightMap[weightClass] || weightClass;
      
      // Check if either fighter has "women's" in their division to modify the result
      const hasWomensDiv = (f1Division && f1Division.toLowerCase().includes("women's")) || 
                          (f2Division && f2Division.toLowerCase().includes("women's"));
      
      if (hasWomensDiv && !division.toLowerCase().includes("women's")) {
        // Convert men's division to women's equivalent
        const womensMap = {
          'Flyweight': "Women's Flyweight",
          'Bantamweight': "Women's Bantamweight",
          'Featherweight': "Women's Featherweight"
        };
        division = womensMap[division] || `Women's ${division}`;
      }
      
      return division;
    };
    
    return (
      <div className={`fight-card ${isBothUsersInterested ? 'both-users-card' : ''} ${isChampionshipFight ? 'championship-fight' : ''}`}>
        <div className="fight-card-header">
          <div className="card-section-badge">{fight.card_section || 'TBA'}</div>
          <div className="weight-class">{actualDivision || getWeightClassName(fight.weight_class, f1, f2)}</div>
          <div className="fight-time">
            {fight.event_time ? formatTime(fight.event_time) : 'Time TBA'}
          </div>
          <button 
            className="card-expand-btn"
            onClick={() => toggleCardExpansion(fight.id)}
            title={isCardExpanded ? "Collapse card" : "Expand card"}
          >
            {isCardExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        
        <div className="fight-matchup">
          <div className="fighter-preview">
            <div className="fighter-image-container">
              <img 
                src={f1.image_url || '/static/images/placeholder.jpg'} 
                alt={f1.name || 'Fighter'}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/120x120/cccccc/666666?text=' + (f1.name?.charAt(0) || '?');
                }}
              />
              {f1Rankings.p4p && (
                <div className="p4p-medal-badge">🥇</div>
              )}
            </div>
            
            <div className="fighter-info">
              <h3>{f1.name || 'Unknown Fighter'}</h3>
              {f1.nickname && <p className="nickname">"{f1.nickname}"</p>}
              
              <div className="country">
                {countryCodes[f1.country] || '🏴'} {f1.country || 'Unknown'}
              </div>
              
              <div className="record">{formatRecord(f1)}</div>
              
              <div className="rankings-container">
                {f1Rankings.divisional && (
                  <div className="rank-badge divisional">
                    #{f1Rankings.divisional.rank} {f1Rankings.divisional.division}
                  </div>
                )}
                {f1Rankings.p4p && (
                  <div className="rank-badge p4p">
                    P4P #{f1Rankings.p4p.rank}
                  </div>
                )}
              </div>
              
              {f1Labels.length > 0 && (
                <div className="user-labels">
                  {f1Labels.map((label, idx) => (
                    <span 
                      key={idx} 
                      className="user-label"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.user} ({label.priority})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="vs-section">
            {isChampionshipFight && <div className="championship-crown">👑</div>}
            <div className="vs">VS</div>
            <button 
              className="compare-btn"
              onClick={() => startComparison(fight)}
              title="Compare Fighters"
            >
              <BarChart2 size={20} />
            </button>
          </div>
          
          <div className="fighter-preview">
            <div className="fighter-image-container">
              <img 
                src={f2.image_url || '/static/images/placeholder.jpg'} 
                alt={f2.name || 'Fighter'}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/120x120/cccccc/666666?text=' + (f2.name?.charAt(0) || '?');
                }}
              />
              {f2Rankings.p4p && (
                <div className="p4p-medal-badge">🥇</div>
              )}
            </div>
            
            <div className="fighter-info">
              <h3>{f2.name || 'Unknown Fighter'}</h3>
              {f2.nickname && <p className="nickname">"{f2.nickname}"</p>}
              
              <div className="country">
                {countryCodes[f2.country] || '🏴'} {f2.country || 'Unknown'}
              </div>
              
              <div className="record">{formatRecord(f2)}</div>
              
              <div className="rankings-container">
                {f2Rankings.divisional && (
                  <div className="rank-badge divisional">
                    #{f2Rankings.divisional.rank} {f2Rankings.divisional.division}
                  </div>
                )}
                {f2Rankings.p4p && (
                  <div className="rank-badge p4p">
                    P4P #{f2Rankings.p4p.rank}
                  </div>
                )}
              </div>
              
              {f2Labels.length > 0 && (
                <div className="user-labels">
                  {f2Labels.map((label, idx) => (
                    <span 
                      key={idx} 
                      className="user-label"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.user} ({label.priority})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <button 
          className="expand-btn"
          onClick={() => toggleFightExpansion(fight.id)}
        >
          <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        
        {isExpanded && (
          <div className="fight-details">
            <div className="detailed-stats">
              <div className="fighter-details">
                <h4>{f1.name} Stats</h4>
                <div className="stats-grid">
                  <div className="stat">
                    <Zap size={16} />
                    <span>Strikes/min: {formatStat(f1.strikes_landed_per_min)}</span>
                  </div>
                  <div className="stat">
                    <Shield size={16} />
                    <span>Defense: {formatStat(f1.striking_defense)}</span>
                  </div>
                  <div className="stat">
                    <Target size={16} />
                    <span>Takedowns: {formatStat(f1.takedown_avg, 1)}/15min</span>
                  </div>
                </div>
                
                <h5>Recent Performance</h5>
                <div className="recent-fights">
                  {getRecentFights(f1).map((result, idx) => (
                    <div key={idx} className={`fight-result ${result.result?.toLowerCase() || ''}`}>
                      <span className="result-indicator">{result.result?.charAt(0)?.toUpperCase() || '?'}</span>
                      <span>{result.opponent || 'Unknown'}</span>
                      <span className="method">{result.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                    </div>
                  ))}
                  {getRecentFights(f1).length === 0 && (
                    <div className="no-fights">No recent fights available</div>
                  )}
                </div>
              </div>
              
              <div className="fighter-details">
                <h4>{f2.name} Stats</h4>
                <div className="stats-grid">
                  <div className="stat">
                    <Zap size={16} />
                    <span>Strikes/min: {formatStat(f2.strikes_landed_per_min)}</span>
                  </div>
                  <div className="stat">
                    <Shield size={16} />
                    <span>Defense: {formatStat(f2.striking_defense)}</span>
                  </div>
                  <div className="stat">
                    <Target size={16} />
                    <span>Takedowns: {formatStat(f2.takedown_avg, 1)}/15min</span>
                  </div>
                </div>
                
                <h5>Recent Performance</h5>
                <div className="recent-fights">
                  {getRecentFights(f2).map((result, idx) => (
                    <div key={idx} className={`fight-result ${result.result?.toLowerCase() || ''}`}>
                      <span className="result-indicator">{result.result?.charAt(0)?.toUpperCase() || '?'}</span>
                      <span>{result.opponent || 'Unknown'}</span>
                      <span className="method">{result.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                    </div>
                  ))}
                  {getRecentFights(f2).length === 0 && (
                    <div className="no-fights">No recent fights available</div>
                  )}
                </div>
              </div>
            </div>
            
            <button 
              className="expand-btn collapse"
              onClick={() => toggleFightExpansion(fight.id)}
            >
              <span>Hide Details</span>
              <ChevronUp size={20} />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`loading-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="spinner"></div>
        <p>Loading upcoming fights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`error-container ${darkMode ? 'dark' : 'light'}`}>
        <AlertCircle size={48} />
        <h3>Error Loading Fights</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className={`upcoming-fights-container ${darkMode ? 'dark' : 'light'}`}>
      {/* Header with Countdown */}
      <header className="page-header">
        <div className="header-content">
          <h1>⚔️ Upcoming UFC Fights</h1>
          <p>Track your favorite fighters and never miss a match</p>
        </div>
        
        <div className="header-controls">
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          
          {nextEventCountdown && (
            <div className="countdown-timer">
              <Clock size={24} />
              <div className="countdown-content">
                <p>Next Event In</p>
                <div className="time-units">
                  <div className="time-unit">
                    <span className="value">{nextEventCountdown.days}</span>
                    <span className="label">Days</span>
                  </div>
                  <div className="time-unit">
                    <span className="value">{nextEventCountdown.hours}</span>
                    <span className="label">Hours</span>
                  </div>
                  <div className="time-unit">
                    <span className="value">{nextEventCountdown.minutes}</span>
                    <span className="label">Min</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Search and Filters */}
      <div className="controls-section">
        <div className="search-and-filters">
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search fighters or events..."
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
          
          <div className="filters-panel">
            <div className="filter-group">
            <label>User</label>
            <select 
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="All">All Users</option>
              <option value="Jared">Jared Only</option>
              <option value="Mars">Mars Only</option>
              <option value="Both">Both Users</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Priority</label>
            <select 
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="All">All Priorities</option>
              <option value="Favorite">Favorites Only</option>
              <option value="Interested">Interested Only</option>
            </select>
          </div>
          
          <div className="legend">
            <div className="legend-item">
              <div className="color-dot jared"></div>
              <span>Jared</span>
            </div>
            <div className="legend-item">
              <div className="color-dot mars"></div>
              <span>Mars</span>
            </div>
            <div className="legend-item">
              <div className="color-dot both"></div>
              <span>Both Users</span>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="results-summary">
        <div className="summary-content">
          {Object.keys(groupedFights).length === 0 ? (
            <p>No upcoming fights found for your selected criteria</p>
          ) : (
            <>
              <p>
                <strong>{filteredFights.length}</strong> fights across{' '}
                <strong>{Object.keys(groupedFights).length}</strong> events featuring your favorite fighters
              </p>
              {searchQuery && (
                <p className="search-info">
                  Showing results for "{searchQuery}"
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Events and Fights */}
      <div className="events-container">
        {Object.entries(groupedFights)
          .sort(([,a], [,b]) => new Date(a.date) - new Date(b.date))
          .map(([eventName, eventData]) => {
            const isPPV = eventData.type?.toLowerCase().includes('ppv') || 
                         eventName.toLowerCase().includes('ufc ') && 
                         /ufc \d+/.test(eventName.toLowerCase());
            const eventHasBothUsers = eventData.fights.some(fight => checkBothUsersInterested(fight));
            
            return (
              <div key={eventName} className="event-section">
                <div 
                  className={`event-header ${isPPV ? 'ppv-event' : 'fight-night-event'} ${eventHasBothUsers ? 'both-users-event' : ''}`}
                  onClick={() => toggleEventExpansion(eventName)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="event-info">
                    <div className="event-title-container">
                      <h2>{eventName}</h2>
                      {isPPV && <span className="ppv-badge">PPV</span>}
                      {eventHasBothUsers && <span className="both-users-badge">🔥 Hot Card</span>}
                    </div>
                    <div className="event-meta">
                      <Calendar size={16} />
                      <span>{formatDate(eventData.date)}</span>
                      <span className="separator">•</span>
                      <Clock size={16} />
                      <span>{eventData.time || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="event-stats">
                    <span className="fight-count">{eventData.fights.length} fights</span>
                    <span className="expand-icon">{expandedEvents.has(eventName) ? '▲' : '▼'}</span>
                  </div>
                </div>
                
                {expandedEvents.has(eventName) && (
                  <div className="fights-grid">
                    {eventData.fights.map(fight => (
                      <FighterCard 
                        key={fight.id}
                        fight={fight}
                        isExpanded={expandedFights.has(fight.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Comparison Modal */}
      {comparingFighters && (
        <ComparisonModal 
          fight={comparingFighters}
          onClose={closeComparison}
        />
      )}

      <style jsx>{`
        .upcoming-fights-container {
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: all 0.3s ease;
        }

        .upcoming-fights-container.dark {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          color: #fff;
        }

        .upcoming-fights-container.light {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
          color: #1e293b;
        }

        /* Header Styles */
        .page-header {
          padding: 2rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 2rem;
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

        .header-content h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, #3b82f6 0%, #ef4444 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-content p {
          font-size: 1.1rem;
          margin: 0;
          opacity: 0.7;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .theme-toggle {
          background: var(--theme-toggle-bg);
          border: 1px solid var(--theme-toggle-border);
          border-radius: 12px;
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--theme-toggle-color);
        }

        .dark .theme-toggle {
          --theme-toggle-bg: rgba(255, 255, 255, 0.05);
          --theme-toggle-border: rgba(255, 255, 255, 0.1);
          --theme-toggle-color: #fbbf24;
        }

        .light .theme-toggle {
          --theme-toggle-bg: rgba(0, 0, 0, 0.05);
          --theme-toggle-border: rgba(0, 0, 0, 0.1);
          --theme-toggle-color: #6366f1;
        }

        .theme-toggle:hover {
          transform: scale(1.1);
          border-color: var(--theme-toggle-hover);
        }

        .dark .theme-toggle:hover {
          --theme-toggle-hover: #fbbf24;
        }

        .light .theme-toggle:hover {
          --theme-toggle-hover: #6366f1;
        }

        .countdown-timer {
          background: var(--countdown-bg);
          border: 1px solid var(--countdown-border);
          border-radius: 16px;
          padding: 1.5rem 2rem;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          backdrop-filter: blur(10px);
        }

        .dark .countdown-timer {
          --countdown-bg: rgba(59, 130, 246, 0.1);
          --countdown-border: rgba(59, 130, 246, 0.3);
        }

        .light .countdown-timer {
          --countdown-bg: rgba(59, 130, 246, 0.08);
          --countdown-border: rgba(59, 130, 246, 0.2);
        }

        .countdown-timer svg {
          color: #3b82f6;
        }

        .countdown-content p {
          margin: 0 0 0.5rem 0;
          opacity: 0.6;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .time-units {
          display: flex;
          gap: 1.5rem;
        }

        .time-unit {
          text-align: center;
        }

        .time-unit .value {
          display: block;
          font-size: 1.8rem;
          font-weight: 700;
          color: #3b82f6;
          line-height: 1;
        }

        .time-unit .label {
          display: block;
          font-size: 0.8rem;
          opacity: 0.5;
          text-transform: uppercase;
          margin-top: 0.25rem;
        }

        /* Controls Section */
        .controls-section {
          padding: 1.5rem 2rem;
          background: var(--controls-bg);
          border-bottom: 1px solid var(--border-color);
        }

        .dark .controls-section {
          --controls-bg: rgba(255, 255, 255, 0.02);
        }

        .light .controls-section {
          --controls-bg: rgba(255, 255, 255, 0.7);
        }

        .search-and-filters {
          display: flex;
          gap: 2rem;
          align-items: center;
          flex-wrap: wrap;
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
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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
          background: var(--clear-search-hover);
        }

        .dark .clear-search:hover {
          --clear-search-hover: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .light .clear-search:hover {
          --clear-search-hover: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }

        .filters-panel {
          display: flex;
          gap: 2rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filter-group label {
          font-size: 0.85rem;
          color: #3b82f6;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filter-group select {
          background: var(--select-bg);
          border: 1px solid var(--select-border);
          border-radius: 8px;
          padding: 0.6rem 0.8rem;
          color: inherit;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          outline: none;
          min-width: 140px;
        }

        .dark .filter-group select {
          --select-bg: rgba(255, 255, 255, 0.05);
          --select-border: rgba(255, 255, 255, 0.1);
        }

        .light .filter-group select {
          --select-bg: rgba(255, 255, 255, 0.9);
          --select-border: rgba(0, 0, 0, 0.1);
        }

        .filter-group select:hover,
        .filter-group select:focus {
          border-color: #3b82f6;
        }

        .filter-group select:focus {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .dark .filter-group select option {
          background: #1e293b;
          color: #fff;
        }

        .light .filter-group select option {
          background: #fff;
          color: #1e293b;
        }

        .legend {
          display: flex;
          gap: 1.5rem;
          align-items: center;
          margin-left: auto;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          opacity: 0.7;
        }

        .color-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .color-dot.jared {
          background: #3b82f6;
        }

        .color-dot.mars {
          background: #ef4444;
        }

        .color-dot.both {
          background: linear-gradient(45deg, #3b82f6 50%, #ef4444 50%);
        }

        /* Results Summary */
        .results-summary {
          padding: 1rem 2rem;
          background: var(--summary-bg);
          border-bottom: 1px solid var(--border-color);
        }

        .dark .results-summary {
          --summary-bg: rgba(59, 130, 246, 0.05);
        }

        .light .results-summary {
          --summary-bg: rgba(59, 130, 246, 0.03);
        }

        .summary-content {
          text-align: center;
          opacity: 0.7;
        }

        .summary-content strong {
          color: #3b82f6;
          font-weight: 700;
        }

        .search-info {
          margin-top: 0.5rem;
          font-style: italic;
        }

        /* Events Container */
        .events-container {
          padding: 2rem;
        }

        .event-section {
          margin-bottom: 3rem;
        }

        .event-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding: 1.5rem 2rem;
          border-radius: 16px;
          border: 1px solid var(--event-border);
          background: var(--event-bg);
          transition: all 0.3s ease;
        }

        .dark .event-header {
          --event-border: rgba(255, 255, 255, 0.1);
          --event-bg: rgba(255, 255, 255, 0.02);
        }

        .light .event-header {
          --event-border: rgba(0, 0, 0, 0.1);
          --event-bg: rgba(255, 255, 255, 0.8);
        }

        .event-header.ppv-event {
          border-color: #fbbf24;
          background: var(--ppv-bg);
          box-shadow: 0 4px 20px var(--ppv-shadow);
        }

        .dark .event-header.ppv-event {
          --ppv-bg: rgba(251, 191, 36, 0.1);
          --ppv-shadow: rgba(251, 191, 36, 0.2);
        }

        .light .event-header.ppv-event {
          --ppv-bg: rgba(251, 191, 36, 0.05);
          --ppv-shadow: rgba(251, 191, 36, 0.1);
        }

        .event-header.fight-night-event {
          border-color: #8b5cf6;
          background: var(--fn-bg);
        }

        .dark .event-header.fight-night-event {
          --fn-bg: rgba(139, 92, 246, 0.1);
        }

        .light .event-header.fight-night-event {
          --fn-bg: rgba(139, 92, 246, 0.05);
        }

        .event-header.both-users-event {
          border-color: #fbbf24;
          background: var(--gold-bg);
          position: relative;
          overflow: hidden;
        }

        .dark .event-header.both-users-event {
          --gold-bg: rgba(251, 191, 36, 0.1);
        }

        .light .event-header.both-users-event {
          --gold-bg: rgba(251, 191, 36, 0.05);
        }

        .event-header.both-users-event::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #3b82f6, #fbbf24, #ef4444);
        }

        .event-title-container {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .event-info h2 {
          font-size: 1.6rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
        }

        .ppv-badge {
          background: linear-gradient(45deg, #fbbf24, #f59e0b);
          color: #000;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .both-users-badge {
          background: linear-gradient(45deg, #fbbf24, #f59e0b);
          color: #000;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .event-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          opacity: 0.6;
          font-size: 0.9rem;
        }

        .event-meta svg {
          color: #3b82f6;
        }

        .separator {
          opacity: 0.3;
        }

        .event-stats {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .fight-count {
          background: var(--count-bg);
          color: #3b82f6;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.85rem;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .dark .fight-count {
          --count-bg: rgba(59, 130, 246, 0.1);
        }

        .light .fight-count {
          --count-bg: rgba(59, 130, 246, 0.08);
        }

        /* Fights Grid */
        .fights-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
          gap: 2rem;
        }

        /* Fight Card */
        .fight-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(10px);
        }

        .dark .fight-card {
          --card-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
          --card-border: rgba(255, 255, 255, 0.1);
        }

        .light .fight-card {
          --card-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
          --card-border: rgba(0, 0, 0, 0.1);
        }

        .fight-card:hover {
          border-color: rgba(59, 130, 246, 0.5);
          box-shadow: 0 20px 40px var(--card-shadow);
          transform: translateY(-4px);
        }

        .dark .fight-card:hover {
          --card-shadow: rgba(59, 130, 246, 0.1);
        }

        .light .fight-card:hover {
          --card-shadow: rgba(59, 130, 246, 0.15);
        }

        .fight-card.both-users-card {
          border-color: #fbbf24;
          box-shadow: 0 8px 25px var(--both-card-shadow);
        }

        .dark .fight-card.both-users-card {
          --both-card-shadow: rgba(251, 191, 36, 0.2);
        }

        .light .fight-card.both-users-card {
          --both-card-shadow: rgba(251, 191, 36, 0.15);
        }

        .fight-card.both-users-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #3b82f6, #fbbf24, #ef4444);
        }

        .fight-card.championship-fight {
          border-color: #fbbf24;
          box-shadow: 0 8px 25px rgba(251, 191, 36, 0.2);
        }

        .fight-card.championship-fight::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24);
        }

        .fight-time {
          opacity: 0.6;
          font-weight: 500;
          font-size: 0.8rem;
          color: #3b82f6;
        }

        .expand-icon {
          font-size: 1.2rem;
          color: #3b82f6;
        }

        .event-header:hover {
          background: var(--event-hover-bg);
        }

        .dark .event-header:hover {
          --event-hover-bg: rgba(255, 255, 255, 0.05);
        }

        .light .event-header:hover {
          --event-hover-bg: rgba(0, 0, 0, 0.05);
        }

        .error-card {
          background: var(--error-bg);
          border-color: #ef4444;
          color: #ef4444;
          text-align: center;
          padding: 2rem;
        }

        .dark .error-card {
          --error-bg: rgba(239, 68, 68, 0.1);
        }

        .light .error-card {
          --error-bg: rgba(239, 68, 68, 0.05);
        }

        .fight-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: var(--header-bg);
          border-bottom: 1px solid var(--border-color);
        }

        .dark .fight-card-header {
          --header-bg: rgba(59, 130, 246, 0.05);
        }

        .light .fight-card-header {
          --header-bg: rgba(59, 130, 246, 0.03);
        }

        .card-section-badge {
          background: linear-gradient(45deg, #3b82f6, #ef4444);
          color: #fff;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .championship-crown {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }

        .card-expand-btn {
          background: var(--expand-btn-bg);
          border: 1px solid var(--expand-btn-border);
          border-radius: 6px;
          padding: 0.5rem;
          color: inherit;
          opacity: 0.6;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dark .card-expand-btn {
          --expand-btn-bg: rgba(255, 255, 255, 0.05);
          --expand-btn-border: rgba(255, 255, 255, 0.1);
        }

        .light .card-expand-btn {
          --expand-btn-bg: rgba(0, 0, 0, 0.05);
          --expand-btn-border: rgba(0, 0, 0, 0.1);
        }

        .card-expand-btn:hover {
          opacity: 1;
          background: var(--expand-btn-hover);
          color: #3b82f6;
        }

        .dark .card-expand-btn:hover {
          --expand-btn-hover: rgba(59, 130, 246, 0.1);
        }

        .light .card-expand-btn:hover {
          --expand-btn-hover: rgba(59, 130, 246, 0.08);
        }

        .weight-class {
          opacity: 0.6;
          font-weight: 500;
          font-size: 0.9rem;
        }

        .fight-matchup {
          display: flex;
          align-items: flex-start;
          padding: 2rem 1.5rem;
          gap: 2rem;
        }

        .fighter-preview {
          flex: 1;
          text-align: center;
        }

        .fighter-image-container {
          width: 120px;
          height: 120px;
          margin: 0 auto 1rem;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid var(--image-border);
          transition: transform 0.3s ease;
          background: var(--image-bg);
          position: relative;
        }

        .p4p-medal-badge {
          position: absolute;
          top: -12px;
          right: -12px;
          font-size: 1.2rem;
          z-index: 2;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }

        .dark .fighter-image-container {
          --image-border: rgba(255, 255, 255, 0.1);
          --image-bg: rgba(255, 255, 255, 0.05);
        }

        .light .fighter-image-container {
          --image-border: rgba(0, 0, 0, 0.1);
          --image-bg: rgba(0, 0, 0, 0.05);
        }

        .fight-card:hover .fighter-image-container {
          transform: scale(1.05);
        }

        .fighter-image-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }

        .fighter-info {
          min-height: 200px;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .fighter-info h3 {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 0;
          line-height: 1.2;
        }

        .fighter-info .nickname {
          font-style: italic;
          opacity: 0.6;
          font-size: 0.85rem;
          margin: 0;
        }

        .fighter-info .country {
          opacity: 0.6;
          font-size: 0.85rem;
        }

        .fighter-info .record {
          font-size: 1rem;
          font-weight: 600;
          margin: 0.5rem 0;
        }

        .rankings-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin: 0.5rem 0;
        }

        .rank-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid;
        }

        .rank-badge.divisional {
          background: var(--div-rank-bg);
          color: #3b82f6;
          border-color: rgba(59, 130, 246, 0.3);
        }

        .dark .rank-badge.divisional {
          --div-rank-bg: rgba(59, 130, 246, 0.1);
        }

        .light .rank-badge.divisional {
          --div-rank-bg: rgba(59, 130, 246, 0.08);
        }

        .rank-badge.p4p {
          background: var(--p4p-bg);
          color: #fbbf24;
          border-color: rgba(251, 191, 36, 0.3);
        }

        .dark .rank-badge.p4p {
          --p4p-bg: rgba(251, 191, 36, 0.1);
        }

        .light .rank-badge.p4p {
          --p4p-bg: rgba(251, 191, 36, 0.08);
        }

        .user-labels {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-top: 0.5rem;
        }

        .user-label {
          color: #fff;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .vs-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding-top: 2rem;
        }

        .vs {
          font-size: 1.4rem;
          font-weight: 800;
          opacity: 0.4;
        }

        .compare-btn {
          background: var(--compare-bg);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 8px;
          padding: 0.5rem;
          color: #3b82f6;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dark .compare-btn {
          --compare-bg: rgba(59, 130, 246, 0.1);
        }

        .light .compare-btn {
          --compare-bg: rgba(59, 130, 246, 0.08);
        }

        .compare-btn:hover {
          background: rgba(59, 130, 246, 0.2);
          transform: scale(1.1);
        }

        .expand-btn {
          width: 100%;
          background: none;
          border: none;
          border-top: 1px solid var(--border-color);
          padding: 1rem;
          color: inherit;
          opacity: 0.6;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.3s ease;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .expand-btn:hover {
          background: var(--expand-hover);
          opacity: 1;
          color: #3b82f6;
        }

        .dark .expand-btn:hover {
          --expand-hover: rgba(59, 130, 246, 0.05);
        }

        .light .expand-btn:hover {
          --expand-hover: rgba(59, 130, 246, 0.03);
        }

        .expand-btn.collapse {
          border-top: none;
          border-bottom: 1px solid var(--border-color);
          margin-top: 2rem;
        }

        /* Fight Details */
        .fight-details {
          padding: 2rem 1.5rem;
          border-top: 1px solid var(--border-color);
        }

        .detailed-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }

        .fighter-details h4 {
          font-size: 1.1rem;
          margin: 0 0 1rem 0;
          font-weight: 600;
        }

        .fighter-details h5 {
          font-size: 0.9rem;
          margin: 1.5rem 0 0.75rem 0;
          color: #3b82f6;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.7;
          font-size: 0.85rem;
        }

        .stat svg {
          color: #3b82f6;
        }

        .recent-fights {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .fight-result {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: var(--result-bg);
          border-radius: 6px;
          font-size: 0.8rem;
        }

        .dark .fight-result {
          --result-bg: rgba(255, 255, 255, 0.02);
        }

        .light .fight-result {
          --result-bg: rgba(0, 0, 0, 0.02);
        }

        .fight-result.win {
          border-left: 3px solid #4ade80;
        }

        .fight-result.loss {
          border-left: 3px solid #ef4444;
        }

        .result-indicator {
          font-weight: 700;
          width: 20px;
          text-align: center;
        }

        .fight-result.win .result-indicator {
          color: #4ade80;
        }

        .fight-result.loss .result-indicator {
          color: #ef4444;
        }

        .fight-result .method {
          margin-left: auto;
          opacity: 0.5;
          font-size: 0.75rem;
        }

        .no-fights {
          opacity: 0.5;
          font-style: italic;
          text-align: center;
          padding: 1rem;
        }

        /* Comparison Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
          backdrop-filter: blur(8px);
        }

        .comparison-modal {
          background: var(--modal-bg);
          border: 1px solid var(--modal-border);
          border-radius: 20px;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          backdrop-filter: blur(20px);
          color: var(--modal-color);
        }

        .dark .comparison-modal {
          --modal-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          --modal-border: rgba(255, 255, 255, 0.1);
          --modal-color: #fff;
        }

        .light .comparison-modal {
          --modal-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
          --modal-border: rgba(0, 0, 0, 0.1);
          --modal-color: #1e293b;
        }

        .close-btn {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: var(--close-bg);
          border: none;
          border-radius: 8px;
          padding: 0.5rem;
          color: inherit;
          opacity: 0.6;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dark .close-btn {
          --close-bg: rgba(255, 255, 255, 0.1);
        }

        .light .close-btn {
          --close-bg: rgba(0, 0, 0, 0.1);
        }

        .close-btn:hover {
          opacity: 1;
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .comparison-title {
          text-align: center;
          font-size: 1.4rem;
          font-weight: 700;
          margin: 2rem 0;
        }

        .comparison-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3rem;
          padding: 2rem;
          border-bottom: 1px solid var(--border-color);
        }

        .fighter-summary {
          text-align: center;
        }

        .comparison-image-container {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          overflow: hidden;
          margin: 0 auto 1rem;
          border: 3px solid var(--image-border);
          background: var(--image-bg);
        }

        .comparison-image-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }

        .fighter-summary h3 {
          font-size: 1.1rem;
          margin: 0 0 0.25rem 0;
        }

        .fighter-summary p {
          opacity: 0.6;
          font-style: italic;
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
        }

        .fighter-summary .record {
          font-size: 1rem;
          font-weight: 600;
          color: #3b82f6;
        }

        .vs-divider {
          font-size: 1.4rem;
          font-weight: 800;
          opacity: 0.4;
        }

        .comparison-stats {
          padding: 2rem;
        }

        .stat-comparison {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 2rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: var(--stat-bg);
          border-radius: 8px;
        }

        .dark .stat-comparison {
          --stat-bg: rgba(255, 255, 255, 0.02);
        }

        .light .stat-comparison {
          --stat-bg: rgba(0, 0, 0, 0.02);
        }

        .stat-value {
          font-size: 1rem;
          font-weight: 600;
          opacity: 0.7;
          text-align: center;
        }

        .stat-value.better {
          color: #4ade80;
          opacity: 1;
        }

        .stat-label {
          opacity: 0.5;
          font-size: 0.85rem;
          text-align: center;
          min-width: 120px;
        }

        .recent-fights-comparison {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          padding: 2rem;
          border-top: 1px solid var(--border-color);
        }

        .recent-fights-comparison h4 {
          font-size: 1rem;
          margin: 0 0 1rem 0;
          text-align: center;
        }

        /* Loading and Error States */
        .loading-container, .error-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          text-align: center;
          padding: 2rem;
        }

        .loading-container.dark, .error-container.dark {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          color: #fff;
        }

        .loading-container.light, .error-container.light {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
          color: #1e293b;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid var(--spinner-track);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .dark .spinner {
          --spinner-track: rgba(255, 255, 255, 0.1);
        }

        .light .spinner {
          --spinner-track: rgba(0, 0, 0, 0.1);
        }

        .error-container svg {
          color: #ef4444;
          margin-bottom: 1rem;
        }

        .error-container h3 {
          color: #ef4444;
          margin-bottom: 1rem;
        }

        .error-container p {
          opacity: 0.7;
          margin-bottom: 2rem;
        }

        .error-container button {
          background: #ef4444;
          color: #fff;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .error-container button:hover {
          background: #dc2626;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            text-align: center;
            padding: 1.5rem 1rem;
          }

          .header-content h1 {
            font-size: 2rem;
          }

          .header-controls {
            width: 100%;
            justify-content: center;
          }

          .countdown-timer {
            width: 100%;
            justify-content: center;
            padding: 1rem 1.5rem;
          }

          .time-unit .value {
            font-size: 1.5rem;
          }

          .controls-section {
            padding: 1rem;
          }

          .search-bar {
            max-width: none;
          }

          .filters-panel {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }

          .legend {
            margin-left: 0;
            justify-content: center;
          }

          .events-container {
            padding: 1rem;
          }

          .event-header {
            flex-direction: column;
            text-align: center;
            gap: 1rem;
            padding: 1rem;
          }

          .fights-grid {
            grid-template-columns: 1fr;
          }

          .fight-matchup {
            flex-direction: column;
            gap: 1rem;
            padding: 1.5rem 1rem;
          }

          .vs-section {
            transform: rotate(90deg);
            margin: 1rem 0;
          }

          .fighter-image-container {
            width: 100px;
            height: 100px;
          }

          .detailed-stats {
            grid-template-columns: 1fr;
          }

          .comparison-header {
            flex-direction: column;
            gap: 1rem;
          }

          .vs-divider {
            transform: rotate(90deg);
          }

          .stat-comparison {
            grid-template-columns: 1fr;
            text-align: center;
          }

          .stat-value:first-child {
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.5rem;
          }

          .stat-value:last-child {
            border-top: 1px solid var(--border-color);
            padding-top: 0.5rem;
          }

          .recent-fights-comparison {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .fight-card {
            border-radius: 16px;
          }

          .fight-card-header {
            padding: 0.75rem 1rem;
          }

          .fighter-info h3 {
            font-size: 1rem;
          }

          .comparison-modal {
            border-radius: 16px;
            margin: 1rem;
          }

          .event-title-container {
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
          }
        }
      `}
      </style>
    </div>
  );
};

export default UpcomingFights;