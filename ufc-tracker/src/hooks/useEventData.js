// src/hooks/useEventData.js
import { useState, useEffect, useMemo } from 'react';
import supabase from '../api/supabaseClient';
import { getEventData } from '../api/supabaseQueries';
import { groupEventsByDate } from '../utils/eventHelpers';

export const useEventData = () => {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch fight data on mount
  useEffect(() => {
    const fetchFights = async () => {
      try {
        setLoading(true);
        setError(null);
        
        try {
          // Try using the existing getEventData function first
          const eventData = await getEventData();
          setFights(eventData);
        } catch (queryError) {
          console.warn('getEventData failed, falling back to direct query:', queryError);
          
          // Fallback to direct supabase query
          const { data, error: supabaseError } = await supabase
            .from('upcoming_fights')
            .select(`
              *,
              fighter1_data:fighter1_id (
                id, name, image_url, image_local_path, nickname, age, height, weight, reach, country,
                wins_total, losses_total, ufc_wins_total, ufc_losses_total, draws_total, ufc_draws_total,
                ufc_wins_ko, ufc_wins_sub, ufc_wins_dec, ufc_losses_ko, ufc_losses_sub, ufc_losses_dec,
                avg_fight_time, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, 
                sig_str_defense, takedown_avg_per_15min, submission_avg_per_15min, knockdown_avg,
                striking_accuracy, takedown_accuracy, takedown_defense
              ),
              fighter2_data:fighter2_id (
                id, name, image_url, image_local_path, nickname, age, height, weight, reach, country,
                wins_total, losses_total, ufc_wins_total, ufc_losses_total, draws_total, ufc_draws_total,
                ufc_wins_ko, ufc_wins_sub, ufc_wins_dec, ufc_losses_ko, ufc_losses_sub, ufc_losses_dec,
                avg_fight_time, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, 
                sig_str_defense, takedown_avg_per_15min, submission_avg_per_15min, knockdown_avg,
                striking_accuracy, takedown_accuracy, takedown_defense
              )
            `)
            .order('event_date');

          if (supabaseError) throw supabaseError;
          setFights(data || []);
        }
      } catch (err) {
        console.error('Error fetching fights:', err);
        setError('Failed to load events. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchFights();
  }, []);

  // Group events by date and sort them
  const groupedEvents = useMemo(() => {
    return groupEventsByDate(fights);
  }, [fights]);

  const sortedEvents = useMemo(() => {
    return Object.entries(groupedEvents).sort(([, a], [, b]) => 
      new Date(a.info.date) - new Date(b.info.date)
    );
  }, [groupedEvents]);

  return {
    fights,
    groupedEvents,
    sortedEvents,
    loading,
    error,
    refetch: () => {
      setLoading(true);
      setError(null);
      // Re-trigger the effect by updating a dependency or calling fetchFights directly
    }
  };
};