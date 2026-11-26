import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, ChevronRight } from 'lucide-react';
import styles from '../../styles/Events.module.css';
import { formatDate, formatTime, groupFightsBySection, getDivisionFromWeight } from '../../utils/eventHelpers';
import FightComparisonCard from './FightComparisonCard';
import FightBreakdownPanel from './FightBreakdownPanel';

const SECTION_ORDER = ['Main Card', 'Preliminary Card', 'Early Prelims'];
const SECTION_LABEL = { 'Main Card': 'Main Card', 'Preliminary Card': 'Prelims', 'Early Prelims': 'Early Prelims' };

const EventDetailPane = ({ eventKey, eventData }) => {
  const [activeSection, setActiveSection] = useState('Main Card');
  const [selectedFightId, setSelectedFightId] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Switching events (or sections) should return to the "pick a fight"
  // prompt rather than carrying over a selection from a different event —
  // the spec explicitly asks for no auto-expand/auto-select on this page.
  useEffect(() => {
    setSelectedFightId(null);
    setShowBreakdown(false);
  }, [eventKey]);

  useEffect(() => {
    setSelectedFightId(null);
    setShowBreakdown(false);
  }, [activeSection]);

  const sectioned = groupFightsBySection(eventData.fights);
  const sectionsPresent = SECTION_ORDER.filter((s) => (sectioned[s] || []).length > 0);
  const activeFights = sectioned[activeSection] || [];
  const selectedFight = activeFights.find((f) => f.id === selectedFightId) || null;
  const fightDivision = selectedFight
    ? getDivisionFromWeight(selectedFight.weight_class, selectedFight.fighter1_data, selectedFight.fighter2_data)
    : null;

  return (
    <div className={styles.desktopDetail}>
      <div className={styles.desktopEventHeader}>
        <h2>{eventData.info.name}</h2>
        <div className={styles.desktopEventMeta}>
          <span><Calendar size={13} /> {formatDate(eventData.info.date)}</span>
          <span><Calendar size={13} /> {formatTime(eventData.info.time)}</span>
          {eventData.info.location && <span><MapPin size={13} /> {eventData.info.location}</span>}
          <span><Users size={13} /> {eventData.fights.length} fight{eventData.fights.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className={styles.desktopSegmented}>
        {sectionsPresent.map((section) => (
          <button
            key={section}
            type="button"
            className={`${styles.desktopSegPill} ${activeSection === section ? styles.desktopSegPillActive : ''}`}
            aria-pressed={activeSection === section}
            onClick={() => setActiveSection(section)}
          >
            {SECTION_LABEL[section]}
          </button>
        ))}
      </div>

      {selectedFight && showBreakdown && (
        <FightBreakdownPanel fight={selectedFight} onBack={() => setShowBreakdown(false)} />
      )}

      {selectedFight && !showBreakdown && (
        <FightComparisonCard
          key={selectedFight.id}
          fight={selectedFight}
          fightDivision={fightDivision}
          onOpenBreakdown={() => setShowBreakdown(true)}
        />
      )}

      {!selectedFight && <div className={styles.desktopDetailEmpty}>Select a fight to see details</div>}

      {activeFights.map((fight) => {
        const f1 = fight.fighter1_data;
        const f2 = fight.fighter2_data;
        if (!f1 || !f2) return null;
        return (
          <button
            key={fight.id}
            type="button"
            className={`${styles.desktopFightRow} ${fight.id === selectedFightId ? styles.desktopFightRowSelected : ''}`}
            onClick={() => { setSelectedFightId(fight.id); setShowBreakdown(false); }}
          >
            <span className={styles.desktopFightRowTag}>{fight.card_section || ''}</span>
            <img
              className={styles.desktopFightRowAvatar}
              src={f1.image_url || '/static/images/placeholder.jpg'}
              alt=""
              onError={(e) => { e.target.src = `https://via.placeholder.com/60x60/1a2338/f5f7fa?text=${f1.name?.charAt(0) || '?'}`; }}
            />
            <span className={styles.desktopFightRowName}>{f1.name} <span style={{ color: 'var(--mute)' }}>vs</span> {f2.name}</span>
            <ChevronRight className={styles.desktopFightRowChevron} size={14} />
          </button>
        );
      })}
    </div>
  );
};

export default EventDetailPane;
