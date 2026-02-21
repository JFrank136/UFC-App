// Sorting helper functions

/**
 * Weight class order for sorting
 */
export const WEIGHT_CLASS_ORDER = {
  "Flyweight": 1,
  "Bantamweight": 2,
  "Featherweight": 3,
  "Lightweight": 4,
  "Welterweight": 5,
  "Middleweight": 6,
  "Light Heavyweight": 7,
  "Heavyweight": 8,
  "Women's Strawweight": 9,
  "Women's Flyweight": 10,
  "Women's Bantamweight": 11,
  "Women's Featherweight": 12
};

/**
 * Sort fighters by name (alphabetically)
 */
export const sortByName = (a, b) => {
  return (a.name || a.fighter || '').localeCompare(b.name || b.fighter || '');
};

/**
 * Sort fighters by recently added (newest first)
 */
export const sortByRecent = (a, b) => {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
};

/**
 * Sort fighters by ranking (requires getRankingValue function)
 */
export const sortByRanking = (a, b, getRankingValueFn) => {
  const aRank = getRankingValueFn(a);
  const bRank = getRankingValueFn(b);
  if (aRank === bRank) return (a.fighter || '').localeCompare(b.fighter || '');
  return aRank - bRank;
};

/**
 * Sort fighters by weight class
 */
export const sortByWeightClass = (a, b) => {
  const aWeight = WEIGHT_CLASS_ORDER[a.weight_class] || 999;
  const bWeight = WEIGHT_CLASS_ORDER[b.weight_class] || 999;
  if (aWeight === bWeight) return (a.fighter || '').localeCompare(b.fighter || '');
  return aWeight - bWeight;
};

/**
 * Generic sort function that applies the appropriate sort method
 */
export const getSortedItems = (items, sortBy, getRankingValueFn = null) => {
  const sorted = [...items];
  
  switch (sortBy) {
    case "name":
      sorted.sort(sortByName);
      break;
    case "recent":
      sorted.sort(sortByRecent);
      break;
    case "ranking":
      if (getRankingValueFn) {
        sorted.sort((a, b) => sortByRanking(a, b, getRankingValueFn));
      }
      break;
    case "weight_class":
      sorted.sort(sortByWeightClass);
      break;
    default:
      break;
  }
  
  return sorted;
};