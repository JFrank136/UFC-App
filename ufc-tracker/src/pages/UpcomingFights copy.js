import React, { useEffect, useState } from 'react';
import supabase from '../api/supabaseClient';
import '../App.css';

const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [userFilter, setUserFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [flippedCards, setFlippedCards] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFights = async () => {
      setLoading(true);
      try {
        // Fetch user favorites with user and priority info
        const { data: favorites, error: favError } = await supabase
          .from('user_favorites')
          .select('fighter_id, user, priority');

        if (favError) {
          console.error('Error fetching favorites:', favError);
          return;
        }

        // Apply user filter
        const selectedUsers = userFilter === 'All' ? ['Jared', 'Mars'] : [userFilter];
        const filteredFavorites = favorites.filter(f => selectedUsers.includes(f.user));

        // Apply priority filter
        const prioritized = priorityFilter === 'All' 
          ? filteredFavorites 
          : filteredFavorites.filter(f => f.priority.toLowerCase() === priorityFilter.toLowerCase());

        const favoriteIds = prioritized.map(f => f.fighter_id);

        // Create a map of fighter_id to user favorites for color coding
        const favoriteMap = {};
        favorites.forEach(fav => {
          if (!favoriteMap[fav.fighter_id]) {
            favoriteMap[fav.fighter_id] = [];
          }
          favoriteMap[fav.fighter_id].push({
            user: fav.user,
            priority: fav.priority
          });
        });

        // Fetch fights
        const { data: fightsRaw, error: fightsError } = await supabase
          .from('upcoming_fights')
          .select('*');

        if (fightsError) {
          console.error('Error fetching fights:', fightsError);
          return;
        }

        // Get fighter details separately
        const allFighterIds = new Set();
        fightsRaw.forEach(fight => {
          if (fight.fighter1_id) allFighterIds.add(fight.fighter1_id);
          if (fight.fighter2_id) allFighterIds.add(fight.fighter2_id);
        });

        const { data: fightersData, error: fightersError } = await supabase
          .from('fighters')
          .select(`
            id, name, nickname, image_url, height, weight, reach, age, country, weight_class,
            wins_total, losses_total, wins_ko, wins_sub, wins_dec, losses_ko, losses_sub, losses_dec,
            strikes_landed_per_min, strikes_absorbed_per_min, takedown_avg, submission_avg,
            striking_defense, knockdown_avg, avg_fight_time, ufc_rankings
          `)
          .in('id', Array.from(allFighterIds));

        if (fightersError) {
          console.error('Error fetching fighters:', fightersError);
        }

        // Create fighter lookup map
        const fighterMap = {};
        if (fightersData) {
          fightersData.forEach(fighter => {
            fighterMap[fighter.id] = fighter;
          });
        }

        // Filter fights where at least one fighter is in favorites
        const relevantFights = fightsRaw.filter(f => {
          return favoriteIds.includes(f.fighter1_id) || favoriteIds.includes(f.fighter2_id);
        });

        // Add fighter data and favorite info to each fight
        const fightsWithFavorites = relevantFights.map(fight => ({
          ...fight,
          fighter1: fighterMap[fight.fighter1_id] || { name: fight.fighter1_name || 'Unknown Fighter' },
          fighter2: fighterMap[fight.fighter2_id] || { name: fight.fighter2_name || 'Unknown Fighter' },
          fighter1_favorites: favoriteMap[fight.fighter1_id] || [],
          fighter2_favorites: favoriteMap[fight.fighter2_id] || []
        }));

        // Sort by event date, then fight order
        fightsWithFavorites.sort((a, b) => {
          const dateCompare = new Date(a.event_date) - new Date(b.event_date);
          return dateCompare !== 0 ? dateCompare : (a.fight_order || 0) - (b.fight_order || 0);
        });

        setFights(fightsWithFavorites);
      } catch (error) {
        console.error('Error in fetchFights:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFights();
  }, [userFilter, priorityFilter]);

  const getFighterBorderColor = (fighterFavorites) => {
    if (!fighterFavorites || fighterFavorites.length === 0) return 'transparent';
    
    const hasJared = fighterFavorites.some(f => f.user === 'Jared');
    const hasMars = fighterFavorites.some(f => f.user === 'Mars');
    
    if (hasJared && hasMars) return 'conic-gradient(from 0deg, #3b82f6, #ef4444, #ffd700, #3b82f6)';
    if (hasJared) return '#3b82f6';
    if (hasMars) return '#ef4444';
    return 'transparent';
  };

  const toggleCard = (fightId) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fightId)) {
        newSet.delete(fightId);
      } else {
        newSet.add(fightId);
      }
      return newSet;
    });
  };

  const groupedByEvent = fights.reduce((acc, fight) => {
    const key = `${fight.event} - ${fight.event_date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(fight);
    return acc;
  }, {});

  // Helper function to format UFC rankings
  const formatUFCRanking = (ranking) => {
    if (!ranking) return null;
    
    if (typeof ranking === 'string') return ranking;
    
    if (typeof ranking === 'object' && ranking.rank && ranking.division) {
      return `#${ranking.rank} ${ranking.division}`;
    }
    
    if (typeof ranking === 'object') {
      return Object.entries(ranking).map(([key, value]) => `${key}: ${value}`).join(', ');
    }
    
    return String(ranking);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const FighterCard = ({ fighter, favorites, isFlipped, onFlip }) => {
    const borderColor = getFighterBorderColor(favorites);
    
    return (
      <div 
        className="fighter-container"
        style={{ 
          textAlign: 'center', 
          cursor: 'pointer', 
          minWidth: '160px',
          transition: 'transform 0.2s ease',
        }}
        onClick={onFlip}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <div style={{ perspective: '1000px' }}>
          <div 
            style={{
              transformStyle: 'preserve-3d',
              transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              position: 'relative',
              height: '240px'
            }}
          >
            {/* Front of card */}
            <div 
              style={{
                backfaceVisibility: 'hidden',
                position: 'absolute',
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '1rem'
              }}
            >
              <div 
                style={{
                  background: borderColor !== 'transparent' ? borderColor : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                  padding: borderColor !== 'transparent' ? '4px' : '2px',
                  borderRadius: '50%',
                  marginBottom: '1rem',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
                }}
              >
                <img
                  src={fighter?.image_url || '/static/images/placeholder.jpg'}
                  alt={fighter?.name || 'Fighter'}
                  style={{ 
                    width: '120px', 
                    height: '120px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid white'
                  }}
                />
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ 
                  margin: '0 0 0.25rem 0', 
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  color: '#1a202c',
                  lineHeight: '1.2'
                }}>
                  {fighter?.name || 'Unknown Fighter'}
                </h3>
                
                {fighter?.nickname && (
                  <p style={{ 
                    margin: '0 0 0.5rem 0',
                    fontSize: '0.85rem', 
                    color: '#718096',
                    fontStyle: 'italic'
                  }}>
                    "{fighter.nickname}"
                  </p>
                )}

                {formatUFCRanking(fighter?.ufc_rankings) && (
                  <div style={{
                    background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                    color: '#744210',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    margin: '0.5rem 0',
                    display: 'inline-block'
                  }}>
                    {formatUFCRanking(fighter.ufc_rankings)}
                  </div>
                )}
                
                {favorites.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {favorites.map(fav => (
                      <span 
                        key={fav.user} 
                        style={{ 
                          display: 'inline-block',
                          background: fav.user === 'Jared' ? '#3b82f6' : '#ef4444',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          margin: '0.125rem',
                        }}
                      >
                        {fav.user} • {fav.priority}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Back of card */}
            <div 
              style={{
                backfaceVisibility: 'hidden',
                position: 'absolute',
                width: '100%',
                height: '100%',
                transform: 'rotateY(180deg)',
                padding: '1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '12px',
                color: 'white',
                fontSize: '0.8rem',
                overflow: 'hidden'
              }}
            >
              <h4 style={{ 
                margin: '0 0 1rem 0', 
                textAlign: 'center',
                fontSize: '1rem',
                fontWeight: '600'
              }}>
                {fighter?.name}
              </h4>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '0.5rem', 
                fontSize: '0.75rem',
                marginBottom: '1rem'
              }}>
                <div><strong>Record:</strong> {(fighter?.wins_total || 0)}-{(fighter?.losses_total || 0)}</div>
                <div><strong>Age:</strong> {fighter?.age || 'N/A'}</div>
                <div><strong>Height:</strong> {fighter?.height || 'N/A'}</div>
                <div><strong>Weight:</strong> {fighter?.weight || 'N/A'}</div>
              </div>
              
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '0.5rem', 
                borderRadius: '8px',
                fontSize: '0.7rem'
              }}>
                <div style={{ marginBottom: '0.25rem' }}>
                  <strong>Wins:</strong> KO {fighter?.wins_ko || 0} | Sub {fighter?.wins_sub || 0} | Dec {fighter?.wins_dec || 0}
                </div>
                <div>
                  <strong>Losses:</strong> KO {fighter?.losses_ko || 0} | Sub {fighter?.losses_sub || 0} | Dec {fighter?.losses_dec || 0}
                </div>
              </div>
              
              <div style={{ 
                marginTop: '0.5rem', 
                fontSize: '0.7rem',
                opacity: 0.9
              }}>
                <div>Strikes/min: {fighter?.strikes_landed_per_min || 'N/A'}</div>
                <div>Strike Def: {fighter?.striking_defense ? `${fighter.striking_defense}%` : 'N/A'}</div>
                <div>Takedowns: {fighter?.takedown_avg || 'N/A'}/15min</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid #e2e8f0',
            borderTop: '4px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Loading your fights...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      padding: '2rem 1rem'
    }}>
      {/* Header */}
      <div style={{
        textAlign: 'center',
        marginBottom: '3rem'
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: '800',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: '0 0 0.5rem 0'
        }}>
          Upcoming Fights
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.1rem' }}>
          Track your favorite fighters' upcoming matches
        </p>
      </div>

      {/* Filters */}
      <div style={{ 
        maxWidth: '1200px',
        margin: '0 auto 3rem',
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        padding: '2rem', 
        borderRadius: '20px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '2rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ 
              display: 'block',
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: '#374151',
              fontSize: '0.9rem'
            }}>
              User Filter
            </label>
            <select 
              value={userFilter} 
              onChange={e => setUserFilter(e.target.value)}
              style={{ 
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                background: 'white',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            >
              <option>All</option>
              <option>Jared</option>
              <option>Mars</option>
            </select>
          </div>
          
          <div>
            <label style={{ 
              display: 'block',
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: '#374151',
              fontSize: '0.9rem'
            }}>
              Priority Filter
            </label>
            <select 
              value={priorityFilter} 
              onChange={e => setPriorityFilter(e.target.value)}
              style={{ 
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                background: 'white',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            >
              <option>All</option>
              <option>Favorite</option>
              <option>Interested</option>
            </select>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '1.5rem', 
          alignItems: 'center',
          fontSize: '0.9rem',
          fontWeight: '500'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              background: '#3b82f6', 
              borderRadius: '50%' 
            }}></div>
            <span style={{ color: '#374151' }}>Jared's Picks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              background: '#ef4444', 
              borderRadius: '50%' 
            }}></div>
            <span style={{ color: '#374151' }}>Mars' Picks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              background: 'conic-gradient(from 0deg, #3b82f6, #ef4444, #ffd700)', 
              borderRadius: '50%' 
            }}></div>
            <span style={{ color: '#374151' }}>Both Users</span>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div style={{ 
        textAlign: 'center',
        marginBottom: '2rem',
        fontSize: '1.1rem',
        fontWeight: '600',
        color: '#64748b'
      }}>
        {fights.length > 0 ? (
          <>Found <span style={{ color: '#3b82f6', fontWeight: '700' }}>{fights.length}</span> upcoming fights for your favorites</>
        ) : (
          'No upcoming fights found for the selected favorites'
        )}
      </div>

      {/* Events */}
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {Object.entries(groupedByEvent).map(([eventKey, eventFights]) => (
          <div key={eventKey} style={{ marginBottom: '4rem' }}>
            <div style={{
              textAlign: 'center',
              marginBottom: '2rem',
              padding: '1.5rem',
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
            }}>
              <h2 style={{ 
                fontSize: '1.8rem',
                fontWeight: '700',
                color: '#1a202c',
                margin: '0 0 0.5rem 0'
              }}>
                {eventKey.split(' - ')[0]}
              </h2>
              <p style={{ 
                color: '#64748b',
                fontSize: '1.1rem',
                margin: 0
              }}>
                {formatDate(eventKey.split(' - ')[1])}
              </p>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
              gap: '2rem',
              justifyItems: 'center'
            }}>
              {eventFights.map(fight => (
                <div 
                  key={fight.id}
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    padding: '2rem',
                    borderRadius: '20px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    transition: 'all 0.3s ease',
                    width: '100%',
                    maxWidth: '600px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-5px)';
                    e.currentTarget.style.boxShadow = '0 30px 60px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)';
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    gap: '2rem',
                    marginBottom: '1.5rem'
                  }}>
                    <FighterCard 
                      fighter={fight.fighter1}
                      favorites={fight.fighter1_favorites}
                      isFlipped={flippedCards.has(`${fight.id}-fighter1`)}
                      onFlip={() => toggleCard(`${fight.id}-fighter1`)}
                    />
                    
                    <div style={{ 
                      textAlign: 'center',
                      minWidth: '80px'
                    }}>
                      <div style={{ 
                        fontSize: '2rem', 
                        fontWeight: '800',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text'
                      }}>
                        VS
                      </div>
                    </div>
                    
                    <FighterCard 
                      fighter={fight.fighter2}
                      favorites={fight.fighter2_favorites}
                      isFlipped={flippedCards.has(`${fight.id}-fighter2`)}
                      onFlip={() => toggleCard(`${fight.id}-fighter2`)}
                    />
                  </div>
                  
                  <div style={{ 
                    textAlign: 'center',
                    padding: '1rem',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    color: '#475569'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                      {fight.card_section || 'Main Card'}
                    </div>
                    <div style={{ fontWeight: '500' }}>
                      {fight.weight_class} • {fight.event_time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default UpcomingFights;