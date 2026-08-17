import { useState, useEffect } from 'react';
import { computeCountdownParts } from '../utils/upcomingFightsHelpers';

export const useCountdown = (targetDate) => {
  const targetMs = targetDate ? targetDate.getTime() : null;
  const [parts, setParts] = useState(() => (targetMs ? computeCountdownParts(targetMs, Date.now()) : null));

  useEffect(() => {
    if (!targetMs) {
      setParts(null);
      return undefined;
    }
    setParts(computeCountdownParts(targetMs, Date.now()));
    const interval = setInterval(() => {
      setParts(computeCountdownParts(targetMs, Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  return parts;
};
