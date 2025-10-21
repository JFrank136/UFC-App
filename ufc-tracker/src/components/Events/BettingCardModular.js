import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import countryCodes from '../../utils/countryCodes';
import { formatRecord, getRecentFights, formatStat } from '../../utils/formatters';
import RankBadge from '../shared/RankBadge';
import FightHistory from '../shared/FightHistory';

const BettingCardModular = ({ fighter, fightId, side, bettingCardPages, changeBettingPage }) => {
  const [finishView, setFinishView] = useState('all');
  const [statsView, setStatsView] = useState('striking');

  const currentPage = bettingCardPages[fightId] || 0;

  // Get rankings for fighter
  const getRankings = (fighter) => {
    if (!fighter?.rankings || !Array.isArray(fighter.rankings)) return { divisional: null, p4p: null };

    const p4p = fighter.rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divisionRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound') && r.rank !== 'NR');

    return { divisional: divisionRank, p4p };
  };

  const rankings = getRankings(fighter);

  // Calculate finish rates based on view
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

  const pages = [
    // Page 0: Details
    {
      title: `Details`,
      content: (
        <div className="details-page">
          <div className="fighter-header-card">
            <img
              src={fighter.image_url || fighter.image_local_path || `https://via.placeholder.com/60x60/cccccc/666666?text=${encodeURIComponent(fighter.name?.charAt(0) || '?')}`}
              alt={fighter.name}
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/60x60/cccccc/666666?text=' +
                  (fighter.name?.charAt(0) || '?');
              }}
            />
            <div className="fighter-info-with-meta">
              <div className="fighter-name-card">
                <h4>{fighter.name}</h4>
                {fighter.nickname && <p>"{fighter.nickname}"</p>}
              </div>
              <div className="fighter-meta-row">
                <span className="fighter-rank">
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

          <div className="details-grid">
            <div className="detail-row">
              <span className="label">Age</span>
              <span className="value">{fighter.age || 'N/A'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Record</span>
              <span className="value">{formatRecord(fighter)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Height</span>
              <span className="value">{fighter.height ? `${Math.floor(fighter.height / 12)}'${fighter.height % 12}"` : 'N/A'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Reach</span>
              <span className="value">{fighter.reach ? `${fighter.reach}"` : 'N/A'}</span>
            </div>
          </div>
        </div>
      )
    },
    // Page 1: Finish Rates
    {
      title: `Finish Rates`,
      content: (
        <div className="finish-rates-page">
          <div className="finish-view-toggle">
            <button
              className={`toggle-btn ${finishView === 'all' ? 'active' : ''}`}
              onClick={() => setFinishView('all')}
            >
              ALL
            </button>
            <button
              className={`toggle-btn ${finishView === 'wins' ? 'active' : ''}`}
              onClick={() => setFinishView('wins')}
            >
              W
            </button>
            <button
              className={`toggle-btn ${finishView === 'losses' ? 'active' : ''}`}
              onClick={() => setFinishView('losses')}
            >
              L
            </button>
          </div>

          <div className="finish-stats">
            {(() => {
              const rates = getFinishRatesByType(finishView);
              return (
                <>
                  <div className="finish-stat-item">
                    <div className="finish-label">KO</div>
                    <div className="finish-percentage">{rates.ko}%</div>
                  </div>
                  <div className="finish-stat-item">
                    <div className="finish-label">SUB</div>
                    <div className="finish-percentage">{rates.sub}%</div>
                  </div>
                  <div className="finish-stat-item">
                    <div className="finish-label">DEC</div>
                    <div className="finish-percentage">{rates.dec}%</div>
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
        <div className="stats-page">
          <div className="stats-view-toggle">
            <button
              className={`toggle-btn ${statsView === 'striking' ? 'active' : ''}`}
              onClick={() => setStatsView('striking')}
            >
              Striking
            </button>
            <button
              className={`toggle-btn ${statsView === 'grappling' ? 'active' : ''}`}
              onClick={() => setStatsView('grappling')}
            >
              Grappling
            </button>
          </div>

          <div className="stats-content">
            {statsView === 'striking' ? (
              <div className="striking-stats">
                <div className="stat-item">
                  <span className="stat-label">Sig. Strikes Landed/Min</span>
                  <span className="stat-value">{formatStat(fighter.sig_strikes_landed_per_min)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Sig. Strikes Absorbed/Min</span>
                  <span className="stat-value">{formatStat(fighter.sig_strikes_absorbed_per_min)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Striking Defense</span>
                  <span className="stat-value">{formatStat(fighter.sig_str_defense)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Striking Accuracy</span>
                  <span className="stat-value">{formatStat(fighter.striking_accuracy) || 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Knockdown Average</span>
                  <span className="stat-value">{formatStat(fighter.knockdown_avg)}</span>
                </div>
              </div>
            ) : (
              <div className="grappling-stats">
                <div className="stat-item">
                  <span className="stat-label">Takedown Avg/15min</span>
                  <span className="stat-value">{formatStat(fighter.takedown_avg_per_15min)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Takedown Defense</span>
                  <span className="stat-value">{formatStat(fighter.takedown_defense)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Takedown Accuracy</span>
                  <span className="stat-value">{formatStat(fighter.takedown_accuracy) || 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Submission Avg/15min</span>
                  <span className="stat-value">{formatStat(fighter.submission_avg_per_15min)}</span>
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
        <div className="fight-history-page">
          <FightHistory fighter={fighter} limit={5} />
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
          <span className="page-indicator">{currentPage + 1}/4</span>
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

      <style jsx>{`
        /* Betting Card styles remain the same as in Events.js */
        .betting-card {
          background: rgba(255, 215, 0, 0.05);
          border: 1px solid rgba(255, 215, 0, 0.2);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .betting-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: rgba(255, 215, 0, 0.1);
          border-bottom: 1px solid rgba(255, 215, 0, 0.2);
        }

        .betting-card-header h5 {
          font-size: 1rem;
          margin: 0;
          color: #FFD700;
          font-weight: 600;
        }

        .card-navigation {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-btn {
          background: rgba(255, 215, 0, 0.1);
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 4px;
          padding: 0.25rem;
          color: #FFD700;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .nav-btn:hover {
          background: rgba(255, 215, 0, 0.2);
          transform: scale(1.1);
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

        /* Details Page */
        .details-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .fighter-header-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255, 215, 0, 0.05);
          border-radius: 8px;
          border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .fighter-header-card img {
          width: 70px;
          height: 70px;
          border-radius: 8px;
          object-fit: cover;
          object-position: center top;
          border: 2px solid rgba(255, 215, 0, 0.3);
        }

        .fighter-info-with-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .fighter-name-card h4 {
          margin: 0 0 0.25rem 0;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .fighter-name-card p {
          margin: 0;
          font-size: 0.9rem;
          opacity: 0.7;
          font-style: italic;
        }

        .fighter-meta-row {
          display: flex;
          gap: 1rem;
          align-items: center;
          font-size: 0.9rem;
          opacity: 0.8;
        }

        .fighter-rank {
          color: #FFD700;
          font-weight: 600;
        }

        .details-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: rgba(255, 215, 0, 0.03);
          border-radius: 6px;
          border: 1px solid rgba(255, 215, 0, 0.1);
        }

        .detail-row .label {
          font-weight: 500;
          opacity: 0.8;
          font-size: 0.9rem;
        }

        .detail-row .value {
          font-weight: 600;
          color: #FFD700;
          text-align: right;
        }

        /* Finish Rates Page */
        .finish-rates-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .finish-view-toggle {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(255, 215, 0, 0.05);
          border-radius: 8px;
          padding: 0.25rem;
          border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .toggle-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          min-width: 50px;
        }

        .toggle-btn:hover:not(.active) {
          background: rgba(255, 215, 0, 0.1);
        }

        .toggle-btn.active {
          background: #FFD700;
          color: #000;
          font-weight: 600;
        }

        .finish-stats {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .finish-stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: rgba(255, 215, 0, 0.05);
          border-radius: 8px;
          border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .finish-label {
          font-weight: 600;
          font-size: 1rem;
        }

        .finish-percentage {
          font-size: 1.5rem;
          font-weight: 700;
          color: #FFD700;
        }

        /* Stats Page */
        .stats-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .stats-view-toggle {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(255, 215, 0, 0.05);
          border-radius: 8px;
          padding: 0.25rem;
          border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .stats-content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .striking-stats,
        .grappling-stats {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: rgba(255, 215, 0, 0.03);
          border-radius: 6px;
          border: 1px solid rgba(255, 215, 0, 0.1);
        }

        .stat-label {
          font-size: 0.9rem;
          font-weight: 500;
        }

        .stat-value {
          font-weight: 600;
          color: #FFD700;
        }

        /* Fight History Page */
        .fight-history-page {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
      `}</style>
    </div>
  );
};

export default BettingCardModular;
