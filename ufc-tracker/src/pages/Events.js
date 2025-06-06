import React, { useEffect, useState, useMemo } from 'react';
import supabase from '../api/supabaseClient';
import { getEventData } from '../api/supabaseQueries';
import '../App.css';

const Events = () => {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [expandedFight, setExpandedFight] = useState(null);
  const [flippedCards, setFlippedCards] = useState(new Set());

  useEffect(() => {
    const fetchFights = async () => {
      try {
        setLoading(true);
        
        // Try to use the function from supabaseQueries.js first
        try {
          const data = await getEventData();
          setFights(data || []);
          setError(null);
        } catch (queryError) {
          console.log('getEventData failed, falling back to direct query:', queryError);
          
          // Fallback to simple query that matches your original working approach
          const { data, error } = await supabase
            .from('upcoming_fights')
            .select(`
              *,
              fighter1:fighter1_id (id, name, image_url, nickname, age, height, weight, reach, stance, fighting_out_of),
              fighter2:fighter2_id (id, name, image_url, nickname, age, height, weight, reach, stance, fighting_out_of)
            `)
            .order('event_date');

          if (error) {
            console.error('Direct Supabase query error:', error);
            throw error;
          }
          
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

  // Group fights by event with memoization for performance
  const groupedEvents = useMemo(() => {
    return fights.reduce((acc, fight) => {
      const key = `${fight.event} | ${fight.event_date}`;
      if (!acc[key]) {
        acc[key] = {
          info: {
            name: fight.event,
            date: fight.event_date,
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
    setExpandedEvent(expandedEvent === eventKey ? null : eventKey);
    setExpandedFight(null); // Close any expanded fights when switching events
  };

  const toggleFight = (fightId) => {
    setExpandedFight(expandedFight === fightId ? null : fightId);
  };

  const toggleCard = (cardId) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const formatRecord = (fighter) => {
    if (!fighter.fight_history || fighter.fight_history.length === 0) {
      return 'No record available';
    }
    
    const wins = fighter.fight_history.filter(f => f.result === 'Win').length;
    const losses = fighter.fight_history.filter(f => f.result === 'Loss').length;
    const draws = fighter.fight_history.filter(f => f.result === 'Draw').length;
    
    return `${wins}-${losses}${draws > 0 ? `-${draws}` : ''}`;
  };

  const getRanking = (fighter) => {
    if (!fighter.rankings || fighter.rankings.length === 0) return null;
    const ranking = fighter.rankings[0];
    return ranking.rank === 0 ? 'Champion' : `#${ranking.rank}`;
  };

  const getRecentFights = (fighter, limit = 3) => {
    if (!fighter.fight_history) return [];
    return fighter.fight_history
      .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date))
      .slice(0, limit);
  };

  const FighterCard = ({ fighter, fightId, position }) => {
    const cardId = `${fightId}-${position}`;
    const isFlipped = flippedCards.has(cardId);
    const ranking = getRanking(fighter);
    const recentFights = getRecentFights(fighter);

    return (
      <div className="fighter-card-container">
        <div 
          className={`fighter-card ${isFlipped ? 'flipped' : ''}`}
          onClick={() => toggleCard(cardId)}
        >
          {/* Front of card */}
          <div className="fighter-card-front">
            <div className="fighter-image-container">
              <img
                src={fighter.image_url || '/static/images/placeholder.jpg'}
                alt={fighter.name}
                className="fighter-image"
                loading="lazy"
              />
              {ranking && <div className="ranking-badge">{ranking}</div>}
            </div>
            <div className="fighter-basic-info">
              <h4 className="fighter-name">{fighter.name}</h4>
              <p className="fighter-record">Record: {formatRecord(fighter)}</p>
              <p className="fighter-nickname">
                {fighter.nickname ? `"${fighter.nickname}"` : ''}
              </p>
              <div className="fighter-details">
                <span>Age: {fighter.age || 'N/A'}</span>
                <span>Height: {fighter.height || 'N/A'}</span>
                <span>Weight: {fighter.weight || 'N/A'} lbs</span>
              </div>
            </div>
            <div className="card-flip-hint">Click for more info</div>
          </div>

          {/* Back of card */}
          <div className="fighter-card-back">
            <h4 className="fighter-name">{fighter.name}</h4>
            
            <div className="fighter-stats">
              <div className="stat-group">
                <h5>Physical Stats</h5>
                <p>Reach: {fighter.reach || 'N/A'}"</p>
                <p>Stance: {fighter.stance || 'N/A'}</p>
                <p>Fighting out of: {fighter.fighting_out_of || 'N/A'}</p>
              </div>

              {recentFights.length > 0 && (
                <div className="stat-group">
                  <h5>Recent Fights</h5>
                  {recentFights.map((fight, idx) => (
                    <div key={idx} className="recent-fight">
                      <span className={`result ${fight.result?.toLowerCase()}`}>
                        {fight.result}
                      </span>
                      <span className="opponent">vs {fight.opponent}</span>
                      <span className="method">{fight.method}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="external-links">
                <a 
                  href={`https://ufc.com/athlete/${encodeURIComponent(fighter.name.toLowerCase().replace(/ /g, '-'))}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ufc-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on UFC.com
                </a>
              </div>
            </div>
            <div className="card-flip-hint">Click to flip back</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading upcoming events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <div className="error-container">
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
      <div className="app-container">
        <div className="no-data-container">
          <h3>No Upcoming Events</h3>
          <p>Check back later for new fight announcements!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container events-container">
      <div className="events-header">
        <h1>Upcoming UFC Events</h1>
        <p>Click on events to expand, then click on fights for detailed fighter information</p>
      </div>

      {sortedEvents.map(([eventKey, eventData]) => {
        const isEventExpanded = expandedEvent === eventKey;
        const sortedFights = eventData.fights.sort((a, b) => b.fight_order - a.fight_order);

        return (
          <div key={eventKey} className="event-card">
            <div 
              className="event-header"
              onClick={() => toggleEvent(eventKey)}
            >
              <div className="event-main-info">
                <h2 className="event-title">{eventData.info.name}</h2>
                <div className="event-details">
                  <span className="event-date">
                    {new Date(eventData.info.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                  <span className="event-type">({eventData.info.type})</span>
                  {eventData.info.location && (
                    <span className="event-location">{eventData.info.location}</span>
                  )}
                </div>
              </div>
              <div className="event-toggle">
                <span className="fight-count">{eventData.fights.length} fights</span>
                <span className="expand-icon">{isEventExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {isEventExpanded && (
              <div className="event-fights">
                {sortedFights.map(fight => {
                  const isFightExpanded = expandedFight === fight.id;
                  
                  return (
                    <div key={fight.id} className="fight-container">
                      <div 
                        className="fight-header"
                        onClick={() => toggleFight(fight.id)}
                      >
                        <div className="fight-matchup">
                          <div className="fighter-preview">
                            <img
                              src={fight.fighter1_data?.image_url || '/static/images/placeholder.jpg'}
                              alt={fight.fighter1_data?.name}
                              className="fighter-preview-image"
                            />
                            <span className="fighter-preview-name">
                              {fight.fighter1?.name}
                            </span>
                          </div>
                          
                          <div className="vs-container">
                            <span className="vs-text">VS</span>
                          </div>
                          
                          <div className="fighter-preview">
                            <img
                              src={fight.fighter2_data?.image_url || '/static/images/placeholder.jpg'}
                              alt={fight.fighter2_data?.name}
                              className="fighter-preview-image"
                            />
                            <span className="fighter-preview-name">
                              {fight.fighter2_data?.name}
                            </span>
                          </div>
                        </div>
                        
                        <div className="fight-info">
                          <div className="fight-details">
                            <span className="card-section">{fight.card_section}</span>
                            <span className="weight-class">{fight.weight_class} lbs</span>
                            <span className="fight-time">{fight.event_time}</span>
                          </div>
                          <span className="expand-icon">{isFightExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {isFightExpanded && (
                        <div className="fight-details-expanded">
                          <div className="fighters-detailed">
                            <FighterCard 
                              fighter={fight.fighter1} 
                              fightId={fight.id}
                              position="fighter1"
                            />
                            <FighterCard 
                              fighter={fight.fighter2} 
                              fightId={fight.id}
                              position="fighter2"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <style jsx>{`
        .events-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
        }

        .events-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .events-header h1 {
          color: #d20a0a;
          margin-bottom: 0.5rem;
        }

        .events-header p {
          color: #666;
          font-size: 0.9rem;
        }

        .event-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          margin-bottom: 1.5rem;
          overflow: hidden;
          transition: transform 0.2s ease;
        }

        .event-card:hover {
          transform: translateY(-2px);
        }

        .event-header {
          padding: 1.5rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border-bottom: 1px solid #dee2e6;
        }

        .event-header:hover {
          background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
        }

        .event-title {
          font-size: 1.5rem;
          color: #d20a0a;
          margin: 0 0 0.5rem 0;
          font-weight: 700;
        }

        .event-details {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          font-size: 0.9rem;
          color: #666;
        }

        .event-toggle {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }

        .fight-count {
          font-size: 0.8rem;
          color: #666;
        }

        .expand-icon {
          font-size: 1.2rem;
          color: #d20a0a;
        }

        .event-fights {
          padding: 0;
        }

        .fight-container {
          border-bottom: 1px solid #f0f0f0;
        }

        .fight-container:last-child {
          border-bottom: none;
        }

        .fight-header {
          padding: 1rem 1.5rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background-color 0.2s ease;
        }

        .fight-header:hover {
          background-color: #f8f9fa;
        }

        .fight-matchup {
          display: flex;
          align-items: center;
          gap: 2rem;
          flex: 1;
        }

        .fighter-preview {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .fighter-preview-image {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #e9ecef;
        }

        .fighter-preview-name {
          font-weight: 600;
          color: #333;
        }

        .vs-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 60px;
        }

        .vs-text {
          font-weight: 700;
          color: #d20a0a;
          font-size: 1.1rem;
        }

        .fight-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .fight-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.85rem;
          text-align: right;
        }

        .card-section {
          font-weight: 700;
          color: #d20a0a;
        }

        .weight-class, .fight-time {
          color: #666;
        }

        .fight-details-expanded {
          padding: 2rem 1.5rem;
          background: #f8f9fa;
          border-top: 1px solid #e9ecef;
        }

        .fighters-detailed {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }

        .fighter-card-container {
          perspective: 1000px;
          height: 400px;
        }

        .fighter-card {
          position: relative;
          width: 100%;
          height: 100%;
          cursor: pointer;
          transform-style: preserve-3d;
          transition: transform 0.6s ease;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .fighter-card.flipped {
          transform: rotateY(180deg);
        }

        .fighter-card-front,
        .fighter-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          border-radius: 12px;
          background: white;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .fighter-card-back {
          transform: rotateY(180deg);
        }

        .fighter-image-container {
          position: relative;
          text-align: center;
          margin-bottom: 1rem;
        }

        .fighter-image {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid #e9ecef;
        }

        .ranking-badge {
          position: absolute;
          top: -5px;
          right: calc(50% - 75px);
          background: #d20a0a;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .fighter-basic-info {
          flex: 1;
          text-align: center;
        }

        .fighter-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: #333;
          margin-bottom: 0.5rem;
        }

        .fighter-record {
          font-size: 1rem;
          font-weight: 600;
          color: #d20a0a;
          margin-bottom: 0.5rem;
        }

        .fighter-nickname {
          font-style: italic;
          color: #666;
          margin-bottom: 1rem;
        }

        .fighter-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.9rem;
          color: #666;
        }

        .fighter-stats {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .stat-group h5 {
          margin: 0 0 0.5rem 0;
          color: #d20a0a;
          font-size: 1rem;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 0.25rem;
        }

        .stat-group p {
          margin: 0.25rem 0;
          font-size: 0.9rem;
          color: #666;
        }

        .recent-fight {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.85rem;
        }

        .recent-fight:last-child {
          border-bottom: none;
        }

        .result {
          font-weight: 700;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          text-transform: uppercase;
          font-size: 0.75rem;
        }

        .result.win {
          background: #d4edda;
          color: #155724;
        }

        .result.loss {
          background: #f8d7da;
          color: #721c24;
        }

        .result.draw {
          background: #fff3cd;
          color: #856404;
        }

        .opponent {
          flex: 1;
          text-align: center;
          color: #333;
        }

        .method {
          color: #666;
          font-size: 0.8rem;
        }

        .external-links {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e9ecef;
        }

        .ufc-link {
          display: inline-block;
          background: #d20a0a;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          transition: background-color 0.2s ease;
        }

        .ufc-link:hover {
          background: #b91c1c;
        }

        .card-flip-hint {
          text-align: center;
          font-size: 0.8rem;
          color: #999;
          margin-top: auto;
          padding-top: 1rem;
        }

        .loading-container,
        .error-container,
        .no-data-container {
          text-align: center;
          padding: 4rem 2rem;
        }

        .loading-spinner {
          width: 50px;
          height: 50px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #d20a0a;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-container button {
          background: #d20a0a;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          margin-top: 1rem;
        }

        .error-container button:hover {
          background: #b91c1c;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .events-container {
            padding: 0.5rem;
          }

          .event-header {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }

          .event-details {
            justify-content: center;
          }

          .fight-header {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }

          .fight-matchup {
            flex-direction: column;
            gap: 1rem;
          }

          .vs-container {
            order: -1;
          }

          .fighters-detailed {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .fighter-card-container {
            height: 350px;
          }

          .fighter-image {
            width: 100px;
            height: 100px;
          }

          .ranking-badge {
            right: calc(50% - 65px);
          }
        }

        @media (max-width: 480px) {
          .event-title {
            font-size: 1.25rem;
          }

          .fight-details-expanded {
            padding: 1rem;
          }

          .fighter-card {
            padding: 1rem;
          }

          .fighter-card-container {
            height: 320px;
          }
        }
      `}</style>
    </div>
  );
};

export default Events;