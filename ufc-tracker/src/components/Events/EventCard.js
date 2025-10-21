import React from 'react';
import { Calendar, Clock, MapPin, Users, ChevronUp, ChevronDown } from 'lucide-react';
import CardSectionNavigation from './CardSectionNavigation';
import {
  getMainEvent,
  isPPV,
  isChampionshipEvent,
  groupFightsBySection,
  formatDate,
  formatTime,
  formatRecord,
  getDivisionFromWeight
} from '../../utils/eventsUtils';
import './EventsComponents.css';

const EventCard = ({
  eventKey,
  eventData,
  isExpanded,
  onToggleEvent,
  expandedFights,
  onToggleFight,
  activeCardSections,
  onSetActiveCardSections,
  bettingCardPages,
  onBettingPageChange
}) => {
  const mainEvent = getMainEvent(eventData.fights);
  const eventIsPPV = isPPV(eventData.info.name, eventData.info.type);
  const fightsCount = eventData.fights.length;
  const isChampionship = isChampionshipEvent(eventData.fights);
  const sectionedFights = groupFightsBySection(eventData.fights);

  return (
    <div className="event-card">
      <div
        className={`event-header ${eventIsPPV ? 'ppv-event' : 'fight-night-event'} ${isChampionship ? 'championship-event' : ''}`}
        onClick={() => onToggleEvent(eventKey)}
      >
        <div className="event-main-content">
          <div className="event-info">
            <div className="event-title-container">
              <h2 className="event-title">{eventData.info.name}</h2>
              {eventIsPPV && <span className="ppv-badge">PPV</span>}
              {isChampionship && <span className="championship-badge">👑 TITLE</span>}
            </div>

            <div className="event-meta">
              <div className="meta-item">
                <Calendar size={16} />
                <span>{formatDate(eventData.info.date)}</span>
              </div>
              <div className="meta-item">
                <Clock size={16} />
                <span>{formatTime(eventData.info.time)}</span>
              </div>
              {eventData.info.location && (
                <div className="meta-item">
                  <MapPin size={16} />
                  <span>{eventData.info.location}</span>
                </div>
              )}
            </div>
          </div>

          {mainEvent && (
            <div className="main-event-preview">
              <div className="main-event-label">Main Event</div>
              <div className="fighters-preview">
                <div className="fighter-preview">
                  <img
                    src={(mainEvent.fighter1_data || mainEvent.fighter1)?.image_url || '/static/images/placeholder.jpg'}
                    alt={(mainEvent.fighter1_data || mainEvent.fighter1)?.name || 'Fighter 1'}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' +
                        ((mainEvent.fighter1_data || mainEvent.fighter1)?.name?.charAt(0) || '?');
                    }}
                  />
                  <div className="fighter-info">
                    <h4>{(mainEvent.fighter1_data || mainEvent.fighter1)?.name || 'TBA'}</h4>
                    <span className="record">{formatRecord(mainEvent.fighter1_data || mainEvent.fighter1)}</span>
                  </div>
                </div>

                <div className="vs-section">
                  <span className="vs">VS</span>
                  <span className="weight-class">
                    {getDivisionFromWeight(mainEvent.weight_class, mainEvent.fighter1_data || mainEvent.fighter1, mainEvent.fighter2_data || mainEvent.fighter2)}
                  </span>
                </div>

                <div className="fighter-preview">
                  <img
                    src={(mainEvent.fighter2_data || mainEvent.fighter2)?.image_url || '/static/images/placeholder.jpg'}
                    alt={(mainEvent.fighter2_data || mainEvent.fighter2)?.name || 'Fighter 2'}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/80x80/cccccc/666666?text=' +
                        ((mainEvent.fighter2_data || mainEvent.fighter2)?.name?.charAt(0) || '?');
                    }}
                  />
                  <div className="fighter-info">
                    <h4>{(mainEvent.fighter2_data || mainEvent.fighter2)?.name || 'TBA'}</h4>
                    <span className="record">{formatRecord(mainEvent.fighter2_data || mainEvent.fighter2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="event-actions">
          <div className="fights-count">
            <Users size={16} />
            <span>{fightsCount} fights</span>
          </div>
          <button className="expand-btn">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="fights-sections">
          {Object.entries(sectionedFights).map(([sectionName, sectionFights]) => (
            sectionFights.length > 0 && (
              <div key={sectionName} className="fight-section">
                <CardSectionNavigation
                  sectionName={sectionName}
                  sectionFights={sectionFights}
                  eventKey={eventKey}
                  expandedFights={expandedFights}
                  onToggleFight={onToggleFight}
                  activeCardSections={activeCardSections}
                  onSetActiveCardSections={onSetActiveCardSections}
                  bettingCardPages={bettingCardPages}
                  onBettingPageChange={onBettingPageChange}
                />
              </div>
            )
          ))}

          <div className="collapse-bottom">
            <button
              className="collapse-btn"
              onClick={() => onToggleEvent(eventKey)}
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
