import React from 'react';
import { getRecentFights } from '../../utils/formatters';

const FightHistory = ({ fighter, limit = 5, className = '' }) => {
  const recentFights = getRecentFights(fighter, limit);

  if (recentFights.length === 0) {
    return (
      <div className={`fight-history ${className}`}>
        <div className="no-fights">No recent fights available</div>

        <style jsx>{`
          .no-fights {
            opacity: 0.5;
            font-style: italic;
            text-align: center;
            padding: 1rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`fight-history ${className}`}>
      {recentFights.map((fight, idx) => (
        <div key={idx} className={`fight-result ${fight.result?.toLowerCase() || ''}`}>
          <span className="result-indicator">
            {fight.result?.charAt(0)?.toUpperCase() || '?'}
          </span>
          <div className="fight-info">
            <div className="opponent">{fight.opponent || 'Unknown'}</div>
            <div className="method">{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</div>
            <div className="fight-details">
              <span className="round-time">
                {fight.round && fight.time ? `R${fight.round} ${fight.time}` : 'N/A'}
              </span>
              {fight.fight_date && (
                <span className="fight-date">
                  {new Date(fight.fight_date).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric'
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        .fight-history {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .fight-result {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border-left: 3px solid transparent;
          transition: all 0.3s ease;
        }

        .fight-result:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .fight-result.win {
          border-left-color: #4ade80;
        }

        .fight-result.loss {
          border-left-color: #ef4444;
        }

        .result-indicator {
          font-weight: 700;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 0.9rem;
        }

        .fight-result.win .result-indicator {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .fight-result.loss .result-indicator {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        .fight-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .opponent {
          font-weight: 600;
          font-size: 0.95rem;
        }

        .method {
          opacity: 0.8;
          font-size: 0.85rem;
        }

        .fight-details {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          opacity: 0.6;
          margin-top: 0.25rem;
        }

        .round-time {
          font-weight: 500;
        }

        .fight-date {
          font-style: italic;
        }
      `}</style>
    </div>
  );
};

export default FightHistory;
