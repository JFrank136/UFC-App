import React, { useEffect, useState } from 'react';
import supabase from '../api/supabaseClient';
import '../App.css';


const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [userFilter, setUserFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  useEffect(() => {
    const fetchFights = async () => {
      const { data: favorites, error: favError } = await supabase
        .from('user_favorites')
        .select('fighter_id, user, priority');

      if (favError) return console.error(favError);

      const selectedUsers = userFilter === 'All' ? ['Jared', 'Mars'] : [userFilter];
      const filteredFavorites = favorites.filter(f => selectedUsers.includes(f.user));

      const prioritized =
        priorityFilter === 'All'
          ? filteredFavorites
          : filteredFavorites.filter(f => f.priority.toLowerCase() === priorityFilter.toLowerCase());

      const favoriteIds = prioritized.map(f => f.fighter_id);

      const { data: fightsRaw, error: fightsError } = await supabase
        .from('upcoming_fights')
        .select(`*, fighter1:fighter1_id (id, name, image_url), fighter2:fighter2_id (id, name, image_url)`);

      if (fightsError) return console.error(fightsError);

      const relevantFights = fightsRaw.filter(f =>
        favoriteIds.includes(f.fighter1_id) || favoriteIds.includes(f.fighter2_id)
      );

      // Sort by event date, then fight order
      relevantFights.sort((a, b) => {
        const dateCompare = new Date(a.event_date) - new Date(b.event_date);
        return dateCompare !== 0 ? dateCompare : a.fight_order - b.fight_order;
      });

      setFights(relevantFights);
    };

    fetchFights();
  }, [userFilter, priorityFilter]);

  const groupedByEvent = fights.reduce((acc, fight) => {
    const key = `${fight.event} - ${fight.event_date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(fight);
    return acc;
  }, {});

  return (
    <div className="app-container">
      <div style={{ width: '100%', marginBottom: '1rem' }}>
        <label>User:</label>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option>All</option>
          <option>Jared</option>
          <option>Mars</option>
        </select>
        <label style={{ marginLeft: '1rem' }}>Priority:</label>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option>All</option>
          <option>Favorite</option>
          <option>Interested</option>
        </select>
      </div>

      {Object.entries(groupedByEvent).map(([eventKey, fights]) => (
        <div key={eventKey} style={{ width: '100%' }}>
          <h2>{eventKey}</h2>
          <div className="app-container">
            {fights.map(fight => (
              <div className="card" key={fight.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={fight.fighter1?.image_url || '/static/images/placeholder.jpg'}
                      alt={fight.fighter1?.name}
                      style={{ width: '100px', borderRadius: '50%' }}
                    />
                    <p>{fight.fighter1?.name}</p>
                  </div>
                  <div style={{ textAlign: 'center', alignSelf: 'center' }}>vs</div>
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={fight.fighter2?.image_url || '/static/images/placeholder.jpg'}
                      alt={fight.fighter2?.name}
                      style={{ width: '100px', borderRadius: '50%' }}
                    />
                    <p>{fight.fighter2?.name}</p>
                  </div>
                </div>
                <p style={{ marginTop: '1rem' }}>
                  {fight.card_section} • {fight.weight_class} • {fight.event_time}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default UpcomingFights;
