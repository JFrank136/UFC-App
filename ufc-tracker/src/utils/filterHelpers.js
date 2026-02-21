// Filter helper functions for SearchFighter

/**
 * Infer gender from fighter object
 * Uses database column if available
 */
export const inferGender = (fighter) => {
  return fighter.gender || 'Unknown';
};

/**
 * Extract unique countries and divisions from fighters data
 * Returns sorted arrays of unique values
 */
export const extractFilterOptions = (fightersData) => {
  const countries = [...new Set(fightersData.map(f => f.country).filter(Boolean))].sort();
  const divisions = [...new Set(fightersData.map(f => f.weight_class).filter(Boolean))].sort();
  
  return { countries, divisions };
};

/**
 * Check if any filters are currently active
 */
export const hasActiveFilters = ({
  selectedGender,
  selectedCountries,
  selectedDivisions,
  showRankedOnly,
  showP4POnly,
  showFavoritesOnly,
  showInterestedOnly,
  sortBy,
  query
}) => {
  return selectedGender !== 'All' || 
        selectedCountries.length > 0 || 
        selectedDivisions.length > 0 || 
        showRankedOnly || 
        showP4POnly ||
        showFavoritesOnly ||
        showInterestedOnly ||
        sortBy !== 'name' ||
        query.trim() !== '';
};