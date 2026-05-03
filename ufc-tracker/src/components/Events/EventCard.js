import React from 'react';
import { Calendar, Clock, MapPin, ChevronDown, ChevronUp, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import FightCard from './FightCard';
import styles from '../../styles/EventCard.module.css';

const EventCard = ({ 
  eventKey, 
  eventData, 
  isExpanded, 
  expandedFights, 
  toggleEvent, 
  toggleFight, 
  activeCardSections, 
  setActiveCardSections 
}) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Time TBA';
    try {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${minutes} ${ampm} EST`;
    } catch (error) {
      return 'Time TBA';
    }
  };

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.ufc_wins_total || fighter.wins_total || 0;
    const losses = fighter.ufc_losses_total || fighter.losses_total || 0;
    const draws = fighter.ufc_draws_total || fighter.draws_total || 0;
    return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
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

  const isChampionshipEvent = (fights) => {
    return fights.some(fight => {
      const f1 = fight.fighter1_data || fight.fighter1;
      const f2 = fight.fighter2_data || fight.fighter2;
      
      const hasChampionRank = (f1?.rankings && f1.rankings.some(r => r.rank === 'C')) ||
                             (f2?.rankings && f2.rankings.some(r => r.rank === 'C'));
      
      const hasTitleInName = fight.event?.toLowerCase().includes('title') ||
                            fight.fighter1?.toLowerCase().includes('title') ||
                            fight.fighter2?.toLowerCase().includes('title');
      
      return hasChampionRank || hasTitleInName;
    });
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

  const groupFightsBySection = (fights) => {
    const grouped = fights.reduce((acc, fight) => {
      const raw = fight.card_section || '';
      let section;
      if (raw === 'Main Card' || raw === 'Main' || raw === 'Main Event' || raw === 'Co-Main') {
        section = 'Main Card';
      } else if (raw === 'Preliminary Card' || raw === 'Prelim' || raw === 'Prelims') {
        section = 'Preliminary Card';
      } else {
        section = 'Early Prelims';
      }
      if (!acc[section]) acc[section] = [];
      acc[section].push(fight);
      return acc;
    }, {});

    // Sort fights within each section by fight_order descending (main event first)
    Object.keys(grouped).forEach(section => {
      grouped[section].sort((a, b) => (b.fight_order || 0) - (a.fight_order || 0));
    });

    return grouped;
  };

  const mainEvent = getMainEvent(eventData.fights);
  const eventIsPPV = isPPV(eventData.info.name, eventData.info.type);
  const fightsCount = eventData.fights.length;
  const isChampionship = isChampionshipEvent(eventData.fights);
  const sectionedFights = groupFightsBySection(eventData.fights);

  return (
    <div className={styles.eventCard}>
      <div 
        className={`${styles.eventHeader} ${eventIsPPV ? styles.ppvEvent : styles.fightNightEvent} ${isChampionship ? styles.championshipEvent : ''}`}
        onClick={() => toggleEvent(eventKey)}
      >
        <div className={styles.eventMainContent}>
          <div className={styles.eventInfo}>
            <div className={styles.eventTitleContainer}>
              <h2 className={styles.eventTitle}>{eventData.info.name}</h2>
              {eventIsPPV && <span className={styles.ppvBadge}>PPV</span>}
              {isChampionship && <span className={styles.championshipBadge}>🏆 TITLE</span>}
            </div>
            
            <div className={styles.eventMeta}>
              <div className={styles.metaItem}>
                <Calendar size={16} />
                <span>{formatDate(eventData.info.date)}</span>
              </div>
              <div className={styles.metaItem}>
                <Clock size={16} />
                <span>{formatTime(eventData.info.time)}</span>
              </div>
              {eventData.info.location && (
                <div className={styles.metaItem}>
                  <MapPin size={16} />
                  <span>{eventData.info.location}</span>
                </div>
              )}
            </div>
          </div>

          {mainEvent && (
            <div className={styles.mainEventPreview}>
              <div className={styles.mainEventLabel}>Main Event</div>
              <div className={styles.fightersPreview}>
                <div className={styles.fighterPreview}>
                  <img
                    src={(mainEvent.fighter1_data || mainEvent.fighter1)?.image_url || 
                         (mainEvent.fighter1_data || mainEvent.fighter1)?.image_local_path || 
                         'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                         ((mainEvent.fighter1_data || mainEvent.fighter1)?.name?.charAt(0) || '?')}
                    alt={(mainEvent.fighter1_data || mainEvent.fighter1)?.name || 'Fighter 1'}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                        ((mainEvent.fighter1_data || mainEvent.fighter1)?.name?.charAt(0) || '?');
                    }}
                  />
                  <div className={styles.fighterInfo}>
                    <h4>{(mainEvent.fighter1_data || mainEvent.fighter1)?.name || 'TBA'}</h4>
                    <span className={styles.record}>{formatRecord(mainEvent.fighter1_data || mainEvent.fighter1)}</span>
                  </div>
                </div>
                
                <div className={styles.vsSection}>
                  <span className={styles.vs}>VS</span>
                  <span className={styles.weightClass}>
                    {getDivisionFromWeight(mainEvent.weight_class, mainEvent.fighter1_data || mainEvent.fighter1, mainEvent.fighter2_data || mainEvent.fighter2)}
                  </span>
                </div>
                
                <div className={styles.fighterPreview}>
                  <img
                    src={(mainEvent.fighter2_data || mainEvent.fighter2)?.image_url || 
                         (mainEvent.fighter2_data || mainEvent.fighter2)?.image_local_path || 
                         'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                         ((mainEvent.fighter2_data || mainEvent.fighter2)?.name?.charAt(0) || '?')}
                    alt={(mainEvent.fighter2_data || mainEvent.fighter2)?.name || 'Fighter 2'}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' + 
                        ((mainEvent.fighter2_data || mainEvent.fighter2)?.name?.charAt(0) || '?');
                    }}
                  />
                  <div className={styles.fighterInfo}>
                    <h4>{(mainEvent.fighter2_data || mainEvent.fighter2)?.name || 'TBA'}</h4>
                    <span className={styles.record}>{formatRecord(mainEvent.fighter2_data || mainEvent.fighter2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.eventActions}>
          <div className={styles.fightsCount}>
            <Users size={16} />
            <span>{fightsCount} fights</span>
          </div>
          <button className={styles.expandBtn}>
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.fightsSections}>
          <div className={styles.cardSectionContainer}>
            <div className={styles.sectionNavigationHeader}>
              <button 
                className={styles.sectionNavBtn}
                onClick={() => {
                  const sectionsOrder = ['Main Card', 'Preliminary Card', 'Early Prelims'];
                  const currentIndex = sectionsOrder.indexOf(activeCardSections[eventKey] || 'Main Card');
                  const newIndex = currentIndex === 0 ? sectionsOrder.length - 1 : currentIndex - 1;
                  setActiveCardSections(prev => ({ ...prev, [eventKey]: sectionsOrder[newIndex] }));
                }}
              >
                <ChevronLeft size={20} />
              </button>
              
              <div className={styles.sectionTabs}>
                {Object.entries(sectionedFights)
                  .filter(([sectionName, sectionFights]) => sectionFights.length > 0)
                  .sort(([a], [b]) => {
                    const order = ['Main Card', 'Preliminary Card', 'Early Prelims'];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map(([sectionName, sectionFights]) => (
                    <button
                      key={sectionName}
                      className={`${styles.sectionTab} ${(activeCardSections[eventKey] || 'Main Card') === sectionName ? styles.active : ''}`}
                      onClick={() => setActiveCardSections(prev => ({ ...prev, [eventKey]: sectionName }))}
                    >
                      {sectionName}
                    </button>
                  ))}
              </div>
              
              <button 
                className={styles.sectionNavBtn}
                onClick={() => {
                  const sectionsOrder = ['Main Card', 'Preliminary Card', 'Early Prelims'];
                  const currentIndex = sectionsOrder.indexOf(activeCardSections[eventKey] || 'Main Card');
                  const newIndex = currentIndex === sectionsOrder.length - 1 ? 0 : currentIndex + 1;
                  setActiveCardSections(prev => ({ ...prev, [eventKey]: sectionsOrder[newIndex] }));
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <div className={styles.fightsList}>
              {Object.entries(sectionedFights).map(([sectionName, sectionFights]) => (
                sectionFights.length > 0 && (activeCardSections[eventKey] || 'Main Card') === sectionName && (
                  <div key={sectionName}>
                    {sectionFights.map(fight => (
                      <FightCard 
                        key={fight.id} 
                        fight={fight} 
                        isExpanded={expandedFights.has(fight.id)}
                        onToggle={() => toggleFight(fight.id)}
                      />
                    ))}
                  </div>
                )
              ))}
            </div>
          </div>
          
          <div className={styles.collapseBottom}>
            <button 
              className={styles.collapseBtn}
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

export default EventCard;