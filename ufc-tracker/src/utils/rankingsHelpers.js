// Rankings-specific helper functions

/**
 * Parse rank change text into a numeric value or special status
 * Returns: number (positive/negative), 'NEW', 'RET', 'INTERIM', or 0
 */
export const parseRankChange = (changeText) => {
  if (!changeText) return null;
  
  // Handle special cases
  if (changeText.toLowerCase().includes('new') || changeText.toLowerCase().includes('debut')) {
    return 'NEW';
  }
  if (changeText.toLowerCase().includes('return')) {
    return 'RET';
  }
  if (changeText.toLowerCase().includes('interim')) {
    return 'INTERIM';
  }
  
  // Extract numeric changes - updated patterns
  const increaseMatch = changeText.match(/increased by (\d+)/i);
  if (increaseMatch) {
    return parseInt(increaseMatch[1]);
  }
  
  const decreaseMatch = changeText.match(/decreased by (\d+)/i);
  if (decreaseMatch) {
    return -parseInt(decreaseMatch[1]);
  }
  
  // Handle "RANK INCREASED BY X" format
  const rankIncreaseMatch = changeText.match(/rank increased by (\d+)/i);
  if (rankIncreaseMatch) {
    return parseInt(rankIncreaseMatch[1]);
  }
  
  const rankDecreaseMatch = changeText.match(/rank decreased by (\d+)/i);
  if (rankDecreaseMatch) {
    return -parseInt(rankDecreaseMatch[1]);
  }
  
  // Look for +/- patterns
  const plusMatch = changeText.match(/\+(\d+)/);
  if (plusMatch) {
    return parseInt(plusMatch[1]);
  }
  
  const minusMatch = changeText.match(/-(\d+)/);
  if (minusMatch) {
    return -parseInt(minusMatch[1]);
  }
  
  return 0;
};

/**
 * Format a stat value with decimals
 */
export const formatStat = (value, decimals = 1) => {
  if (!value) return 'N/A';
  if (typeof value === 'string' && value.includes('(')) return value;
  const num = parseFloat(value);
  if (!isNaN(num)) return num.toFixed(decimals);
  return value.toString();
};

/**
 * Division lists for Rankings
 */
export const DIVISIONS = [
  'Flyweight',
  'Bantamweight', 
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
  "Women's Featherweight"
];

export const P4P_DIVISIONS = [
  "Men's Pound-for-Pound",
  "Women's Pound-for-Pound"
];