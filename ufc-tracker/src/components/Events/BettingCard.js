import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import countryCodes from '../../utils/countryCodes';
import styles from '../../styles/BettingCard.module.css';

const BettingCard = ({ fighter, fightId, side }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [finishView, setFinishView] = useState('all');
  const [statsView, setStatsView] = useState('striking');

  const changePage = (direction) => {
    setCurrentPage(prev => {
      const newPage = direction === 'next' ? 
        (prev + 1) % 4 : 
        prev === 0 ? 3 : prev - 1;
      return newPage;
    });
  };

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.ufc_wins_total || fighter.wins_total || 0;
    const losses = fighter.ufc_losses_total || fighter.losses_total || 0;
    const draws = fighter.ufc_draws_total || fighter.draws_total || 0;
    return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
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
      .filter(fight => fight.opponent && fight.result)
      .sort((a, b) => new Date(b.fight_date || '1900-01-01') - new Date(a.fight_date || '1900-01-01'))
      .slice(0, limit);
  };

  const getRankings = (fighter) => {
    if (!fighter?.rankings || !Array.isArray(fighter.rankings)) return { divisional: null, p4p: null };
    
    const p4p = fighter.rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divisionRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound') && r.rank !== 'NR');
    
    return { divisional: divisionRank, p4p };
  };

  const getFinishRatesByType = (type) => {
    if (!fighter) return { ko: 0, sub: 0, dec: 0, total: 0 };
    
    if (type === 'wins') {
      const totalWins = fighter.ufc_wins_total || fighter.wins_total || 0;
      if (totalWins === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
      return {
        ko: Math.round(((fighter.ufc_wins_ko || fighter.wins_ko || 0) / totalWins) * 100),
        sub: Math.round(((fighter.ufc_wins_sub || fighter.wins_sub || 0) / totalWins) * 100),
        dec: Math.round(((fighter.ufc_wins_dec || fighter.wins_dec || 0) / totalWins) * 100),
        total: totalWins
      };
    } else if (type === 'losses') {
      const totalLosses = fighter.ufc_losses_total || fighter.losses_total || 0;
      if (totalLosses === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
      return {
        ko: Math.round(((fighter.ufc_losses_ko || fighter.losses_ko || 0) / totalLosses) * 100),
        sub: Math.round(((fighter.ufc_losses_sub || fighter.losses_sub || 0) / totalLosses) * 100),
        dec: Math.round(((fighter.ufc_losses_dec || fighter.losses_dec || 0) / totalLosses) * 100),
        total: totalLosses
      };
    } else {
      const totalUFCFights = (fighter.ufc_wins_total || 0) + (fighter.ufc_losses_total || 0);
      const totalAllFights = (fighter.wins_total || 0) + (fighter.losses_total || 0);
      const totalFights = totalUFCFights > 0 ? totalUFCFights : totalAllFights;
      
      if (totalFights === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
      
      const totalKO = (fighter.ufc_wins_ko || fighter.wins_ko || 0) + (fighter.ufc_losses_ko || fighter.losses_ko || 0);
      const totalSub = (fighter.ufc_wins_sub || fighter.wins_sub || 0) + (fighter.ufc_losses_sub || fighter.losses_sub || 0);
      const totalDec = (fighter.ufc_wins_dec || fighter.wins_dec || 0) + (fighter.ufc_losses_dec || fighter.losses_dec || 0);
      
      return {
        ko: Math.round((totalKO / totalFights) * 100),
        sub: Math.round((totalSub / totalFights) * 100),
        dec: Math.round((totalDec / totalFights) * 100),
        total: totalFights
      };
    }
  };

  const rankings = getRankings(fighter);
  const recentFights = getRecentFights(fighter, 5);

  const pages = [
    // Page 0: Details
    {
      title: `Details`,
      content: (
        <div className={styles.detailsPage}>
          <div className={styles.fighterHeaderCard}>
            <img
              src={fighter.image_url || fighter.image_local_path || `https://via.placeholder.com/60x60/cccccc/666666?text=${encodeURIComponent(fighter.name?.charAt(0) || '?')}`}
              alt={fighter.name}
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/60x60/cccccc/666666?text=' + 
                  (fighter.name?.charAt(0) || '?');
              }}
            />
            <div className={styles.fighterInfoWithMeta}>
              <div className={styles.fighterNameCard}>
                <h4>{fighter.name}</h4>
                {fighter.nickname && <p>"{fighter.nickname}"</p>}
              </div>
              <div className={styles.fighterMetaRow}>
                <span className={styles.fighterRank}>
                  {rankings.divisional ? 
                    (rankings.divisional.rank === 'C' ? 'Champion' : `#${rankings.divisional.rank}`) : 
                    'Unranked'
                  }
                  {rankings.p4p && ` • P4P #${rankings.p4p.rank}`}
                </span>
                <span>•</span>
                <span>
                  {countryCodes[fighter.country]} {fighter.country || 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          <div className={styles.detailsGrid}>
            <div className={styles.detailRow}>
              <span className={styles.label}>Age</span>
              <span className={styles.value}>{fighter.age || 'N/A'}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Record</span>
              <span className={styles.value}>{formatRecord(fighter)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Height</span>
              <span className={styles.value}>{fighter.height ? `${Math.floor(fighter.height/12)}'${fighter.height%12}"` : 'N/A'}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Reach</span>
              <span className={styles.value}>{fighter.reach ? `${fighter.reach}"` : 'N/A'}</span>
            </div>
          </div>
        </div>
      )
    },
    // Page 1: Finish Rates
    {
      title: `Finish Rates`,
      content: (
        <div className={styles.finishRatesPage}>
          <div className={styles.finishViewToggle}>
            <button 
              className={`${styles.toggleBtn} ${finishView === 'all' ? styles.active : ''}`}
              onClick={() => setFinishView('all')}
            >
              ALL
            </button>
            <button 
              className={`${styles.toggleBtn} ${finishView === 'wins' ? styles.active : ''}`}
              onClick={() => setFinishView('wins')}
            >
              W
            </button>
            <button 
              className={`${styles.toggleBtn} ${finishView === 'losses' ? styles.active : ''}`}
              onClick={() => setFinishView('losses')}
            >
              L
            </button>
          </div>
          
          <div className={styles.finishStats}>
            {(() => {
              const rates = getFinishRatesByType(finishView);
              return (
                <>
                  <div className={styles.finishStatItem}>
                    <div className={styles.finishLabel}>KO</div>
                    <div className={styles.finishPercentage}>{rates.ko}%</div>
                  </div>
                  <div className={styles.finishStatItem}>
                    <div className={styles.finishLabel}>SUB</div>
                    <div className={styles.finishPercentage}>{rates.sub}%</div>
                  </div>
                  <div className={styles.finishStatItem}>
                    <div className={styles.finishLabel}>DEC</div>
                    <div className={styles.finishPercentage}>{rates.dec}%</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )
    },
    // Page 2: Stats
    {
      title: `Stats`,
      content: (
        <div className={styles.statsPage}>
          <div className={styles.statsViewToggle}>
            <button 
              className={`${styles.toggleBtn} ${statsView === 'striking' ? styles.active : ''}`}
              onClick={() => setStatsView('striking')}
            >
              Striking
            </button>
            <button 
              className={`${styles.toggleBtn} ${statsView === 'grappling' ? styles.active : ''}`}
              onClick={() => setStatsView('grappling')}
            >
              Grappling
            </button>
          </div>
          
          <div className={styles.statsContent}>
            {statsView === 'striking' ? (
              <div className={styles.strikingStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Sig. Strikes Landed/Min</span>
                  <span className={styles.statValue}>{formatStat(fighter.sig_strikes_landed_per_min)}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Sig. Strikes Absorbed/Min</span>
                  <span className={styles.statValue}>{formatStat(fighter.sig_strikes_absorbed_per_min)}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Striking Defense</span>
                  <span className={styles.statValue}>{formatStat(fighter.sig_str_defense)}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Striking Accuracy</span>
                  <span className={styles.statValue}>{formatStat(fighter.striking_accuracy) || 'N/A'}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Knockdown Average</span>
                  <span className={styles.statValue}>{formatStat(fighter.knockdown_avg)}</span>
                </div>
              </div>
            ) : (
              <div className={styles.grapplingStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Takedown Avg/15min</span>
                  <span className={styles.statValue}>{formatStat(fighter.takedown_avg_per_15min)}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Takedown Defense</span>
                  <span className={styles.statValue}>{formatStat(fighter.takedown_defense)}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Takedown Accuracy</span>
                  <span className={styles.statValue}>{formatStat(fighter.takedown_accuracy) || 'N/A'}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Submission Avg/15min</span>
                  <span className={styles.statValue}>{formatStat(fighter.submission_avg_per_15min)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    },
    // Page 3: Fight History
    {
      title: `Fight History`,
      content: (
        <div className={styles.fightHistoryPage}>
          {recentFights.length > 0 ? recentFights.map((fight, idx) => (
            <div key={idx} className={`${styles.historyFightResult} ${styles[fight.result?.toLowerCase() || '']}`}>
              <div className={styles.resultSection}>
                <span className={styles.resultIndicator}>{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
              <div className={styles.fightInfoSection}>
                <div className={styles.opponentName}>{fight.opponent || 'Unknown'}</div>
                <div className={styles.fightMethod}>{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</div>
                <div className={styles.fightDetailsLine}>
                  <span className={styles.roundTime}>
                    {fight.round && fight.time ? `R${fight.round} ${fight.time}` : 'N/A'}
                  </span>
                  <span className={styles.fightDate}>
                    {fight.fight_date ? new Date(fight.fight_date).toLocaleDateString('en-US', { 
                      month: 'short', 
                      year: 'numeric' 
                    }) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )) : (
            <div className={styles.noFights}>No recent fights available</div>
          )}
        </div>
      )
    }
  ];

  return (
    <div className={styles.bettingCard}>
      <div className={styles.bettingCardHeader}>
        <h5>{pages[currentPage].title}</h5>
        <div className={styles.cardNavigation}>
          <button 
            className={styles.navBtn}
            onClick={() => changePage('prev')}
          >
            <ChevronLeft size={16} />
          </button>
          <span className={styles.pageIndicator}>{currentPage + 1}/4</span>
          <button 
            className={styles.navBtn}
            onClick={() => changePage('next')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className={styles.bettingCardContent}>
        {pages[currentPage].content}
      </div>
    </div>
  );
};

export default BettingCard;