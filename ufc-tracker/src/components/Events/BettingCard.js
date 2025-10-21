import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import countryCodes from '../../utils/countryCodes';
import {
  formatRecord,
  formatStat,
  getRecentFights,
  getRankings,
  getFinishRatesByType
} from '../../utils/eventsUtils';
import './EventsComponents.css';

const BettingCard = ({ fighter, fightId, currentPage, onPageChange }) => {
  const [finishView, setFinishView] = useState('all');
  const [statsView, setStatsView] = useState('striking');

  const rankings = getRankings(fighter);
  const recentFights = getRecentFights(fighter, 5);

  const pages = [
    // Page 0: Details
    {
      title: `Details`,
      content: (
        <div className="details-page">
          <div className="fighter-header-card">
            <img
              src={fighter.image_url || '/static/images/placeholder.jpg'}
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
              <span className="value">{fighter.height ? `${fighter.height}"` : 'N/A'}</span>
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
              const rates = getFinishRatesByType(fighter, finishView);
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
          {recentFights.length > 0 ? recentFights.map((fight, idx) => (
            <div key={idx} className={`history-fight-result ${fight.result?.toLowerCase() || ''}`}>
              <div className="result-section">
                <span className="result-indicator">{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
              <div className="fight-info-section">
                <div className="opponent-name">{fight.opponent || 'Unknown'}</div>
                <div className="fight-method">{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</div>
                <div className="fight-details-line">
                  <span className="round-time">
                    {fight.round && fight.time ? `R${fight.round} ${fight.time}` : 'N/A'}
                  </span>
                  <span className="fight-date">
                    {fight.fight_date ? new Date(fight.fight_date).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric'
                    }) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )) : (
            <div className="no-fights">No recent fights available</div>
          )}
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
            onClick={() => onPageChange(fightId, 'prev')}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="page-indicator">{currentPage + 1}/4</span>
          <button
            className="nav-btn"
            onClick={() => onPageChange(fightId, 'next')}
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

export default BettingCard;
