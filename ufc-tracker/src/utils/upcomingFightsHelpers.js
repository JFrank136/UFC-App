/**
 * Priority score for a fight based on whether either fighter is on the
 * user's list: 2 = a favorite is involved, 1 = only an interested fighter
 * is involved, 0 = neither.
 */
export const getFightPriorityScore = (fight) => {
  const allFavorites = [...(fight.fighter1_favorites || []), ...(fight.fighter2_favorites || [])];
  if (allFavorites.some((f) => f.priority === 'favorite')) return 2;
  if (allFavorites.some((f) => f.priority === 'interested')) return 1;
  return 0;
};

/**
 * Picks which fight in an event gets the large "headline" card treatment,
 * versus a compact row. A single fight always gets the headline treatment.
 * With multiple fights, the top one gets it only if it strictly outranks
 * the next — otherwise nothing stands out enough and every fight renders
 * compact. Internally sorts by priority descending, so input order does not
 * matter.
 */
export const selectHeadlineFight = (fights) => {
  if (!fights || fights.length === 0) return null;
  if (fights.length === 1) return fights[0];
  const sorted = [...fights].sort((a, b) => getFightPriorityScore(b) - getFightPriorityScore(a));
  const topScore = getFightPriorityScore(sorted[0]);
  const secondScore = getFightPriorityScore(sorted[1]);
  return topScore > secondScore ? sorted[0] : null;
};

/**
 * Splits an event's "YYYY-MM-DD" date string into the parts the date chip
 * and event header need. Appends T00:00:00 so the Date is parsed in the
 * local timezone instead of UTC (avoids the classic off-by-one-day bug).
 */
export const getDateParts = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
  };
};

/**
 * Splits a millisecond countdown into days/hours/minutes/seconds. Pure
 * function (no Date.now() inside) so it's trivially testable — the
 * useCountdown hook supplies "now" from the caller.
 */
export const computeCountdownParts = (targetMs, nowMs) => {
  const diff = targetMs - nowMs;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    isPast: false,
  };
};

/**
 * Formats a fight_history entry's "YYYY-MM-DD" date as "Mon 'YY" for the
 * recent-fights list. Appends T00:00:00 so it parses in local time
 * instead of UTC (same off-by-one-day guard as getDateParts).
 */
export const formatFightDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
};
