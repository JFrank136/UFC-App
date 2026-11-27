import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useEventData } from '../hooks/useEventData';
import { useMediaQuery } from '../hooks/useMediaQuery';
import EventCard from '../components/Events/EventCard';
import EventListSidebar from '../components/Events/EventListSidebar';
import EventDetailPane from '../components/Events/EventDetailPane';
import styles from '../styles/Events.module.css';

const Events = () => {
  const { sortedEvents, loading, error } = useEventData();
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [expandedFights, setExpandedFights] = useState(new Set());
  const [darkMode, setDarkMode] = useState(true);
  const [activeCardSections, setActiveCardSections] = useState({});
  const [selectedEventKey, setSelectedEventKey] = useState(null);
  const isDesktop = useMediaQuery('(min-width: 860px)');

  const toggleEvent = (eventKey) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventKey)) {
        newSet.delete(eventKey);
        const eventData = sortedEvents.find(([key]) => key === eventKey)?.[1];
        eventData?.fights.forEach(fight => {
          setExpandedFights(prevFights => {
            const newFightsSet = new Set(prevFights);
            newFightsSet.delete(fight.id);
            return newFightsSet;
          });
        });
        setActiveCardSections(prevSections => {
          const newSections = { ...prevSections };
          delete newSections[eventKey];
          return newSections;
        });
      } else {
        newSet.add(eventKey);
        setActiveCardSections(prev => ({
          ...prev,
          [eventKey]: 'Main Card'
        }));
      }
      return newSet;
    });
  };

  const toggleFight = (fightId) => {
    setExpandedFights(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fightId)) {
        newSet.delete(fightId);
      } else {
        newSet.add(fightId);
      }
      return newSet;
    });
  };

  // Show events that are upcoming OR up to 3 days past their date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  cutoff.setHours(0, 0, 0, 0);
  const upcomingEvents = sortedEvents.filter(([, eventData]) => {
    const eventDate = new Date(eventData.info.date + 'T00:00:00');
    return eventDate >= cutoff;
  });

  const themeClass = darkMode ? 'dark' : 'light';

  if (loading) {
    return (
      <div className={styles.eventsContainer} data-theme={themeClass}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading upcoming events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.eventsContainer} data-theme={themeClass}>
        <div className={styles.errorState}>
          <h3>Error Loading Events</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <div className={styles.eventsContainer} data-theme={themeClass}>
        <div className={styles.emptyState}>
          <h3>No Upcoming Events</h3>
          <p>Check back later for new fight announcements!</p>
        </div>
      </div>
    );
  }

  if (isDesktop) {
    const selectedEntry = upcomingEvents.find(([key]) => key === selectedEventKey);
    return (
      <div className={styles.desktopWrap} data-theme={themeClass}>
        <EventListSidebar
          sortedEvents={upcomingEvents}
          selectedEventKey={selectedEventKey}
          onSelectEvent={setSelectedEventKey}
        />
        {selectedEntry ? (
          <EventDetailPane eventKey={selectedEntry[0]} eventData={selectedEntry[1]} />
        ) : (
          <div className={styles.desktopDetail}>
            <div className={styles.desktopDetailEmpty}>Select an event to see its fight card</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.eventsContainer} data-theme={themeClass}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>🥊 UFC Events</h1>
          <p>Complete fight cards and betting insights</p>
        </div>
        <button
          className={styles.themeToggle}
          onClick={() => setDarkMode(!darkMode)}
          title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      <div className={styles.eventsList}>
        {upcomingEvents.map(([eventKey, eventData]) => (
          <EventCard
            key={eventKey}
            eventKey={eventKey}
            eventData={eventData}
            isExpanded={expandedEvents.has(eventKey)}
            expandedFights={expandedFights}
            toggleEvent={toggleEvent}
            toggleFight={toggleFight}
            activeCardSections={activeCardSections}
            setActiveCardSections={setActiveCardSections}
          />
        ))}
      </div>
    </div>
  );
};

export default Events;
