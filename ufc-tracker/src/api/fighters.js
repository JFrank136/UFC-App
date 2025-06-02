import supabase from "./supabaseClient";

// Search Fighters
export async function searchFighters(query) {
  const { data, error } = await supabase
    .from("fighters")
    .select("*")
    .ilike("name", `%${query}%`)
    .limit(10);

  if (error) {
    console.error("Supabase error:", error);
    return [];
  }
  return data;
}

// Add to User Favorites (with duplicate prevention)
export async function addToFavorites({ fighterName, fighter_id, group, priority }) {
  // Prevent duplicate
  const { data: exists, error: checkError } = await supabase
    .from("user_favorites")
    .select("id")
    .eq("fighter_id", fighter_id)
    .eq("user", group)
    .eq("priority", priority);

  if (checkError) {
    console.error("Error checking for duplicate:", checkError);
    throw checkError;
  }
  if (exists && exists.length > 0) {
    throw new Error("This fighter is already saved for this user/priority.");
  }

  const { data, error } = await supabase
    .from("user_favorites")
    .insert([
      {
        fighter: fighterName,
        fighter_id:  fighter_id,
        user: group,
        priority: priority,
        // OMIT fighter_id entirely
        added_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) {
    console.error("Failed to add to favorites:", error);
    throw error;
  }
  return data?.[0];
}

// Get User Favorites
export async function getUserFavorites({ group, priority }) {
  const { data, error } = await supabase
    .from("user_favorites")
    .select("*")
    .eq("user", group)
    .eq("priority", priority)
    .order("added_at", { ascending: false });

  if (error) {
    console.error("Error fetching favorites:", error);
    return [];
  }
  return data;
}

// Remove from Favorites
export async function removeFavorite(id) {
  const { error } = await supabase
    .from("user_favorites")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error removing favorite:", error);
    throw error;
  }
}

// Get all favorites for a user (for upcoming fights)
export async function getAllFavoritesForUser(user) {
  const { data, error } = await supabase
    .from("user_favorites")
    .select("fighter")
    .eq("user", user)
    .eq("priority", "favorite");
  if (error) {
    console.error("Error fetching favorites:", error);
    return [];
  }
  return data.map((row) => row.fighter);
}

// Get upcoming fights for user's favorite fighters (needs events structure)
export async function getUpcomingFightsForFighters(fighterNames) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .gte("date", new Date().toISOString().slice(0, 10));
  if (error) {
    console.error("Error fetching events:", error);
    return [];
  }
  return data.filter(event =>
    event.fighters &&
    fighterNames.some(name =>
      event.fighters.toLowerCase().includes(name.toLowerCase())
    )
  );
}
