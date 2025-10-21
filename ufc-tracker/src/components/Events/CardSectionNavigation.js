import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import FightCard from './FightCard';
import './EventsComponents.css';

const CardSectionNavigation = ({
  sectionName,
  sectionFights,
  eventKey,
  expandedFights,
  onToggleFight,
  activeCardSections,
  onSetActiveCardSections,
  bettingCardPages,
  onBettingPageChange
}) => {
  const activeSection = activeCardSections[eventKey] || sectionName;
  const sectionsOrder = ['Main Card', 'Preliminary Card', 'Early Prelims'];

  const changeSection = (direction) => {
    const currentIndex = sectionsOrder.indexOf(activeSection);
    let newIndex;

    if (direction === 'prev') {
      newIndex = currentIndex === 0 ? sectionsOrder.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex === sectionsOrder.length - 1 ? 0 : currentIndex + 1;
    }

    onSetActiveCardSections(prev => ({
      ...prev,
      [eventKey]: sectionsOrder[newIndex]
    }));
  };

  return (
    <div className="card-section-container">
      <div className="section-navigation-header">
        <button
          className="section-nav-btn"
          onClick={() => changeSection('prev')}
        >
          <ChevronLeft size={20} />
        </button>

        <div className="section-tabs">
          {sectionsOrder.map(section => (
            <button
              key={section}
              className={`section-tab ${activeSection === section ? 'active' : ''}`}
              onClick={() => onSetActiveCardSections(prev => ({ ...prev, [eventKey]: section }))}
            >
              {section}
            </button>
          ))}
        </div>

        <button
          className="section-nav-btn"
          onClick={() => changeSection('next')}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {activeSection === sectionName && (
        <div className="fights-list">
          {sectionFights.map(fight => (
            <FightCard
              key={fight.id}
              fight={fight}
              isExpanded={expandedFights.has(fight.id)}
              onToggle={() => onToggleFight(fight.id)}
              bettingCardPages={bettingCardPages}
              onBettingPageChange={onBettingPageChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CardSectionNavigation;
