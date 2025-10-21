/**
 * Utility functions for Events page
 */

/**
 * Get the main event from a list of fights (highest fight_order)
 */
export const getMainEvent = (fights) => {
  return fights.reduce((main, fight) => {
    if (!main || (fight.fight_order || 0) > (main.fight_order || 0)) {
      return fight;
    }
    return main;
  }, null);
};

/**
 * Determine if an event is a PPV event
 */
export const isPPV = (eventName, eventType) => {
  return eventType?.toLowerCase().includes('ppv') ||
         (eventName.toLowerCase().includes('ufc ') && /ufc \d+/.test(eventName.toLowerCase()));
};

/**
 * Check if a fight is a championship fight
 */
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

/**
 * Check if any fight in an event is a championship fight
 */
export const isChampionshipEvent = (fights) => {
  return fights.some(fight => isChampionshipFight(fight));
};

/**
 * Format date string to readable format
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

/**
 * Format time string to 12-hour format with AM/PM
 */
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
 * Format fighter record as "W-L"
 */
export const formatRecord = (fighter) => {
  if (!fighter) return 'N/A';
  const wins = fighter.wins_total || 0;
  const losses = fighter.losses_total || 0;
  return `${wins}-${losses}`;
};

/**
 * Get division name from weight class and fighter data
 */
export const getDivisionFromWeight = (weightClass, fighter1, fighter2) => {
  if (!weightClass || weightClass === 'TBA') return 'TBA';

  // First try to get division from fighters' rankings
  const f1Division = fighter1?.rankings?.find(r => !r.division?.toLowerCase().includes('pound-for-pound'))?.division;
  const f2Division = fighter2?.rankings?.find(r => !r.division?.toLowerCase().includes('pound-for-pound'))?.division;

  if (f1Division && f2Division && f1Division === f2Division) return f1Division;
  if (f1Division && !f2Division) return f1Division;
  if (f2Division && !f1Division) return f2Division;

  // Fallback to weight mapping
  const weightMap = {
    '125': 'Flyweight',
    '135': 'Bantamweight',
    '145': 'Featherweight',
    '155': 'Lightweight',
    '170': 'Welterweight',
    '185': 'Middleweight',
    '205': 'Light Heavyweight',
    '265': 'Heavyweight',
    '115': "Women's Strawweight"
  };

  let division = weightMap[weightClass] || weightClass;

  // Check if either fighter has "women's" in their division
  const hasWomensDiv = (f1Division && f1Division.toLowerCase().includes("women's")) ||
                      (f2Division && f2Division.toLowerCase().includes("women's"));

  if (hasWomensDiv && !division.toLowerCase().includes("women's")) {
    const womensMap = {
      'Flyweight': "Women's Flyweight",
      'Bantamweight': "Women's Bantamweight",
      'Featherweight': "Women's Featherweight"
    };
    division = womensMap[division] || `Women's ${division}`;
  }

  return division;
};

/**
 * Calculate finish rates for a fighter (KO, SUB, DEC percentages)
 */
export const getFinishRates = (fighter) => {
  if (!fighter) return { ko: 0, sub: 0, dec: 0 };

  const totalWins = fighter.wins_total || 0;
  if (totalWins === 0) return { ko: 0, sub: 0, dec: 0 };

  const koRate = Math.round(((fighter.wins_ko || 0) / totalWins) * 100);
  const subRate = Math.round(((fighter.wins_sub || 0) / totalWins) * 100);
  const decRate = Math.round(((fighter.wins_dec || 0) / totalWins) * 100);

  return { ko: koRate, sub: subRate, dec: decRate };
};

/**
 * Format stat value with decimals and suffix
 */
export const formatStat = (value, decimals = 1, suffix = '') => {
  if (!value) return 'N/A';

  if (typeof value === 'string' && value.includes('(')) {
    return value;
  }

  const num = parseFloat(value);
  if (!isNaN(num)) {
    return num.toFixed(decimals) + suffix;
  }

  return value.toString();
};

/**
 * Get recent fights from fighter's fight history
 */
export const getRecentFights = (fighter, limit = 3) => {
  if (!fighter?.fight_history) return [];
  return fighter.fight_history
    .filter(fight => fight.opponent && fight.result) // Filter out incomplete data
    .sort((a, b) => new Date(b.fight_date || '1900-01-01') - new Date(a.fight_date || '1900-01-01'))
    .slice(0, limit);
};

/**
 * Group fights by card section (Main Card, Preliminary Card, Early Prelims)
 */
export const groupFightsBySection = (fights) => {
  const sections = {
    'Main Card': [],
    'Preliminary Card': [],
    'Early Prelims': []
  };

  fights.forEach(fight => {
    const section = fight.card_section || 'Prelim';
    if (section === 'Main' || section === 'Main Card') {
      sections['Main Card'].push(fight);
    } else if (section === 'Prelim' || section === 'Preliminary Card') {
      sections['Preliminary Card'].push(fight);
    } else {
      sections['Early Prelims'].push(fight);
    }
  });

  // Sort fights within each section by fight order (higher numbers first)
  Object.values(sections).forEach(sectionFights => {
    sectionFights.sort((a, b) => (b.fight_order || 0) - (a.fight_order || 0));
  });

  return sections;
};

/**
 * Get fighter rankings (divisional and P4P)
 */
export const getRankings = (fighter) => {
  if (!fighter?.rankings || !Array.isArray(fighter.rankings)) {
    return { divisional: null, p4p: null };
  }

  const p4p = fighter.rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
  const divisionRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound') && r.rank !== 'NR');

  return { divisional: divisionRank, p4p };
};

/**
 * Calculate finish rates by type (all, wins, or losses)
 */
export const getFinishRatesByType = (fighter, type = 'all') => {
  if (!fighter) return { ko: 0, sub: 0, dec: 0, total: 0 };

  if (type === 'wins') {
    const totalWins = fighter.wins_total || 0;
    if (totalWins === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    return {
      ko: Math.round(((fighter.wins_ko || 0) / totalWins) * 100),
      sub: Math.round(((fighter.wins_sub || 0) / totalWins) * 100),
      dec: Math.round(((fighter.wins_dec || 0) / totalWins) * 100),
      total: totalWins
    };
  } else if (type === 'losses') {
    const totalLosses = fighter.losses_total || 0;
    if (totalLosses === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    return {
      ko: Math.round(((fighter.losses_ko || 0) / totalLosses) * 100),
      sub: Math.round(((fighter.losses_sub || 0) / totalLosses) * 100),
      dec: Math.round(((fighter.losses_dec || 0) / totalLosses) * 100),
      total: totalLosses
    };
  } else {
    const totalFights = (fighter.wins_total || 0) + (fighter.losses_total || 0);
    if (totalFights === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    const totalKO = (fighter.wins_ko || 0) + (fighter.losses_ko || 0);
    const totalSub = (fighter.wins_sub || 0) + (fighter.losses_sub || 0);
    const totalDec = (fighter.wins_dec || 0) + (fighter.losses_dec || 0);
    return {
      ko: Math.round((totalKO / totalFights) * 100),
      sub: Math.round((totalSub / totalFights) * 100),
      dec: Math.round((totalDec / totalFights) * 100),
      total: totalFights
    };
  }
};
