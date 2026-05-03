// supabaseQueries.js
import supabase from './supabaseClient';

// Events.js - Everything but user_favorites
export const getEventData = async () => {
  // Only fetch events from 3 days ago onward to keep fighter count manageable
  // (fetching all upcoming fights leads to 400+ fighters, hitting Supabase's 1000-row limit on fight_history)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: fights, error } = await supabase
    .from('upcoming_fights')
    .select('*')
    .gte('event_date', cutoffStr)
    .order('event_date');

  if (error) throw error;
  if (!fights || fights.length === 0) return [];

  // Get all unique fighter IDs
  const fighterIds = [...new Set([
    ...fights.map(f => f.fighter1_id),
    ...fights.map(f => f.fighter2_id)
  ].filter(Boolean))];

  // Get fighters data
  const { data: fighters, error: fightersError } = await supabase
    .from('fighters')
    .select('*')
    .in('id', fighterIds);

  if (fightersError) throw fightersError;

  // Paginate fight_history to bypass Supabase's 1000-row default limit
  let fightHistory = [];
  let rangeStart = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('fight_history')
      .select('*')
      .in('fighter_id', fighterIds)
      .range(rangeStart, rangeStart + PAGE_SIZE - 1);
    if (batchError) throw batchError;
    if (!batch || batch.length === 0) break;
    fightHistory = fightHistory.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    rangeStart += PAGE_SIZE;
  }

  const { data: rankings, error: rankingsError } = await supabase
    .from('rankings')
    .select('*')
    .in('uuid', fighterIds);

  if (rankingsError) throw rankingsError;

  // Combine data
  const fightersMap = {};
  fighters?.forEach(fighter => {
    fightersMap[fighter.id] = {
      ...fighter,
      fight_history: fightHistory?.filter(h => h.fighter_id === fighter.id) || [],
      rankings: rankings?.filter(r => r.uuid === fighter.id) || []
    };
  });

  return fights.map(fight => ({
    ...fight,
    fighter1_data: fightersMap[fight.fighter1_id] || null,
    fighter2_data: fightersMap[fight.fighter2_id] || null
  }));
};

// Favorites.js - Every table
export const getFavoritesWithAllData = async (userName) => {
  const { data: favorites, error } = await supabase
    .from('user_favorites')
    .select('*')
    .eq('user', userName);

  if (error) throw error;
  if (!favorites || favorites.length === 0) return [];

  const fighterIds = favorites.map(f => f.fighter_id);

  // Get all related data
  const [
    { data: fighters, error: fightersError },
    { data: fightHistory, error: historyError },
    { data: rankings, error: rankingsError },
    { data: upcomingFights, error: fightsError }
  ] = await Promise.all([
    supabase.from('fighters').select('*').in('id', fighterIds),
    supabase.from('fight_history').select('*').in('fighter_id', fighterIds),
    supabase.from('rankings').select('*').in('uuid', fighterIds),
    supabase.from('upcoming_fights').select('*').or(`fighter1_id.in.(${fighterIds.join(',')}),fighter2_id.in.(${fighterIds.join(',')})`)
  ]);

  if (fightersError || historyError || rankingsError || fightsError) {
    throw fightersError || historyError || rankingsError || fightsError;
  }

  // Combine data
  return favorites.map(favorite => ({
    ...favorite,
    fighters: {
      ...(fighters?.find(f => f.id === favorite.fighter_id) || {}),
      fight_history: fightHistory?.filter(h => h.fighter_id === favorite.fighter_id) || [],
      rankings: rankings?.filter(r => r.uuid === favorite.fighter_id) || [],
      upcoming_fights: upcomingFights?.filter(f => 
        f.fighter1_id === favorite.fighter_id || f.fighter2_id === favorite.fighter_id
      ) || []
    }
  }));
};

// FighterStats.js - Every table but user_favorites
export const getFighterStats = async (id) => {
  const [
    { data: fighter, error: fighterError },
    { data: fightHistory, error: historyError },
    { data: rankings, error: rankingsError },
    { data: upcomingFights, error: fightsError }
  ] = await Promise.all([
    supabase.from('fighters').select('*').eq('id', id).single(),
    supabase.from('fight_history').select('*').eq('fighter_id', id),
    supabase.from('rankings').select('*').eq('uuid', id),
    supabase.from('upcoming_fights').select('*').or(`fighter1_id.eq.${id},fighter2_id.eq.${id}`)
  ]);

  if (fighterError) throw fighterError;
  if (historyError) throw historyError;
  if (rankingsError) throw rankingsError;
  if (fightsError) throw fightsError;

  return {
    ...fighter,
    fight_history: fightHistory || [],
    rankings: rankings || [],
    upcoming_fights: upcomingFights || []
  };
};

// Rankings.js - Every table but user_favorites
export const getRankingsWithFighterData = async () => {
  const { data: rankings, error } = await supabase
    .from('rankings')
    .select('*')
    .order('division')
    .order('rank');

  if (error) throw error;
  if (!rankings || rankings.length === 0) return [];

  const fighterIds = rankings.map(r => r.uuid);

  // Get fighters, fight history, and upcoming fights
  const [
    { data: fighters, error: fightersError },
    { data: fightHistory, error: historyError },
    { data: upcomingFights, error: fightsError }
  ] = await Promise.all([
    supabase.from('fighters').select('*').in('id', fighterIds),
    supabase.from('fight_history').select('*').in('fighter_id', fighterIds),
    supabase.from('upcoming_fights').select('*').or(`fighter1_id.in.(${fighterIds.join(',')}),fighter2_id.in.(${fighterIds.join(',')})`)
  ]);

  if (fightersError || historyError || fightsError) {
    throw fightersError || historyError || fightsError;
  }

  // Combine data
  return rankings.map(ranking => ({
    ...ranking,
    fighters: {
      ...(fighters?.find(f => f.id === ranking.uuid) || {}),
      fight_history: fightHistory?.filter(h => h.fighter_id === ranking.uuid) || [],
      upcoming_fights: upcomingFights?.filter(f => 
        f.fighter1_id === ranking.uuid || f.fighter2_id === ranking.uuid
      ) || []
    }
  }));
};

// SearchFighter.js - Every table but fight_history and upcoming_fights
export const searchFightersWithRanking = async (name) => {
  const { data: fighters, error } = await supabase
    .from('fighters')
    .select('*')
    .ilike('name', `%${name}%`);

  if (error) throw error;
  if (!fighters || fighters.length === 0) return [];

  const fighterIds = fighters.map(f => f.id);

  // Get rankings and user favorites
  const [
    { data: rankings, error: rankingsError },
    { data: userFavorites, error: favoritesError }
  ] = await Promise.all([
    supabase.from('rankings').select('*').in('uuid', fighterIds),
    supabase.from('user_favorites').select('*').in('fighter_id', fighterIds)
  ]);

  if (rankingsError || favoritesError) {
    throw rankingsError || favoritesError;
  }

  // Combine data
  return fighters.map(fighter => ({
    ...fighter,
    rankings: rankings?.filter(r => r.uuid === fighter.id) || [],
    user_favorites: userFavorites?.filter(f => f.fighter_id === fighter.id) || []
  }));
};

// UpcomingFights.js - Every table
export const getFullUpcomingFights = async () => {
  const { data: fights, error } = await supabase
    .from('upcoming_fights')
    .select('*')
    .order('event_date');

  if (error) throw error;
  if (!fights || fights.length === 0) return [];

  // Get all unique fighter IDs
  const fighterIds = [...new Set([
    ...fights.map(f => f.fighter1_id),
    ...fights.map(f => f.fighter2_id)
  ].filter(Boolean))];

  // Get all related data
  const [
    { data: fighters, error: fightersError },
    { data: fightHistory, error: historyError },
    { data: rankings, error: rankingsError },
    { data: userFavorites, error: favoritesError }
  ] = await Promise.all([
    supabase.from('fighters').select('*').in('id', fighterIds),
    supabase.from('fight_history').select('*').in('fighter_id', fighterIds),
    supabase.from('rankings').select('*').in('uuid', fighterIds),
    supabase.from('user_favorites').select('*').in('fighter_id', fighterIds)
  ]);

  if (fightersError || historyError || rankingsError || favoritesError) {
    throw fightersError || historyError || rankingsError || favoritesError;
  }

  // Combine data
  const fightersMap = {};
  fighters?.forEach(fighter => {
    fightersMap[fighter.id] = {
      ...fighter,
      fight_history: fightHistory?.filter(h => h.fighter_id === fighter.id) || [],
      rankings: rankings?.filter(r => r.uuid === fighter.id) || [],
      user_favorites: userFavorites?.filter(f => f.fighter_id === fighter.id) || []
    };
  });

  // Add fighter data to fights
  return fights.map(fight => ({
    ...fight,
    fighter1_data: fightersMap[fight.fighter1_id] || null,
    fighter2_data: fightersMap[fight.fighter2_id] || null
  }));
};

// UFC Picks
export const saveUFCGame = async (gameData) => {
  const { data, error } = await supabase
    .from('ufc_games')
    .insert(gameData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const getActiveGame = async () => {
  const { data, error } = await supabase
    .from('ufc_games')
    .select('*')
    .eq('game_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
    
  if (error) throw error;
  return data;
};