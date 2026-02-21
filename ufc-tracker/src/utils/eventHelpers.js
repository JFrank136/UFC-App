// src/utils/eventHelpers.js

/**
 * Date and time formatting utilities
 */
export const formatDate = (dateString) => {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
};

export const formatTime = (timeString) => {
  if (!timeString) return 'Time TBA';
  try {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm} EST`;
  } catch (error) {
    return 'Time TBA';
  }
};

/**
 * Fighter record formatting
 */
export const formatRecord = (fighter) => {
  if (!fighter) return 'N/A';
  const wins = fighter.ufc_wins_total || fighter.wins_total || 0;
  const losses = fighter.ufc_losses_total || fighter.losses_total || 0;
  const draws = fighter.ufc_draws_total || fighter.draws_total || 0;
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
};

/**
 * Fight and event utilities
 */
export const getMainEvent = (fights) => {
  return fights.reduce((main, fight) => {
    if (!main || (fight.fight_order || 0) > (main.fight_order || 0)) {
      return fight;
    }
    return main;
  }, null);
};

export const isPPV = (eventName, eventType) => {
  return eventType?.toLowerCase().includes('ppv') || 
         (eventName.toLowerCase().includes('ufc ') && /ufc \d+/.test(eventName.toLowerCase()));
};

export const isChampionshipFight = (fight) => {
  const f1 = fight.fighter1_data || fight.fighter1;
  const f2 = fight.fighter2_data || fight.fighter2;
  
  const hasChampionRank = (f1?.rankings && f1.rankings.some(r => r.rank === 'C')) ||
                         (f2?.rankings && f2.rankings.some(r => r.rank === 'C'));
  
  const hasTitleInName = fight.event?.toLowerCase().includes('title') ||
                        fight.fighter1?.toLowerCase().includes('title') ||
                        fight.fighter2?.toLowerCase().includes('title');
  
  return hasChampionRank || hasTitleInName;
};

export const isChampionshipEvent = (fights) => {
  return fights.some(fight => isChampionshipFight(fight));
};

/**
 * Weight class and division utilities
 */
export const getDivisionFromWeight = (weightClass, fighter1, fighter2) => {
  // If we have a weight class string, use it
  if (weightClass && isNaN(weightClass)) {
    return weightClass;
  }
  
  // If it's a number, convert to division
  const weight = parseInt(weightClass);
  if (!weight) return 'Unknown';
  
  const weightClassMap = {
    125: "Flyweight",
    135: "Bantamweight", 
    145: "Featherweight",
    155: "Lightweight",
    170: "Welterweight",
    185: "Middleweight",
    205: "Light Heavyweight",
    265: "Heavyweight"
  };
  
  // Check if it's women's division based on fighter data
  const isWomens = fighter1?.weight_class?.toLowerCase().includes("women") ||
                   fighter2?.weight_class?.toLowerCase().includes("women");
  
  const division = weightClassMap[weight] || `${weight} lbs`;
  return isWomens ? `Women's ${division}` : division;
};

/**
 * Fight organization utilities
 */
export const groupFightsBySection = (fights) => {
  const grouped = fights.reduce((acc, fight) => {
    const raw = fight.card_section || '';
    let section;
    // Match both short ('Main') and full ('Main Card') values from Supabase
    if (raw === 'Main Card' || raw === 'Main') {
      section = 'Main Card';
    } else if (raw === 'Preliminary Card' || raw === 'Prelim' || raw === 'Prelims') {
      section = 'Preliminary Card';
    } else {
      section = 'Early Prelims';
    }

    if (!acc[section]) acc[section] = [];
    acc[section].push(fight);
    return acc;
  }, {});

  // Sort fights within each section by fight_order descending (main event first)
  Object.keys(grouped).forEach(section => {
    grouped[section].sort((a, b) => (b.fight_order || 0) - (a.fight_order || 0));
  });

  return grouped;
};

/**
 * Fighter statistics utilities
 */
export const getRecentFights = (fighter, limit = 3) => {
  if (!fighter?.fight_history) return [];
  return fighter.fight_history
    .filter(fight => fight.opponent && fight.result)
    .sort((a, b) => new Date(b.fight_date || '1900-01-01') - new Date(a.fight_date || '1900-01-01'))
    .slice(0, limit);
};

export const getFinishRates = (fighter) => {
  if (!fighter) return { ko: 0, sub: 0, dec: 0 };
  
  const totalWins = fighter.ufc_wins_total || fighter.wins_total || 0;
  if (totalWins === 0) return { ko: 0, sub: 0, dec: 0 };
  
  const koRate = Math.round(((fighter.ufc_wins_ko || 0) / totalWins) * 100);
  const subRate = Math.round(((fighter.ufc_wins_sub || 0) / totalWins) * 100);
  const decRate = Math.round(((fighter.ufc_wins_dec || 0) / totalWins) * 100);
  
  return { ko: koRate, sub: subRate, dec: decRate };
};

/**
 * Event grouping utilities
 */
export const groupEventsByDate = (fights) => {
  return fights.reduce((acc, fight) => {
    const eventKey = `${fight.event}-${fight.event_date}`;
    
    if (!acc[eventKey]) {
      acc[eventKey] = {
        info: {
          name: fight.event,
          date: fight.event_date,
          time: fight.event_time,
          venue: fight.venue,
          location: fight.location,
          type: fight.event_type,
          imageUrl: fight.fight_card_image_url,
          imagePath: fight.fight_card_image_local_path
        },
        fights: []
      };
    }
    
    acc[eventKey].fights.push(fight);
    return acc;
  }, {});
};