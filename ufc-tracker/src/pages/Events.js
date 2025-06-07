import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, MapPin, TrendingUp, Shield, Target, BarChart3, Sun, Moon, ChevronDown, ChevronUp, Users, Trophy, Zap } from 'lucide-react';
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

  useEffect(() => {
    const fetchFights = async () => {
      try {
        setLoading(true);
        
        // Try the supabaseQueries function first, fallback to direct query
        try {
          const data = await getEventData();
          setFights(data || []);
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
          setFights(data || []);
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

  const EventCard = ({ eventKey, eventData, isExpanded }) => {
    const mainEvent = getMainEvent(eventData.fights);
    const eventIsPPV = isPPV(eventData.info.name, eventData.info.type);
    const fightsCount = eventData.fights.length;
    
    return (
      <div className="event-card">
        <div 
          className={`event-header ${eventIsPPV ? 'ppv-event' : 'fight-night-event'}`}
          onClick={() => toggleEvent(eventKey)}
        >
          <div className="event-main-content">
            <div className="event-info">
              <div className="event-title-container">
                <h2 className="event-title">{eventData.info.name}</h2>
                {eventIsPPV && <span className="ppv-badge">PPV</span>}
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
                      src={mainEvent.fighter1?.image_url || '/static/images/placeholder.jpg'}
                      alt={mainEvent.fighter1?.name || 'Fighter 1'}
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                          (mainEvent.fighter1?.name?.charAt(0) || '?');
                      }}
                    />
                    <div className="fighter-info">
                      <h4>{mainEvent.fighter1?.name || 'TBA'}</h4>
                      <span className="record">{formatRecord(mainEvent.fighter1)}</span>
                    </div>
                  </div>
                  
                  <div className="vs-section">
                    <span className="vs">VS</span>
                    <span className="weight-class">{mainEvent.weight_class || 'TBA'}</span>
                  </div>
                  
                  <div className="fighter-preview">
                    <img
                      src={mainEvent.fighter2?.image_url || '/static/images/placeholder.jpg'}
                      alt={mainEvent.fighter2?.name || 'Fighter 2'}
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                          (mainEvent.fighter2?.name?.charAt(0) || '?');
                      }}
                    />
                    <div className="fighter-info">
                      <h4>{mainEvent.fighter2?.name || 'TBA'}</h4>
                      <span className="record">{formatRecord(mainEvent.fighter2)}</span>
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
          <div className="fights-list">
            {eventData.fights
              .sort((a, b) => (b.fight_order || 0) - (a.fight_order || 0))
              .map(fight => (
                <FightCard 
                  key={fight.id} 
                  fight={fight} 
                  isExpanded={expandedFights.has(fight.id)}
                  onToggle={() => toggleFight(fight.id)}
                />
              ))
            }
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

    const f1Finishes = getFinishRates(f1);
    const f2Finishes = getFinishRates(f2);

    return (
      <div className="fight-card">
        <div className="fight-header" onClick={onToggle}>
          <div className="fight-main-info">
            <div className="fight-meta">
              <span className="card-section">{fight.card_section || 'TBA'}</span>
              <span className="fight-time">{formatTime(fight.event_time)}</span>
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
                <span className="weight">{fight.weight_class} lbs</span>
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
              <div className="fighter-stats">
                <h5>{f1.name} - Betting Stats</h5>
                
                <div className="stats-grid">
                  <div className="stat-item">
                    <Zap size={14} />
                    <span>Finish Rate</span>
                    <span className="stat-value">{f1Finishes.ko + f1Finishes.sub}%</span>
                  </div>
                  <div className="stat-item">
                    <Target size={14} />
                    <span>KO Rate</span>
                    <span className="stat-value">{f1Finishes.ko}%</span>
                  </div>
                  <div className="stat-item">
                    <Shield size={14} />
                    <span>Sub Rate</span>
                    <span className="stat-value">{f1Finishes.sub}%</span>
                  </div>
                  <div className="stat-item">
                    <Clock size={14} />
                    <span>Avg Fight Time</span>
                    <span className="stat-value">{formatStat(f1.avg_fight_time)} min</span>
                  </div>
                  <div className="stat-item">
                    <TrendingUp size={14} />
                    <span>Strikes/Min</span>
                    <span className="stat-value">{formatStat(f1.strikes_landed_per_min)}</span>
                  </div>
                  <div className="stat-item">
                    <BarChart3 size={14} />
                    <span>Strike Defense</span>
                    <span className="stat-value">{formatStat(f1.striking_defense)}</span>
                  </div>
                </div>

                <div className="physical-stats">
                  <h6>Physical</h6>
                  <div className="physical-grid">
                    <span>Age: {f1.age || 'N/A'}</span>
                    <span>Height: {f1.height || 'N/A'}"</span>
                    <span>Reach: {f1.reach || 'N/A'}"</span>
                  </div>
                </div>
              </div>

              <div className="vs-divider">
                <Trophy size={24} />
              </div>

              <div className="fighter-stats">
                <h5>{f2.name} - Betting Stats</h5>
                
                <div className="stats-grid">
                  <div className="stat-item">
                    <Zap size={14} />
                    <span>Finish Rate</span>
                    <span className="stat-value">{f2Finishes.ko + f2Finishes.sub}%</span>
                  </div>
                  <div className="stat-item">
                    <Target size={14} />
                    <span>KO Rate</span>
                    <span className="stat-value">{f2Finishes.ko}%</span>
                  </div>
                  <div className="stat-item">
                    <Shield size={14} />
                    <span>Sub Rate</span>
                    <span className="stat-value">{f2Finishes.sub}%</span>
                  </div>
                  <div className="stat-item">
                    <Clock size={14} />
                    <span>Avg Fight Time</span>
                    <span className="stat-value">{formatStat(f2.avg_fight_time)} min</span>
                  </div>
                  <div className="stat-item">
                    <TrendingUp size={14} />
                    <span>Strikes/Min</span>
                    <span className="stat-value">{formatStat(f2.strikes_landed_per_min)}</span>
                  </div>
                  <div className="stat-item">
                    <BarChart3 size={14} />
                    <span>Strike Defense</span>
                    <span className="stat-value">{formatStat(f2.striking_defense)}</span>
                  </div>
                </div>

                <div className="physical-stats">
                  <h6>Physical</h6>
                  <div className="physical-grid">
                    <span>Age: {f2.age || 'N/A'}</span>
                    <span>Height: {f2.height || 'N/A'}"</span>
                    <span>Reach: {f2.reach || 'N/A'}"</span>
                  </div>
                </div>
              </div>
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
          color: #000000;
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
          background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
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
          --toggle-bg: rgba(255, 215, 0, 0.1);
          --toggle-border: rgba(255, 215, 0, 0.3);
          --toggle-color: #B8860B;
        }

        .theme-toggle:hover {
          transform: scale(1.1);
          background: var(--toggle-hover);
        }

        .dark .theme-toggle:hover {
          --toggle-hover: rgba(255, 215, 0, 0.2);
        }

        .light .theme-toggle:hover {
          --toggle-hover: rgba(255, 215, 0, 0.2);
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
          --card-border: rgba(255, 215, 0, 0.3);
        }

        .event-card:hover {
          border-color: #FFD700;
          box-shadow: 0 20px 40px var(--card-shadow);
          transform: translateY(-4px);
        }

        .dark .event-card:hover {
          --card-shadow: rgba(255, 215, 0, 0.2);
        }

        .light .event-card:hover {
          --card-shadow: rgba(255, 215, 0, 0.3);
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

        .event-header:hover {
          background: var(--header-hover);
        }

        .dark .event-header:hover {
          --header-hover: rgba(255, 215, 0, 0.05);
        }

        .light .event-header:hover {
          --header-hover: rgba(255, 215, 0, 0.03);
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
          --title-color: #B8860B;
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
          color: #FFD700;
        }

        /* Main Event Preview */
        .main-event-preview {
          flex: 1;
          max-width: 600px;
        }

        .main-event-label {
          text-align: center;
          font-size: 0.9rem;
          color: #FFD700;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 1rem;
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
          --image-border: rgba(255, 215, 0, 0.4);
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
          color: #FFD700;
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
          color: #FFD700;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 215, 0, 0.3);
        }

        .dark .fights-count {
          --count-bg: rgba(255, 215, 0, 0.1);
        }

        .light .fights-count {
          --count-bg: rgba(255, 215, 0, 0.08);
        }

        .expand-btn {
          background: var(--expand-bg);
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 8px;
          padding: 0.5rem;
          color: #FFD700;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dark .expand-btn {
          --expand-bg: rgba(255, 215, 0, 0.1);
        }

        .light .expand-btn {
          --expand-bg: rgba(255, 215, 0, 0.08);
        }

        .expand-btn:hover {
          background: rgba(255, 215, 0, 0.2);
          transform: scale(1.1);
        }

        /* Fights List */
        .fights-list {
          border-top: 1px solid var(--border-color);
          background: var(--fights-bg);
        }

        .dark .fights-list {
          --fights-bg: rgba(0, 0, 0, 0.2);
        }

        .light .fights-list {
          --fights-bg: rgba(0, 0, 0, 0.02);
        }

        /* Fight Card */
        .fight-card {
          border-bottom: 1px solid var(--border-color);
          transition: all 0.3s ease;
        }

        .fight-card:last-child {
          border-bottom: none;
        }

        .fight-card:hover {
          background: var(--fight-hover);
        }

        .dark .fight-card:hover {
          --fight-hover: rgba(255, 215, 0, 0.03);
        }

        .light .fight-card:hover {
          --fight-hover: rgba(255, 215, 0, 0.02);
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
          min-width: 60px;
        }

        .fight-vs .vs {
          font-size: 1.1rem;
          font-weight: 700;
          color: #FFD700;
        }

        .fight-vs .weight {
          font-size: 0.75rem;
          opacity: 0.6;
        }

        .fight-expand-btn {
          background: var(--expand-bg);
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 6px;
          padding: 0.5rem;
          color: #FFD700;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
        }

        .fight-expand-btn:hover {
          opacity: 1;
          background: rgba(255, 215, 0, 0.2);
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

        .fighter-stats h5 {
          font-size: 1.1rem;
          margin: 0 0 1.5rem 0;
          color: #FFD700;
          font-weight: 600;
          text-align: center;
          border-bottom: 2px solid rgba(255, 215, 0, 0.3);
          padding-bottom: 0.5rem;
        }

        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2rem;
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
          --stat-bg: rgba(255, 215, 0, 0.03);
          --stat-border: rgba(255, 215, 0, 0.1);
        }

        .stat-item:hover {
          background: var(--stat-hover);
        }

        .dark .stat-item:hover {
          --stat-hover: rgba(255, 215, 0, 0.1);
        }

        .light .stat-item:hover {
          --stat-hover: rgba(255, 215, 0, 0.05);
        }

        .stat-item svg {
          color: #FFD700;
        }

        .stat-item span:nth-child(2) {
          flex: 1;
          margin-left: 0.5rem;
          font-size: 0.9rem;
        }

        .stat-value {
          font-weight: 600;
          color: #FFD700;
          font-size: 0.9rem;
        }

        .physical-stats {
          background: var(--physical-bg);
          border: 1px solid var(--physical-border);
          border-radius: 8px;
          padding: 1rem;
        }

        .dark .physical-stats {
          --physical-bg: rgba(255, 255, 255, 0.02);
          --physical-border: rgba(255, 255, 255, 0.1);
        }

        .light .physical-stats {
          --physical-bg: rgba(0, 0, 0, 0.02);
          --physical-border: rgba(0, 0, 0, 0.1);
        }

        .physical-stats h6 {
          font-size: 0.9rem;
          margin: 0 0 0.75rem 0;
          color: #FFD700;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .physical-grid {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.85rem;
          opacity: 0.8;
        }

        .vs-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 0;
        }

        .vs-divider svg {
          color: #FFD700;
          opacity: 0.6;
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
          border-top-color: #FFD700;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .dark .spinner {
          --spinner-track: rgba(255, 215, 0, 0.2);
        }

        .light .spinner {
          --spinner-track: rgba(255, 215, 0, 0.3);
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
          color: #FFD700;
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
        }
      `}</style>
    </div>
  );
};

export default Events;