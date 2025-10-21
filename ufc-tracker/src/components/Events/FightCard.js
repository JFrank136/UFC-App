import React from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import BettingCard from './BettingCard';
import countryCodes from '../../utils/countryCodes';
import styles from '../../styles/FightCard.module.css';

const FightCard = ({ fight, isExpanded, onToggle }) => {
  const f1 = fight.fighter1_data || fight.fighter1;
  const f2 = fight.fighter2_data || fight.fighter2;
  
  if (!f1 || !f2) {
    return (
      <div className={`${styles.fightCard} ${styles.errorCard}`}>
        <p>Fighter data unavailable</p>
      </div>
    );
  }

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.ufc_wins_total || fighter.wins_total || 0;
    const losses = fighter.ufc_losses_total || fighter.losses_total || 0;
    const draws = fighter.ufc_draws_total || fighter.draws_total || 0;
    return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
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

  const isChampionship = isChampionshipFight(fight);
  const division = getDivisionFromWeight(fight.weight_class, f1, f2);

  return (
    <div className={`${styles.fightCard} ${isChampionship ? styles.championshipFight : ''}`}>
      <div className={styles.fightHeader} onClick={onToggle}>
        <div className={styles.fightMainInfo}>
          <div className={styles.fightMeta}>
            <span className={styles.fightTime}>{formatTime(fight.event_time)}</span>
            {isChampionship && <span className={styles.championshipIndicator}>👑</span>}
          </div>
          
          <div className={styles.fightersMatchup}>
            <div className={styles.fighterSummary}>
              <img
                src={f1.image_url || '/static/images/placeholder.jpg'}
                alt={f1.name}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/50x50/cccccc/666666?text=' + 
                    (f1.name?.charAt(0) || '?');
                }}
              />
              <div className={styles.fighterDetails}>
                <h4>{f1.name}</h4>
                <span className={styles.record}>{formatRecord(f1)}</span>
                <div className={styles.country}>
                  {countryCodes[f1.country]} {f1.country}
                </div>
              </div>
            </div>
            
            <div className={styles.fightVs}>
              <span className={styles.vs}>VS</span>
              <span className={styles.weight}>{division}</span>
            </div>
            
            <div className={styles.fighterSummary}>
              <img
                src={f2.image_url || '/static/images/placeholder.jpg'}
                alt={f2.name}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/50x50/cccccc/666666?text=' + 
                    (f2.name?.charAt(0) || '?');
                }}
              />
              <div className={styles.fighterDetails}>
                <h4>{f2.name}</h4>
                <span className={styles.record}>{formatRecord(f2)}</span>
                <div className={styles.country}>
                  {countryCodes[f2.country]} {f2.country}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button className={styles.fightExpandBtn}>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded && (
        <div className={styles.fightDetails}>
          <div className={styles.fightersComparison}>
            <BettingCard fighter={f1} fightId={fight.id} side="left" />
            
            <div className={styles.vsDivider}>
              <Trophy size={24} />
            </div>

            <BettingCard fighter={f2} fightId={fight.id} side="right" />
          </div>
        </div>
      )}
    </div>
  );
};

export default FightCard;