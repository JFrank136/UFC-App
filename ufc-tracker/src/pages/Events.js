import React, { useEffect, useState, useMemo } from 'react';
import { Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getEventData } from '../api/supabaseQueries';
import EventCard from '../components/Events/EventCard';
import styles from './Events.module.css';

const Events = () => {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [expandedFights, setExpandedFights] = useState(new Set());
  const [darkMode, setDarkMode] = useState(true);
  const [bettingCardPages, setBettingCardPages] = useState({});
  const [activeCardSections, setActiveCardSections] = useState({});

  useEffect(() => {
    const fetchFights = async () => {
      try {
        setLoading(true);

        try {
          let data = await getEventData();

          // Get all fighter IDs from the events
          const allFighterIds = [...new Set(data.flatMap(fight => [
            fight.fighter1_data?.id,
            fight.fighter2_data?.id
          ].filter(Boolean)))];

          // Fetch fight history for all fighters
          if (allFighterIds.length > 0) {
            const { data: fightHistory, error: historyError } = await supabase
              .from('fight_history')
              .select('*')
              .in('fighter_id', allFighterIds);

            if (!historyError && fightHistory) {
              // Add fight history to fighter data
              data = data.map(fight => ({
                ...fight,
                fighter1_data: fight.fighter1_data ? {
                  ...fight.fighter1_data,
                  fight_history: fightHistory.filter(h => h.fighter_id === fight.fighter1_data.id) || []
                } : null,
                fighter2_data: fight.fighter2_data ? {
                  ...fight.fighter2_data,
                  fight_history: fightHistory.filter(h => h.fighter_id === fight.fighter2_data.id) || []
                } : null
              }));
            }
          }

          // Filter to only show events within 3 days of today or future events
          const today = new Date();
          const threeDaysAgo = new Date(today);
          threeDaysAgo.setDate(today.getDate() - 3);

          const filteredData = (data || []).filter(fight => {
            const eventDate = new Date(fight.event_date);
            return eventDate >= threeDaysAgo;
          });

          setFights(filteredData);
          setError(null);
        } catch (queryError) {
          console.log('getEventData failed, falling back to direct query:', queryError);

          const { data, error } = await supabase
            .from('upcoming_fights')
            .select(`
              *,
              fighter1:fighter1_id (
                id, name, image_url, nickname, age, height, weight, reach, country,
                wins_total, losses_total, wins_ko, wins_sub, wins_dec,
                losses_ko, losses_sub, losses_dec, avg_fight_time,
                strikes_landed_per_min, striking_defense, takedown_avg
              ),
              fighter2:fighter2_id (
                id, name, image_url, nickname, age, height, weight, reach, country,
                wins_total, losses_total, wins_ko, wins_sub, wins_dec,
                losses_ko, losses_sub, losses_dec, avg_fight_time,
                strikes_landed_per_min, striking_defense, takedown_avg
              )
            `)
            .order('event_date')
            .order('fight_order', { ascending: false });

          if (error) throw error;

          // Filter past events
          const today = new Date();
          const threeDaysAgo = new Date(today);
          threeDaysAgo.setDate(today.getDate() - 3);

          const filteredData = (data || []).filter(fight => {
            const eventDate = new Date(fight.event_date);
            return eventDate >= threeDaysAgo;
          });

          setFights(filteredData);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching fights:', err);
        setError(`Failed to load events: ${err.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFights();
  }, []);

  // Group fights by event
  const groupedEvents = useMemo(() => {
    return fights.reduce((acc, fight) => {
      const key = `${fight.event} | ${fight.event_date}`;
      if (!acc[key]) {
        acc[key] = {
          info: {
            name: fight.event,
            date: fight.event_date,
            time: fight.event_time,
            type: fight.event_type,
            location: fight.location
          },
          fights: []
        };
      }
      acc[key].fights.push(fight);
      return acc;
    }, {});
  }, [fights]);

  // Sort events by date
  const sortedEvents = useMemo(() => {
    return Object.entries(groupedEvents).sort(([, a], [, b]) =>
      new Date(a.info.date) - new Date(b.info.date)
    );
  }, [groupedEvents]);

  const toggleEvent = (eventKey) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventKey)) {
        newSet.delete(eventKey);
        // Also collapse all fights in this event
        groupedEvents[eventKey]?.fights.forEach(fight => {
          setExpandedFights(prevFights => {
            const newFightsSet = new Set(prevFights);
            newFightsSet.delete(fight.id);
            return newFightsSet;
          });
        });
        // Remove from active card sections
        setActiveCardSections(prevSections => {
          const newSections = { ...prevSections };
          delete newSections[eventKey];
          return newSections;
        });
      } else {
        newSet.add(eventKey);
        // Set Main Card as default active section
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

  const changeBettingPage = (fightId, direction) => {
    setBettingCardPages(prev => {
      const currentPage = prev[fightId] || 0;
      const newPage = direction === 'next' ?
        (currentPage + 1) % 4 :
        currentPage === 0 ? 3 : currentPage - 1;

      return {
        ...prev,
        [fightId]: newPage
      };
    });
  };

  if (loading) {
    return (
      <div className={`${styles.eventsContainer} ${darkMode ? 'dark' : 'light'}`}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading upcoming events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.eventsContainer} ${darkMode ? 'dark' : 'light'}`}>
        <div className={styles.errorState}>
          <h3>Error Loading Events</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (sortedEvents.length === 0) {
    return (
      <div className={`${styles.eventsContainer} ${darkMode ? 'dark' : 'light'}`}>
        <div className={styles.emptyState}>
          <h3>No Upcoming Events</h3>
          <p>Check back later for new fight announcements!</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.eventsContainer} ${darkMode ? 'dark' : 'light'}`}>
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
        {sortedEvents.map(([eventKey, eventData]) => (
          <EventCard
            key={eventKey}
            eventKey={eventKey}
            eventData={eventData}
            isExpanded={expandedEvents.has(eventKey)}
            onToggleEvent={toggleEvent}
            expandedFights={expandedFights}
            onToggleFight={toggleFight}
            activeCardSections={activeCardSections}
            onSetActiveCardSections={setActiveCardSections}
            bettingCardPages={bettingCardPages}
            onBettingPageChange={changeBettingPage}
          />
        ))}
      </div>
    </div>
  );
};

export default Events;
