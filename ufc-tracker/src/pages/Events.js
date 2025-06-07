import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, MapPin, TrendingUp, Shield, Target, BarChart3, Sun, Moon, ChevronDown, ChevronUp, Users, Trophy, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getEventData } from '../api/supabaseQueries';
import countryCodes from '../utils/countryCodes';

const Events = () => {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [expandedFights, setExpandedFights] = useState(new Set());
  const [darkMode, setDarkMode] = useState(true);
  const [bettingCardPages, setBettingCardPages] = useState({});

  useEffect(() => {
    const fetchFights = async () => {
      try {
        setLoading(true);
        
        try {
          const data = await getEventData();
          // Filter to only show events within 3 days of today or future events
          const today = new Date();
          const threeDaysAgo = new Date(today);
          threeDaysAgo.setDate(today.getDate() - 3);
          
          const filteredData = (data || []).filter(fight => {
            const eventDate = new Date(fight.event_date);
            return eventDate >= threeDaysAgo;
          });
          
          setFights(filteredData);
          setError(null);
        } catch (queryError) {
          console.log('getEventData failed, falling back to direct query:', queryError);
          
          const { data, error } = await supabase
            .from('upcoming_fights')
            .select(`
              *,
              fighter1:fighter1_id (
                id, name, image_url, nickname, age, height, weight, reach, country,
                wins_total, losses_total, wins_ko, wins_sub, wins_dec,
                losses_ko, losses_sub, losses_dec, avg_fight_time,
                strikes_landed_per_min, striking_defense, takedown_avg
              ),
              fighter2:fighter2_id (
                id, name, image_url, nickname, age, height, weight, reach, country,
                wins_total, losses_total, wins_ko, wins_sub, wins_dec,
                losses_ko, losses_sub, losses_dec, avg_fight_time,
                strikes_landed_per_min, striking_defense, takedown_avg
              )
            `)
            .order('event_date')
            .order('fight_order', { ascending: false });

          if (error) throw error;
          
          // Filter past events
          const today = new Date();
          const threeDaysAgo = new Date(today);
          threeDaysAgo.setDate(today.getDate() - 3);
          
          const filteredData = (data || []).filter(fight => {
            const eventDate = new Date(fight.event_date);
            return eventDate >= threeDaysAgo;
          });
          
          setFights(filteredData);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching fights:', err);
        setError(`Failed to load events: ${err.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFights();
  }, []);

  // Group fights by event
  const groupedEvents = useMemo(() => {
    return fights.reduce((acc, fight) => {
      const key = `${fight.event} | ${fight.event_date}`;
      if (!acc[key]) {
        acc[key] = {
          info: {
            name: fight.event,
            date: fight.event_date,
            time: fight.event_time,
            type: fight.event_type,
            location: fight.location
          },
          fights: []
        };
      }
      acc[key].fights.push(fight);
      return acc;
    }, {});
  }, [fights]);

  // Sort events by date
  const sortedEvents = useMemo(() => {
    return Object.entries(groupedEvents).sort(([, a], [, b]) => 
      new Date(a.info.date) - new Date(b.info.date)
    );
  }, [groupedEvents]);

  const toggleEvent = (eventKey) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventKey)) {
        newSet.delete(eventKey);
        // Also collapse all fights in this event
        groupedEvents[eventKey]?.fights.forEach(fight => {
          setExpandedFights(prevFights => {
            const newFightsSet = new Set(prevFights);
            newFightsSet.delete(fight.id);
            return newFightsSet;
          });
        });
      } else {
        newSet.add(eventKey);
      }
      return newSet;
    });
  };

  const toggleFight = (fightId) => {
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

  const getMainEvent = (fights) => {
    return fights.reduce((main, fight) => {
      if (!main || (fight.fight_order || 0) > (main.fight_order || 0)) {
        return fight;
      }
      return main;
    }, null);
  };

  const isPPV = (eventName, eventType) => {
    return eventType?.toLowerCase().includes('ppv') || 
           (eventName.toLowerCase().includes('ufc ') && /ufc \d+/.test(eventName.toLowerCase()));
  };

  const isChampionshipFight = (fight) => {
    const f1 = fight.fighter1_data || fight.fighter1;
    const f2 = fight.fighter2_data || fight.fighter2;
    
    const hasChampionRank = (f1?.rankings && f1.rankings.some(r => r.rank === 'C')) ||
                           (f2?.rankings && f2.rankings.some(r => r.rank === 'C'));
    
    const hasTitleInName = fight.event?.toLowerCase().includes('title') ||
                          fight.fighter1?.toLowerCase().includes('title') ||
                          fight.fighter2?.toLowerCase().includes('title');
    
    return hasChampionRank || hasTitleInName;
  };

  const isChampionshipEvent = (fights) => {
    return fights.some(fight => isChampionshipFight(fight));
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

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.wins_total || 0;
    const losses = fighter.losses_total || 0;
    return `${wins}-${losses}`;
  };

  const getDivisionFromWeight = (weightClass, fighter1, fighter2) => {
    if (!weightClass || weightClass === 'TBA') return 'TBA';
    
    // First try to get division from fighters' rankings
    const f1Division = fighter1?.rankings?.find(r => !r.division?.toLowerCase().includes('pound-for-pound'))?.division;
    const f2Division = fighter2?.rankings?.find(r => !r.division?.toLowerCase().includes('pound-for-pound'))?.division;
    
    if (f1Division && f2Division && f1Division === f2Division) return f1Division;
    if (f1Division && !f2Division) return f1Division;
    if (f2Division && !f1Division) return f2Division;
    
    // Fallback to weight mapping
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
    
    // Check if either fighter has "women's" in their division
    const hasWomensDiv = (f1Division && f1Division.toLowerCase().includes("women's")) || 
                        (f2Division && f2Division.toLowerCase().includes("women's"));
    
    if (hasWomensDiv && !division.toLowerCase().includes("women's")) {
      const womensMap = {
        'Flyweight': "Women's Flyweight",
        'Bantamweight': "Women's Bantamweight",
        'Featherweight': "Women's Featherweight"
      };
      division = womensMap[division] || `Women's ${division}`;
    }
    
    return division;
  };

  const getFinishRates = (fighter) => {
    if (!fighter) return { ko: 0, sub: 0, dec: 0 };
    
    const totalWins = fighter.wins_total || 0;
    if (totalWins === 0) return { ko: 0, sub: 0, dec: 0 };
    
    const koRate = Math.round(((fighter.wins_ko || 0) / totalWins) * 100);
    const subRate = Math.round(((fighter.wins_sub || 0) / totalWins) * 100);
    const decRate = Math.round(((fighter.wins_dec || 0) / totalWins) * 100);
    
    return { ko: koRate, sub: subRate, dec: decRate };
  };

  const formatStat = (value, decimals = 1, suffix = '') => {
    if (!value) return 'N/A';
    
    if (typeof value === 'string' && value.includes('(')) {
      return value;
    }
    
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return num.toFixed(decimals) + suffix;
    }
    
    return value.toString();
  };

  const getRecentFights = (fighter, limit = 3) => {
    if (!fighter?.fight_history) return [];
    return fighter.fight_history
      .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date))
      .slice(0, limit);
  };

  const groupFightsBySection = (fights) => {
    const sections = {
      'Main': [],
      'Prelim': [],
      'Early Prelims': []
    };
    
    fights.forEach(fight => {
      const section = fight.card_section || 'Prelim';
      if (section === 'Main') {
        sections['Main'].push(fight);
      } else if (section === 'Prelim') {
        sections['Prelim'].push(fight);
      } else {
        sections['Early Prelims'].push(fight);
      }
    });
    
    // Sort fights within each section by fight order (higher numbers first)
    Object.values(sections).forEach(sectionFights => {
      sectionFights.sort((a, b) => (b.fight_order || 0) - (a.fight_order || 0));
    });
    
    return sections;
  };

  const changeBettingPage = (fightId, direction) => {
    setBettingCardPages(prev => {
      const currentPage = prev[fightId] || 0;
      const newPage = direction === 'next' ? 
        (currentPage + 1) % 3 : 
        currentPage === 0 ? 2 : currentPage - 1;
      
      return {
        ...prev,
        [fightId]: newPage
      };
    });
  };

  const BettingCard = ({ fighter, fightId, side }) => {
    const currentPage = bettingCardPages[fightId] || 0;
    const finishes = getFinishRates(fighter);
    const recentFights = getRecentFights(fighter);
    
    const pages = [
      // Page 0: Betting Stats
      {
        title: `${fighter.name} - Betting Stats`,
        content: (
          <div className="stats-grid">
            <div className="stat-item">
              <Zap size={14} />
              <span>Finish Rate</span>
              <span className="stat-value">{finishes.ko + finishes.sub}%</span>
            </div>
            <div className="stat-item">
              <Target size={14} />
              <span>KO Rate</span>
              <span className="stat-value">{finishes.ko}%</span>
            </div>
            <div className="stat-item">
              <Shield size={14} />
              <span>Sub Rate</span>
              <span className="stat-value">{finishes.sub}%</span>
            </div>
            <div className="stat-item">
              <Clock size={14} />
              <span>Avg Fight Time</span>
              <span className="stat-value">{formatStat(fighter.avg_fight_time)} min</span>
            </div>
            <div className="stat-item">
              <TrendingUp size={14} />
              <span>Strikes/Min</span>
              <span className="stat-value">{formatStat(fighter.strikes_landed_per_min)}</span>
            </div>
            <div className="stat-item">
              <BarChart3 size={14} />
              <span>Strike Defense</span>
              <span className="stat-value">{formatStat(fighter.striking_defense)}</span>
            </div>
          </div>
        )
      },
      // Page 1: Fight History
      {
        title: `${fighter.name} - Fight History`,
        content: (
          <div className="fight-history">
            {recentFights.length > 0 ? recentFights.map((fight, idx) => (
              <div key={idx} className={`fight-result ${fight.result?.toLowerCase() || ''}`}>
                <span className="result-indicator">{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
                <div className="fight-details">
                  <span className="opponent">{fight.opponent || 'Unknown'}</span>
                  <span className="method">{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                  <span className="round-time">
                    {fight.round && fight.time ? `R${fight.round} ${fight.time}` : 'N/A'}
                  </span>
                </div>
              </div>
            )) : (
              <div className="no-fights">No recent fights available</div>
            )}
          </div>
        )
      },
      // Page 2: Physical Stats
      {
        title: `${fighter.name} - Physical`,
        content: (
          <div className="physical-stats-detailed">
            <div className="physical-stat">
              <span className="label">Age</span>
              <span className="value">{fighter.age || 'N/A'}</span>
            </div>
            <div className="physical-stat">
              <span className="label">Height</span>
              <span className="value">{fighter.height ? `${fighter.height}"` : 'N/A'}</span>
            </div>
            <div className="physical-stat">
              <span className="label">Reach</span>
              <span className="value">{fighter.reach ? `${fighter.reach}"` : 'N/A'}</span>
            </div>
            <div className="physical-stat">
              <span className="label">Weight</span>
              <span className="value">{fighter.weight ? `${fighter.weight} lbs` : 'N/A'}</span>
            </div>
            <div className="physical-stat">
              <span className="label">Country</span>
              <span className="value">
                {countryCodes[fighter.country]} {fighter.country || 'N/A'}
              </span>
            </div>
            <div className="physical-stat">
              <span className="label">Record</span>
              <span className="value">{formatRecord(fighter)}</span>
            </div>
          </div>
        )
      }
    ];

    return (
      <div className="betting-card">
        <div className="betting-card-header">
          <h5>{pages[currentPage].title}</h5>
          <div className="card-navigation">
            <button 
              className="nav-btn"
              onClick={() => changeBettingPage(fightId, 'prev')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="page-indicator">{currentPage + 1}/3</span>
            <button 
              className="nav-btn"
              onClick={() => changeBettingPage(fightId, 'next')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="betting-card-content">
          {pages[currentPage].content}
        </div>
      </div>
    );
  };

  const EventCard = ({ eventKey, eventData, isExpanded }) => {
    const mainEvent = getMainEvent(eventData.fights);
    const eventIsPPV = isPPV(eventData.info.name, eventData.info.type);
    const fightsCount = eventData.fights.length;
    const isChampionship = isChampionshipEvent(eventData.fights);
    const sectionedFights = groupFightsBySection(eventData.fights);
    
    return (
      <div className="event-card">
        <div 
          className={`event-header ${eventIsPPV ? 'ppv-event' : 'fight-night-event'} ${isChampionship ? 'championship-event' : ''}`}
          onClick={() => toggleEvent(eventKey)}
        >
          <div className="event-main-content">
            <div className="event-info">
              <div className="event-title-container">
                <h2 className="event-title">{eventData.info.name}</h2>
                {eventIsPPV && <span className="ppv-badge">PPV</span>}
                {isChampionship && <span className="championship-badge">👑 TITLE</span>}
              </div>
              
              <div className="event-meta">
                <div className="meta-item">
                  <Calendar size={16} />
                  <span>{formatDate(eventData.info.date)}</span>
                </div>
                <div className="meta-item">
                  <Clock size={16} />
                  <span>{formatTime(eventData.info.time)}</span>
                </div>
                {eventData.info.location && (
                  <div className="meta-item">
                    <MapPin size={16} />
                    <span>{eventData.info.location}</span>
                  </div>
                )}
              </div>
            </div>

            {mainEvent && (
              <div className="main-event-preview">
                <div className="main-event-label">Main Event</div>
                <div className="fighters-preview">
                  <div className="fighter-preview">
                    <img
                      src={(mainEvent.fighter1_data || mainEvent.fighter1)?.image_url || '/static/images/placeholder.jpg'}
                      alt={(mainEvent.fighter1_data || mainEvent.fighter1)?.name || 'Fighter 1'}
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                          ((mainEvent.fighter1_data || mainEvent.fighter1)?.name?.charAt(0) || '?');
                      }}
                    />
                    <div className="fighter-info">
                      <h4>{(mainEvent.fighter1_data || mainEvent.fighter1)?.name || 'TBA'}</h4>
                      <span className="record">{formatRecord(mainEvent.fighter1_data || mainEvent.fighter1)}</span>
                    </div>
                  </div>
                  
                  <div className="vs-section">
                    <span className="vs">VS</span>
                    <span className="weight-class">
                      {getDivisionFromWeight(mainEvent.weight_class, mainEvent.fighter1_data || mainEvent.fighter1, mainEvent.fighter2_data || mainEvent.fighter2)}
                    </span>
                  </div>
                  
                  <div className="fighter-preview">
                    <img
                      src={(mainEvent.fighter2_data || mainEvent.fighter2)?.image_url || '/static/images/placeholder.jpg'}
                      alt={(mainEvent.fighter2_data || mainEvent.fighter2)?.name || 'Fighter 2'}
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                          ((mainEvent.fighter2_data || mainEvent.fighter2)?.name?.charAt(0) || '?');
                      }}
                    />
                    <div className="fighter-info">
                      <h4>{(mainEvent.fighter2_data || mainEvent.fighter2)?.name || 'TBA'}</h4>
                      <span className="record">{formatRecord(mainEvent.fighter2_data || mainEvent.fighter2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="event-actions">
            <div className="fights-count">
              <Users size={16} />
              <span>{fightsCount} fights</span>
            </div>
            <button className="expand-btn">
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="fights-sections">
            {Object.entries(sectionedFights).map(([sectionName, sectionFights]) => (
              sectionFights.length > 0 && (
                <div key={sectionName} className="fight-section">
                  <div className="section-header">
                    <h3 className="section-title">{sectionName}</h3>
                    <div className="section-divider"></div>
                  </div>
                  
                  <div className="fights-list">
                    {sectionFights.map(fight => (
                      <FightCard 
                        key={fight.id} 
                        fight={fight} 
                        isExpanded={expandedFights.has(fight.id)}
                        onToggle={() => toggleFight(fight.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            ))}
            
            <div className="collapse-bottom">
              <button 
                className="collapse-btn"
                onClick={() => toggleEvent(eventKey)}
              >
                <span>Collapse</span>
                <ChevronUp size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const FightCard = ({ fight, isExpanded, onToggle }) => {
    const f1 = fight.fighter1_data || fight.fighter1;
    const f2 = fight.fighter2_data || fight.fighter2;
    
    if (!f1 || !f2) {
      return (
        <div className="fight-card error-card">
          <p>Fighter data unavailable</p>
        </div>
      );
    }

    const isChampionship = isChampionshipFight(fight);
    const division = getDivisionFromWeight(fight.weight_class, f1, f2);

    return (
      <div className={`fight-card ${isChampionship ? 'championship-fight' : ''}`}>
        <div className="fight-header" onClick={onToggle}>
          <div className="fight-main-info">
            <div className="fight-meta">
              <span className="card-section">{fight.card_section || 'TBA'}</span>
              <span className="fight-time">{formatTime(fight.event_time)}</span>
              {isChampionship && <span className="championship-indicator">👑</span>}
            </div>
            
            <div className="fighters-matchup">
              <div className="fighter-summary">
                <img
                  src={f1.image_url || '/static/images/placeholder.jpg'}
                  alt={f1.name}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/50x50/cccccc/666666?text=' + 
                      (f1.name?.charAt(0) || '?');
                  }}
                />
                <div className="fighter-details">
                  <h4>{f1.name}</h4>
                  <span className="record">{formatRecord(f1)}</span>
                  <div className="country">
                    {countryCodes[f1.country]} {f1.country}
                  </div>
                </div>
              </div>
              
              <div className="fight-vs">
                <span className="vs">VS</span>
                <span className="weight">{division}</span>
              </div>
              
              <div className="fighter-summary">
                <img
                  src={f2.image_url || '/static/images/placeholder.jpg'}
                  alt={f2.name}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/50x50/cccccc/666666?text=' + 
                      (f2.name?.charAt(0) || '?');
                  }}
                />
                <div className="fighter-details">
                  <h4>{f2.name}</h4>
                  <span className="record">{formatRecord(f2)}</span>
                  <div className="country">
                    {countryCodes[f2.country]} {f2.country}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button className="fight-expand-btn">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {isExpanded && (
          <div className="fight-details">
            <div className="fighters-comparison">
              <BettingCard fighter={f1} fightId={fight.id} side="left" />
              
              <div className="vs-divider">
                <Trophy size={24} />
              </div>

              <BettingCard fighter={f2} fightId={fight.id} side="right" />
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`events-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading upcoming events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`events-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="error-state">
          <h3>Error Loading Events</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (fights.length === 0) {
    return (
      <div className={`events-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="empty-state">
          <h3>No Upcoming Events</h3>
          <p>Check back later for new fight announcements!</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`events-container ${darkMode ? 'dark' : 'light'}`}>
      <header className="page-header">
        <div className="header-content">
          <h1>🥊 UFC Events</h1>
          <p>Complete fight cards and betting insights</p>
        </div>
        
        <button 
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
          title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      <div className="events-list">
        {sortedEvents.map(([eventKey, eventData]) => (
          <EventCard 
            key={eventKey}
            eventKey={eventKey}
            eventData={eventData}
            isExpanded={expandedEvents.has(eventKey)}
          />
        ))}
      </div>

      <style jsx>{`
        .events-container {
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: all 0.3s ease;
        }

        .events-container.dark {
          background: linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #2d2d2d 100%);
          color: #ffffff;
        }

        .events-container.light {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%);
          color: #1a1a1a;
        }

        /* Header */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2rem;
          border-bottom: 1px solid var(--border-color);
          backdrop-filter: blur(10px);
        }

        .dark .page-header {
          --border-color: rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.03) 0%, rgba(255, 215, 0, 0.01) 100%);
        }

        .light .page-header {
          --border-color: rgba(0, 0, 0, 0.1);
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 215, 0, 0.02) 100%);
        }

        .header-content h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
        }

        .dark .header-content h1 {
          background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .light .header-content h1 {
          color: #1a1a1a;
        }

        .header-content p {
          font-size: 1.1rem;
          margin: 0;
          opacity: 0.7;
        }

        .theme-toggle {
          background: var(--toggle-bg);
          border: 1px solid var(--toggle-border);
          border-radius: 12px;
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--toggle-color);
        }

        .dark .theme-toggle {
          --toggle-bg: rgba(255, 215, 0, 0.1);
          --toggle-border: rgba(255, 215, 0, 0.3);
          --toggle-color: #FFD700;
        }

        .light .theme-toggle {
          --toggle-bg: rgba(0, 0, 0, 0.05);
          --toggle-border: rgba(0, 0, 0, 0.1);
          --toggle-color: #1a1a1a;
        }

        .theme-toggle:hover {
          transform: scale(1.1);
          background: var(--toggle-hover);
        }

        .dark .theme-toggle:hover {
          --toggle-hover: rgba(255, 215, 0, 0.2);
        }

        .light .theme-toggle:hover {
          --toggle-hover: rgba(0, 0, 0, 0.1);
        }

        /* Events List */
        .events-list {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        /* Event Card */
        .event-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(10px);
        }

        .dark .event-card {
          --card-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          --card-border: rgba(255, 215, 0, 0.2);
        }

        .light .event-card {
          --card-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
          --card-border: rgba(0, 0, 0, 0.1);
        }

        .event-card:hover {
          border-color: var(--card-hover-border);
          box-shadow: 0 20px 40px var(--card-shadow);
          transform: translateY(-4px);
        }

        .dark .event-card:hover {
          --card-hover-border: #FFD700;
          --card-shadow: rgba(255, 215, 0, 0.2);
        }

        .light .event-card:hover {
          --card-hover-border: rgba(0, 0, 0, 0.2);
          --card-shadow: rgba(0, 0, 0, 0.15);
        }

        .event-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2rem;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .event-header.ppv-event::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #FFD700, #FFA500, #FFD700);
        }

        .event-header.fight-night-event::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #C0C0C0, #A0A0A0, #C0C0C0);
        }

        .event-header.championship-event::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #FFD700, #FFA500, #FFD700);
          box-shadow: 0 2px 8px rgba(255, 215, 0, 0.5);
        }

        .event-header:hover {
          background: var(--header-hover);
        }

        .dark .event-header:hover {
          --header-hover: rgba(255, 215, 0, 0.05);
        }

        .light .event-header:hover {
          --header-hover: rgba(0, 0, 0, 0.02);
        }

        .event-main-content {
          display: flex;
          gap: 3rem;
          align-items: center;
          flex: 1;
        }

        .event-info {
          min-width: 300px;
        }

        .event-title-container {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .event-title {
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0;
          color: var(--title-color);
        }

        .dark .event-title {
          --title-color: #FFD700;
        }

        .light .event-title {
          --title-color: #1a1a1a;
        }

        .ppv-badge {
          background: linear-gradient(45deg, #FFD700, #FFA500);
          color: #000;
          padding: 0.3rem 0.8rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
        }

        .championship-badge {
          background: linear-gradient(45deg, #FFD700, #FFA500);
          color: #000;
          padding: 0.3rem 0.8rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
        }

        .event-meta {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.7;
          font-size: 0.95rem;
        }

        .meta-item svg {
          color: var(--meta-icon-color);
        }

        .dark .meta-item svg {
          --meta-icon-color: #FFD700;
        }

        .light .meta-item svg {
          --meta-icon-color: #1a1a1a;
        }

        /* Main Event Preview */
        .main-event-preview {
          flex: 1;
          max-width: 600px;
        }

        .main-event-label {
          text-align: center;
          font-size: 0.9rem;
          color: var(--main-event-label);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 1rem;
        }

        .dark .main-event-label {
          --main-event-label: #FFD700;
        }

        .light .main-event-label {
          --main-event-label: #1a1a1a;
        }

        .fighters-preview {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .fighter-preview {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
        }

        .fighter-preview img {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--image-border);
        }

        .dark .fighter-preview img {
          --image-border: rgba(255, 215, 0, 0.3);
        }

        .light .fighter-preview img {
          --image-border: rgba(0, 0, 0, 0.1);
        }

        .fighter-info h4 {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0 0 0.25rem 0;
        }

        .fighter-info .record {
          font-size: 0.9rem;
          opacity: 0.7;
        }

        .vs-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          min-width: 80px;
        }

        .vs {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--vs-color);
        }

        .dark .vs {
          --vs-color: #FFD700;
        }

        .light .vs {
          --vs-color: #1a1a1a;
        }

        .weight-class {
          font-size: 0.8rem;
          opacity: 0.6;
          text-align: center;
        }

        .event-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .fights-count {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--count-bg);
          color: var(--count-color);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          border: 1px solid var(--count-border);
        }

        .dark .fights-count {
          --count-bg: rgba(255, 215, 0, 0.1);
          --count-color: #FFD700;
          --count-border: rgba(255, 215, 0, 0.3);
        }

        .light .fights-count {
          --count-bg: rgba(0, 0, 0, 0.05);
          --count-color: #1a1a1a;
          --count-border: rgba(0, 0, 0, 0.1);
        }

        .expand-btn {
          background: var(--expand-bg);
          border: 1px solid var(--expand-border);
          border-radius: 8px;
          padding: 0.5rem;
          color: var(--expand-color);
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dark .expand-btn {
          --expand-bg: rgba(255, 215, 0, 0.1);
          --expand-color: #FFD700;
          --expand-border: rgba(255, 215, 0, 0.3);
        }

        .light .expand-btn {
          --expand-bg: rgba(0, 0, 0, 0.05);
          --expand-color: #1a1a1a;
          --expand-border: rgba(0, 0, 0, 0.1);
        }

        .expand-btn:hover {
          background: var(--expand-hover);
          transform: scale(1.1);
        }

        .dark .expand-btn:hover {
          --expand-hover: rgba(255, 215, 0, 0.2);
        }

        .light .expand-btn:hover {
          --expand-hover: rgba(0, 0, 0, 0.1);
        }

        /* Fight Sections */
        .fights-sections {
          border-top: 1px solid var(--border-color);
          background: var(--sections-bg);
        }

        .dark .fights-sections {
          --sections-bg: rgba(0, 0, 0, 0.2);
        }

        .light .fights-sections {
          --sections-bg: rgba(0, 0, 0, 0.02);
        }

        .fight-section {
          border-bottom: 1px solid var(--border-color);
        }

        .fight-section:last-of-type {
          border-bottom: none;
        }

        .section-header {
          padding: 1.5rem 2rem 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .section-title {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0;
          color: var(--section-title-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          min-width: 120px;
        }

        .dark .section-title {
          --section-title-color: #FFD700;
        }

        .light .section-title {
          --section-title-color: #1a1a1a;
        }

        .section-divider {
          flex: 1;
          height: 2px;
          background: var(--divider-bg);
          border-radius: 1px;
        }

        .dark .section-divider {
          --divider-bg: rgba(255, 215, 0, 0.3);
        }

        .light .section-divider {
          --divider-bg: rgba(0, 0, 0, 0.1);
        }

        /* Fights List */
        .fights-list {
          padding: 0 2rem 1rem;
        }

        /* Fight Card */
        .fight-card {
          border-bottom: 1px solid var(--border-color);
          transition: all 0.3s ease;
          border-radius: 12px;
          margin-bottom: 1rem;
          background: var(--fight-card-bg);
        }

        .dark .fight-card {
          --fight-card-bg: rgba(255, 255, 255, 0.02);
        }

        .light .fight-card {
          --fight-card-bg: rgba(255, 255, 255, 0.5);
        }

        .fight-card:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }

        .fight-card:hover {
          background: var(--fight-hover);
        }

        .dark .fight-card:hover {
          --fight-hover: rgba(255, 215, 0, 0.03);
        }

        .light .fight-card:hover {
          --fight-hover: rgba(0, 0, 0, 0.02);
        }

        .fight-card.championship-fight {
          border: 2px solid #FFD700;
          box-shadow: 0 4px 20px rgba(255, 215, 0, 0.2);
        }

        .fight-card.error-card {
          background: var(--error-bg);
          border-color: #ef4444;
          color: #ef4444;
          text-align: center;
          padding: 2rem;
        }

        .dark .fight-card.error-card {
          --error-bg: rgba(239, 68, 68, 0.1);
        }

        .light .fight-card.error-card {
          --error-bg: rgba(239, 68, 68, 0.05);
        }

        .fight-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem 2rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .fight-main-info {
          flex: 1;
        }

        .fight-meta {
          display: flex;
          gap: 2rem;
          margin-bottom: 1rem;
          font-size: 0.9rem;
          align-items: center;
        }

        .card-section {
          background: linear-gradient(45deg, #FFD700, #FFA500);
          color: #000;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8rem;
        }

        .fight-time {
          opacity: 0.6;
          font-weight: 500;
        }

        .championship-indicator {
          font-size: 1.2rem;
          margin-left: 0.5rem;
        }

        .fighters-matchup {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .fighter-summary {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
        }

        .fighter-summary img {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--image-border);
        }

        .fighter-details h4 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 0.25rem 0;
        }

        .fighter-details .record {
          font-size: 0.85rem;
          opacity: 0.7;
          margin: 0 0 0.25rem 0;
        }

        .fighter-details .country {
          font-size: 0.8rem;
          opacity: 0.6;
        }

        .fight-vs {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          min-width: 80px;
        }

        .fight-vs .vs {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--vs-color);
        }

        .fight-vs .weight {
          font-size: 0.8rem;
          opacity: 0.6;
          text-align: center;
        }

        .fight-expand-btn {
          background: var(--expand-bg);
          border: 1px solid var(--expand-border);
          border-radius: 6px;
          padding: 0.5rem;
          color: var(--expand-color);
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
        }

        .fight-expand-btn:hover {
          opacity: 1;
          background: var(--expand-hover);
        }

        /* Fight Details */
        .fight-details {
          padding: 2rem;
          border-top: 1px solid var(--border-color);
          background: var(--details-bg);
        }

        .dark .fight-details {
          --details-bg: rgba(0, 0, 0, 0.1);
        }

        .light .fight-details {
          --details-bg: rgba(0, 0, 0, 0.02);
        }

        .fighters-comparison {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 3rem;
          align-items: start;
        }

        /* Betting Cards */
        .betting-card {
          background: var(--betting-bg);
          border: 1px solid var(--betting-border);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .dark .betting-card {
          --betting-bg: rgba(255, 215, 0, 0.05);
          --betting-border: rgba(255, 215, 0, 0.2);
        }

        .light .betting-card {
          --betting-bg: rgba(255, 255, 255, 0.8);
          --betting-border: rgba(0, 0, 0, 0.1);
        }

        .betting-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: var(--betting-header-bg);
          border-bottom: 1px solid var(--betting-border);
        }

        .dark .betting-card-header {
          --betting-header-bg: rgba(255, 215, 0, 0.1);
        }

        .light .betting-card-header {
          --betting-header-bg: rgba(0, 0, 0, 0.03);
        }

        .betting-card-header h5 {
          font-size: 1rem;
          margin: 0;
          color: var(--betting-title-color);
          font-weight: 600;
        }

        .dark .betting-card-header h5 {
          --betting-title-color: #FFD700;
        }

        .light .betting-card-header h5 {
          --betting-title-color: #1a1a1a;
        }

        .card-navigation {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-btn {
          background: var(--nav-btn-bg);
          border: 1px solid var(--nav-btn-border);
          border-radius: 4px;
          padding: 0.25rem;
          color: var(--nav-btn-color);
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dark .nav-btn {
          --nav-btn-bg: rgba(255, 215, 0, 0.1);
          --nav-btn-border: rgba(255, 215, 0, 0.3);
          --nav-btn-color: #FFD700;
        }

        .light .nav-btn {
          --nav-btn-bg: rgba(0, 0, 0, 0.05);
          --nav-btn-border: rgba(0, 0, 0, 0.1);
          --nav-btn-color: #1a1a1a;
        }

        .nav-btn:hover {
          background: var(--nav-btn-hover);
          transform: scale(1.1);
        }

        .dark .nav-btn:hover {
          --nav-btn-hover: rgba(255, 215, 0, 0.2);
        }

        .light .nav-btn:hover {
          --nav-btn-hover: rgba(0, 0, 0, 0.1);
        }

        .page-indicator {
          font-size: 0.8rem;
          opacity: 0.7;
          min-width: 30px;
          text-align: center;
        }

        .betting-card-content {
          padding: 1.5rem;
        }

        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .stat-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          background: var(--stat-bg);
          border-radius: 8px;
          border: 1px solid var(--stat-border);
          transition: all 0.3s ease;
        }

        .dark .stat-item {
          --stat-bg: rgba(255, 215, 0, 0.05);
          --stat-border: rgba(255, 215, 0, 0.1);
        }

        .light .stat-item {
          --stat-bg: rgba(0, 0, 0, 0.02);
          --stat-border: rgba(0, 0, 0, 0.05);
        }

        .stat-item:hover {
          background: var(--stat-hover);
        }

        .dark .stat-item:hover {
          --stat-hover: rgba(255, 215, 0, 0.1);
        }

        .light .stat-item:hover {
          --stat-hover: rgba(0, 0, 0, 0.05);
        }

        .stat-item svg {
          color: var(--stat-icon-color);
        }

        .dark .stat-item svg {
          --stat-icon-color: #FFD700;
        }

        .light .stat-item svg {
          --stat-icon-color: #1a1a1a;
        }

        .stat-item span:nth-child(2) {
          flex: 1;
          margin-left: 0.5rem;
          font-size: 0.9rem;
        }

        .stat-value {
          font-weight: 600;
          color: var(--stat-value-color);
          font-size: 0.9rem;
        }

        .dark .stat-value {
          --stat-value-color: #FFD700;
        }

        .light .stat-value {
          --stat-value-color: #1a1a1a;
        }

        /* Fight History */
        .fight-history {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .fight-result {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: var(--result-bg);
          border-radius: 8px;
          border-left: 3px solid transparent;
        }

        .dark .fight-result {
          --result-bg: rgba(255, 255, 255, 0.02);
        }

        .light .fight-result {
          --result-bg: rgba(0, 0, 0, 0.02);
        }

        .fight-result.win {
          border-left-color: #4ade80;
        }

        .fight-result.loss {
          border-left-color: #ef4444;
        }

        .result-indicator {
          font-weight: 700;
          width: 20px;
          text-align: center;
          font-size: 0.9rem;
        }

        .fight-result.win .result-indicator {
          color: #4ade80;
        }

        .fight-result.loss .result-indicator {
          color: #ef4444;
        }

        .fight-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }

        .fight-result .opponent {
          font-weight: 600;
          font-size: 0.9rem;
        }

        .fight-result .method {
          opacity: 0.7;
          font-size: 0.8rem;
        }

        .fight-result .round-time {
          opacity: 0.6;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .no-fights {
          opacity: 0.5;
          font-style: italic;
          text-align: center;
          padding: 2rem;
        }

        /* Physical Stats */
        .physical-stats-detailed {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .physical-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: var(--physical-bg);
          border-radius: 8px;
          border: 1px solid var(--physical-border);
        }

        .dark .physical-stat {
          --physical-bg: rgba(255, 215, 0, 0.05);
          --physical-border: rgba(255, 215, 0, 0.1);
        }

        .light .physical-stat {
          --physical-bg: rgba(0, 0, 0, 0.02);
          --physical-border: rgba(0, 0, 0, 0.05);
        }

        .physical-stat .label {
          font-weight: 500;
          font-size: 0.9rem;
        }

        .physical-stat .value {
          font-weight: 600;
          color: var(--physical-value-color);
        }

        .dark .physical-stat .value {
          --physical-value-color: #FFD700;
        }

        .light .physical-stat .value {
          --physical-value-color: #1a1a1a;
        }

        .vs-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 0;
        }

        .vs-divider svg {
          color: var(--divider-icon-color);
          opacity: 0.6;
        }

        .dark .vs-divider svg {
          --divider-icon-color: #FFD700;
        }

        .light .vs-divider svg {
          --divider-icon-color: #1a1a1a;
        }

        /* Collapse Bottom */
        .collapse-bottom {
          padding: 1.5rem 2rem;
          border-top: 1px solid var(--border-color);
          text-align: center;
        }

        .collapse-btn {
          background: var(--collapse-bg);
          border: 1px solid var(--collapse-border);
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          color: var(--collapse-color);
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 500;
          margin: 0 auto;
        }

        .dark .collapse-btn {
          --collapse-bg: rgba(255, 215, 0, 0.1);
          --collapse-border: rgba(255, 215, 0, 0.3);
          --collapse-color: #FFD700;
        }

        .light .collapse-btn {
          --collapse-bg: rgba(0, 0, 0, 0.05);
          --collapse-border: rgba(0, 0, 0, 0.1);
          --collapse-color: #1a1a1a;
        }

        .collapse-btn:hover {
          background: var(--collapse-hover);
          transform: translateY(-2px);
        }

        .dark .collapse-btn:hover {
          --collapse-hover: rgba(255, 215, 0, 0.2);
        }

        .light .collapse-btn:hover {
          --collapse-hover: rgba(0, 0, 0, 0.1);
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
          border-top-color: var(--spinner-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .dark .spinner {
          --spinner-track: rgba(255, 215, 0, 0.2);
          --spinner-color: #FFD700;
        }

        .light .spinner {
          --spinner-track: rgba(0, 0, 0, 0.1);
          --spinner-color: #1a1a1a;
        }

        .error-state h3 {
          color: #ef4444;
          margin-bottom: 1rem;
        }

        .error-state p {
          opacity: 0.7;
          margin-bottom: 2rem;
        }

        .error-state button {
          background: #ef4444;
          color: #fff;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .error-state button:hover {
          background: #dc2626;
        }

        .empty-state h3 {
          color: var(--empty-title-color);
          margin-bottom: 1rem;
        }

        .dark .empty-state h3 {
          --empty-title-color: #FFD700;
        }

        .light .empty-state h3 {
          --empty-title-color: #1a1a1a;
        }

        .empty-state p {
          opacity: 0.7;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .event-main-content {
            flex-direction: column;
            gap: 2rem;
          }

          .main-event-preview {
            max-width: none;
            width: 100%;
          }

          .fighters-comparison {
            grid-template-columns: 1fr;
            gap: 2rem;
          }

          .vs-divider {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
            padding: 1.5rem 1rem;
          }

          .header-content h1 {
            font-size: 2rem;
          }

          .events-list {
            padding: 1rem;
          }

          .event-header {
            flex-direction: column;
            gap: 1.5rem;
            text-align: center;
            padding: 1.5rem 1rem;
          }

          .event-main-content {
            width: 100%;
          }

          .fighters-preview {
            flex-direction: column;
            gap: 1rem;
          }

          .fighter-preview {
            justify-content: center;
          }

          .vs-section {
            order: -1;
          }

          .fight-header {
            flex-direction: column;
            gap: 1rem;
            padding: 1rem;
          }

          .fighters-matchup {
            flex-direction: column;
            gap: 1rem;
          }

          .fighter-summary {
            justify-content: center;
            text-align: center;
          }

          .fight-vs {
            order: -1;
          }

          .fight-details {
            padding: 1rem;
          }

          .section-header {
            padding: 1rem;
          }

          .fights-list {
            padding: 0 1rem 1rem;
          }

          .collapse-bottom {
            padding: 1rem;
          }

          .event-title-container {
            justify-content: center;
          }

          .fight-meta {
            justify-content: center;
            flex-wrap: wrap;
          }
        }

        @media (max-width: 480px) {
          .header-content h1 {
            font-size: 1.8rem;
          }

          .event-title {
            font-size: 1.4rem;
          }

          .event-card {
            border-radius: 16px;
          }

          .fighter-preview img {
            width: 60px;
            height: 60px;
          }

          .fighter-summary img {
            width: 40px;
            height: 40px;
          }

          .event-title-container {
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
          }

          .betting-card-header {
            padding: 0.75rem 1rem;
          }

          .betting-card-content {
            padding: 1rem;
          }

          .section-title {
            font-size: 1rem;
            min-width: auto;
          }

          .fight-meta {
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Events;