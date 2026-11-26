import React from 'react';
import styles from '../../styles/Events.module.css';
import { isPPV } from '../../utils/eventHelpers';

const getDateParts = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
};

const EventListSidebar = ({ sortedEvents, selectedEventKey, onSelectEvent }) => {
  return (
    <div className={styles.desktopSidebar}>
      <div className={styles.desktopSidebarHead}>
        <div className={styles.desktopSidebarTitle}>Events</div>
      </div>
      <div className={styles.desktopSidebarCount}>{sortedEvents.length} events</div>

      {sortedEvents.map(([eventKey, eventData]) => {
        const { day, month } = getDateParts(eventData.info.date);
        const ppv = isPPV(eventData.info.name, eventData.info.type);
        return (
          <button
            key={eventKey}
            className={`${styles.desktopEventRow} ${eventKey === selectedEventKey ? styles.desktopEventRowSelected : ''}`}
            onClick={() => onSelectEvent(eventKey)}
          >
            <div className={styles.dateChip}>
              <span className={styles.dateChipDay}>{day}</span>
              <span className={styles.dateChipMonth}>{month}</span>
            </div>
            <div className={styles.desktopEventRowInfo}>
              <div className={styles.desktopEventRowName}>
                {eventData.info.name}
                {ppv && <span className={styles.desktopPpvTag}>PPV</span>}
              </div>
              <div className={styles.desktopEventRowMeta}>
                {eventData.info.location || 'Location TBA'} &middot; {eventData.fights.length} fight{eventData.fights.length !== 1 ? 's' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default EventListSidebar;
