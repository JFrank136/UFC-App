import React from 'react';
import { ChevronUp, ChevronDown, Trophy } from 'lucide-react';
import BettingCard from './BettingCard';
import countryCodes from '../../utils/countryCodes';
import {
  formatRecord,
  isChampionshipFight,
  getDivisionFromWeight,
  formatTime
} from '../../utils/eventsUtils';
import './EventsComponents.css';

const FightCard = ({
  fight,
  isExpanded,
  onToggle,
  bettingCardPages,
  onBettingPageChange
}) => {
  const f1 = fight.fighter1_data || fight.fighter1;
  const f2 = fight.fighter2_data || fight.fighter2;

  if (!f1 || !f2) {
    return (
      <div className="fight-card error-card">
        <p>Fighter data unavailable</p>
      </div>
    );
  }

  const isChampionship = isChampionshipFight(fight);
  const division = getDivisionFromWeight(fight.weight_class, f1, f2);

  return (
    <div className={`fight-card ${isChampionship ? 'championship-fight' : ''}`}>
      <div className="fight-header" onClick={onToggle}>
        <div className="fight-main-info">
          <div className="fight-meta">
            <span className="card-section">{fight.card_section || 'TBA'}</span>
            <span className="fight-time">{formatTime(fight.event_time)}</span>
            {isChampionship && <span className="championship-indicator">👑</span>}
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
              <span className="weight">{division}</span>
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
            <BettingCard
              fighter={f1}
              fightId={fight.id}
              currentPage={bettingCardPages[fight.id] || 0}
              onPageChange={onBettingPageChange}
            />

            <div className="vs-divider">
              <Trophy size={24} />
            </div>

            <BettingCard
              fighter={f2}
              fightId={fight.id}
              currentPage={bettingCardPages[fight.id] || 0}
              onPageChange={onBettingPageChange}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FightCard;
