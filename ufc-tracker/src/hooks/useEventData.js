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

          // Fallback to direct supabase query — filter by date to keep fighter count low
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 3);
          const cutoffStr = cutoff.toISOString().split('T')[0];

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
            .gte('event_date', cutoffStr)
            .order('event_date');

          if (supabaseError) throw supabaseError;

          const fights = data || [];

          // Fetch fight_history separately since it can't be joined via FK in this query
          const fighterIds = [...new Set([
            ...fights.map(f => f.fighter1_id),
            ...fights.map(f => f.fighter2_id)
          ].filter(Boolean))];

          const { data: fightHistory } = fighterIds.length > 0
            ? await supabase.from('fight_history').select('*').in('fighter_id', fighterIds)
            : { data: [] };

          const { data: rankings } = fighterIds.length > 0
            ? await supabase.from('rankings').select('*').in('uuid', fighterIds)
            : { data: [] };

          const enrichedFights = fights.map(fight => {
            const enrich = (fighterData, fighterId) => {
              if (!fighterData) return null;
              return {
                ...fighterData,
                fight_history: fightHistory?.filter(h => h.fighter_id === fighterId) || [],
                rankings: rankings?.filter(r => r.uuid === fighterId) || []
              };
            };
            return {
              ...fight,
              fighter1_data: enrich(fight.fighter1_data, fight.fighter1_id),
              fighter2_data: enrich(fight.fighter2_data, fight.fighter2_id)
            };
          });

          setFights(enrichedFights);
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