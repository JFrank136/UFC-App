/**
 * Shared formatting utilities for UFC App
 */

/**
 * Format a date string into a readable format
 * @param {string} dateString - ISO date string
 * @param {object} options - Formatting options
 * @returns {string} Formatted date
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return 'Date TBA';

  const defaultOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  };

  try {
    return new Date(dateString).toLocaleDateString('en-US', defaultOptions);
  } catch (error) {
    return 'Invalid Date';
  }
};

/**
 * Format a time string (HH:MM:SS or HH:MM) to 12-hour format
 * @param {string} timeString - Time string
 * @returns {string} Formatted time
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
    return timeString;
  }
};

/**
 * Format fighter record (wins-losses-draws)
 * @param {object} fighter - Fighter object with wins_total and losses_total
 * @returns {string} Formatted record
 */
export const formatRecord = (fighter) => {
  if (!fighter) return 'N/A';

  const wins = fighter.wins_total || fighter.wins || 0;
  const losses = fighter.losses_total || fighter.losses || 0;
  const draws = fighter.draws_total || fighter.draws || 0;

  if (draws > 0) {
    return `${wins}-${losses}-${draws}`;
  }
  return `${wins}-${losses}`;
};

/**
 * Format a statistic value
 * @param {number|string} value - Stat value
 * @param {number} decimals - Number of decimal places
 * @param {string} suffix - Optional suffix to add
 * @returns {string} Formatted stat
 */
export const formatStat = (value, decimals = 1, suffix = '') => {
  if (!value) return 'N/A';

  // If it's already a formatted string with parentheses, return as-is
  if (typeof value === 'string' && value.includes('(')) {
    return value;
  }

  // If it's a number or string number, format it
  const num = parseFloat(value);
  if (!isNaN(num)) {
    return num.toFixed(decimals) + suffix;
  }

  return value.toString();
};

/**
 * Format height in inches to feet and inches
 * @param {number} inches - Height in inches
 * @returns {string} Formatted height
 */
export const formatHeight = (inches) => {
  if (!inches) return 'N/A';
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  return `${feet}'${remainingInches}"`;
};

/**
 * Format reach in inches
 * @param {number} reach - Reach in inches
 * @returns {string} Formatted reach
 */
export const formatReach = (reach) => {
  if (!reach) return 'N/A';
  return `${reach}"`;
};

/**
 * Get division name from weight class
 * @param {string|number} weightClass - Weight class in pounds
 * @returns {string} Division name
 */
export const getDivisionFromWeight = (weightClass, fighter1, fighter2) => {
  if (!weightClass || weightClass === 'TBA') return 'TBA';

  // Check if either fighter has a women's division
  const hasWomensDivision = (fighter) => {
    return fighter?.rankings?.some(r =>
      r.division?.toLowerCase().includes("women's")
    );
  };

  const isWomensFight = hasWomensDivision(fighter1) || hasWomensDivision(fighter2);

  const weightMap = {
    '115': isWomensFight ? "Women's Strawweight" : 'Strawweight',
    '125': isWomensFight ? "Women's Flyweight" : 'Flyweight',
    '135': isWomensFight ? "Women's Bantamweight" : 'Bantamweight',
    '145': isWomensFight ? "Women's Featherweight" : 'Featherweight',
    '155': 'Lightweight',
    '170': 'Welterweight',
    '185': 'Middleweight',
    '205': 'Light Heavyweight',
    '265': 'Heavyweight'
  };

  return weightMap[weightClass] || weightClass;
};

/**
 * Check if event is PPV
 * @param {string} eventName - Event name
 * @param {string} eventType - Event type
 * @returns {boolean} True if PPV
 */
export const isPPV = (eventName, eventType) => {
  if (!eventName) return false;
  return eventType?.toLowerCase().includes('ppv') ||
         /ufc \d+/i.test(eventName.toLowerCase());
};

/**
 * Check if fight is championship
 * @param {object} fight - Fight object
 * @returns {boolean} True if championship fight
 */
export const isChampionshipFight = (fight) => {
  if (!fight) return false;

  const hasChampion = (fighter) => {
    return fighter?.rankings?.some(r => r.rank === 'C');
  };

  return hasChampion(fight.fighter1_data) ||
         hasChampion(fight.fighter2_data) ||
         fight.event?.toLowerCase().includes('title') ||
         fight.fighter1?.toLowerCase().includes('title') ||
         fight.fighter2?.toLowerCase().includes('title');
};

/**
 * Check if event has championship fight
 * @param {array} fights - Array of fights
 * @returns {boolean} True if any fight is championship
 */
export const isChampionshipEvent = (fights) => {
  if (!fights || !Array.isArray(fights)) return false;
  return fights.some(fight => isChampionshipFight(fight));
};

/**
 * Get main event from fights array
 * @param {array} fights - Array of fights
 * @returns {object|null} Main event fight
 */
export const getMainEvent = (fights) => {
  if (!fights || !Array.isArray(fights) || fights.length === 0) return null;

  // Main event is typically the first fight in the Main Card section
  const mainCardFights = fights.filter(f => f.card_section === 'Main');
  if (mainCardFights.length > 0) {
    return mainCardFights[0];
  }

  // Fallback to first fight
  return fights[0];
};

/**
 * Get recent fights for a fighter
 * @param {object} fighter - Fighter object with fight_history
 * @param {number} limit - Number of fights to return
 * @returns {array} Recent fights
 */
export const getRecentFights = (fighter, limit = 5) => {
  if (!fighter?.fight_history || !Array.isArray(fighter.fight_history)) {
    return [];
  }

  return fighter.fight_history
    .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date))
    .slice(0, limit);
};

/**
 * Get finish rates for a fighter
 * @param {object} fighter - Fighter object
 * @returns {object} Finish rates { ko, sub, dec }
 */
export const getFinishRates = (fighter) => {
  if (!fighter) return { ko: 0, sub: 0, dec: 0 };

  const totalUFCFights = (fighter.ufc_wins_total || 0) + (fighter.ufc_losses_total || 0);
  const totalAllFights = (fighter.wins_total || 0) + (fighter.losses_total || 0);
  const totalFights = totalUFCFights > 0 ? totalUFCFights : totalAllFights;

  if (totalFights === 0) return { ko: 0, sub: 0, dec: 0 };

  const totalKO = (fighter.ufc_wins_ko || fighter.wins_ko || 0) +
                  (fighter.ufc_losses_ko || fighter.losses_ko || 0);
  const totalSub = (fighter.ufc_wins_sub || fighter.wins_sub || 0) +
                   (fighter.ufc_losses_sub || fighter.losses_sub || 0);
  const totalDec = (fighter.ufc_wins_dec || fighter.wins_dec || 0) +
                   (fighter.ufc_losses_dec || fighter.losses_dec || 0);

  return {
    ko: Math.round((totalKO / totalFights) * 100),
    sub: Math.round((totalSub / totalFights) * 100),
    dec: Math.round((totalDec / totalFights) * 100)
  };
};
