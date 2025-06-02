import React, { useEffect, useState } from 'react';
import supabase from '../api/supabaseClient';
import '../App.css';

const Events = () => {
  const [fights, setFights] = useState([]);
  const [expandedEvent, setExpandedEvent] = useState(null);

  useEffect(() => {
    const fetchFights = async () => {
      const { data, error } = await supabase
        .from('upcoming_fights')
        .select(`
          *,
          fighter1:fighter1_id (id, name, image_url),
          fighter2:fighter2_id (id, name, image_url)
        `);

      if (error) return console.error(error);

      const sorted = [...data].sort((a, b) => {
        const dateDiff = new Date(a.event_date) - new Date(b.event_date);
        if (dateDiff !== 0) return dateDiff;
        return b.fight_order - a.fight_order; // higher fight_order first
      });

      setFights(sorted);
    };

    fetchFights();
  }, []);

  const grouped = fights.reduce((acc, fight) => {
    const key = `${fight.event} | ${fight.event_date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(fight);
    return acc;
  }, {});

  const toggleEvent = (eventKey) => {
    setExpandedEvent(expandedEvent === eventKey ? null : eventKey);
  };

  return (
    <div className="app-container">
      {Object.entries(grouped).map(([eventKey, eventFights]) => {
        const [eventName, eventDate] = eventKey.split(' | ');
        const eventType = eventFights[0]?.event_type;

        return (
          <div key={eventKey} className="card" style={{ width: '100%' }}>
            <h2 style={{ cursor: 'pointer' }} onClick={() => toggleEvent(eventKey)}>
              {eventName} — {eventDate} ({eventType}) {expandedEvent === eventKey ? '▲' : '▼'}
            </h2>
            {expandedEvent === eventKey && (
              <div>
                {eventFights.map(fight => (
                  <div
                    key={fight.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '1px solid #ddd',
                      padding: '1rem 0'
                    }}
                  >
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <img
                        src={fight.fighter1?.image_url || '/static/images/placeholder.jpg'}
                        alt={fight.fighter1?.name}
                        style={{ width: '80px', borderRadius: '50%' }}
                      />
                      <p>
                        <a href={`https://ufc.com/athlete/${encodeURIComponent(fight.fighter1?.name.toLowerCase().replace(/ /g, '-'))}`} target="_blank" rel="noopener noreferrer">
                          {fight.fighter1?.name}
                        </a>
                      </p>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>vs</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <img
                        src={fight.fighter2?.image_url || '/static/images/placeholder.jpg'}
                        alt={fight.fighter2?.name}
                        style={{ width: '80px', borderRadius: '50%' }}
                      />
                      <p>
                        <a href={`https://ufc.com/athlete/${encodeURIComponent(fight.fighter2?.name.toLowerCase().replace(/ /g, '-'))}`} target="_blank" rel="noopener noreferrer">
                          {fight.fighter2?.name}
                        </a>
                      </p>
                    </div>
                    <div style={{ flex: 2, paddingLeft: '1rem' }}>
                      <p><strong>{fight.card_section}</strong> · {fight.weight_class} lbs · {fight.event_time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Events;
