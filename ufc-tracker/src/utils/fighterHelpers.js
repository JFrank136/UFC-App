// Fighter-related helper functions

/**
 * Get the numeric ranking value for sorting purposes
 * P4P rankings get priority (lower values)
 * Division rankings are offset by 15
 * Unranked fighters get 999
 */
export const getRankingValue = (fighter) => {
  if (!fighter.ufc_rankings || !Array.isArray(fighter.ufc_rankings)) return 999;
  
  const p4p = fighter.ufc_rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
  if (p4p) return p4p.rank;
  
  const divisionRank = fighter.ufc_rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
  if (divisionRank) return divisionRank.rank + 15; // P4P gets priority
  
  return 999;
};

/**
 * Get ranking display data (P4P and division rankings)
 * For Favorites page - includes all division rankings
 */
export const getRankingDisplay = (rankings) => {
  if (!rankings || !Array.isArray(rankings)) return null;
  
  const p4p = rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
  const divisionRank = rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
  
  return { p4p, divisionRank };
};

/**
 * Get ranking display for SearchFighter
 * Excludes 'NR' (Not Ranked) fighters from division rankings
 */
export const getRankingDisplayForSearch = (rankings) => {
  if (!rankings || !Array.isArray(rankings)) return null;
  
  const p4p = rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
  const divisionRank = rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound') && r.rank !== 'NR');
  
  return { p4p, divisionRank };
};

/**
 * Capitalize each word in a string
 */
export const capitalize = (str) =>
  str
    ?.split(" ")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ") || "";

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
 * Calculate finish rate percentage
 */
export const getFinishRate = (fighter) => {
  if (!fighter || !fighter.wins_total) return 0;
  const finishes = (fighter.wins_ko || 0) + (fighter.wins_sub || 0);
  return Math.round((finishes / fighter.wins_total) * 100);
};