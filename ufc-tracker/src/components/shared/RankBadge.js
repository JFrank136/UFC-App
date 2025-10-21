import React from 'react';

const RankBadge = ({ fighter, showDivisional = true, showP4P = true, className = '' }) => {
  if (!fighter?.rankings || fighter.rankings.length === 0) return null;

  const getRankings = () => {
    const p4pRank = fighter.rankings.find(r =>
      r.division?.toLowerCase().includes('pound-for-pound')
    );
    const divisionalRank = fighter.rankings.find(r =>
      !r.division?.toLowerCase().includes('pound-for-pound')
    );

    return { divisional: divisionalRank, p4p: p4pRank };
  };

  const rankings = getRankings();

  if (!rankings.divisional && !rankings.p4p) return null;

  return (
    <div className={`rank-badges ${className}`}>
      {showDivisional && rankings.divisional && (
        <div className="rank-badge divisional">
          {rankings.divisional.rank === 'C' ? (
            <>
              <span className="crown">👑</span>
              <span>Champion</span>
            </>
          ) : (
            <>
              <span>#{rankings.divisional.rank}</span>
              {rankings.divisional.division && (
                <span className="division">{rankings.divisional.division}</span>
              )}
            </>
          )}
        </div>
      )}

      {showP4P && rankings.p4p && (
        <div className="rank-badge p4p">
          <span>P4P #{rankings.p4p.rank}</span>
        </div>
      )}

      <style jsx>{`
        .rank-badges {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: center;
        }

        .rank-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid;
        }

        .rank-badge.divisional {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border-color: rgba(59, 130, 246, 0.3);
        }

        .rank-badge.p4p {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
          border-color: rgba(251, 191, 36, 0.3);
        }

        .crown {
          font-size: 0.9rem;
        }

        .division {
          font-size: 0.7rem;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
};

export default RankBadge;
