import React, { useState, useEffect } from "react";
import { getUserFavorites, removeFavorite, updateFavoritePriority } from "../api/fighters";
import countryCodes from '../utils/countryCodes';
import { getRankingValue, getRankingDisplay } from '../utils/fighterHelpers';
import { getSortedItems } from '../utils/sortHelpers';
import { SkeletonCard, EmptyState, ConfirmModal } from '../components/FavoritesComponents';
import styles from '../styles/Favorites.module.css';

const Favorites = () => {
  const [priority, setPriority] = useState("all");
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fighterToRemove, setFighterToRemove] = useState(null);
  const [allFavorites, setAllFavorites] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");


  const fetchFavorites = async () => {
    setLoading(true);
    console.log('Starting fetchFavorites...');
    try {
      const jaredFavorites = await getUserFavorites({ group: "Jared", priority: "favorite" });
      const jaredInterested = await getUserFavorites({ group: "Jared", priority: "interested" });
      
      const allData = [...jaredFavorites, ...jaredInterested].map(f => {
        const fighterInfo = f.fighterInfo || {};
        return {
          // Put fighter fields on top for display
          ...fighterInfo,

          // Then spread the favorite row so `id` stays as user_favorites.id
          ...f,

          // Helpful explicit ids (no behavior changes, just clarity)
          user_favorite_id: f.id,
          fighter_table_id: fighterInfo.id,
          fighter_id: f.fighter_id,
          priority: f.priority
        };
      });
      
      console.log('Final processed data:', allData);
      setAllFavorites(allData);
      filterFavorites(allData, priority, searchTerm);
      
    } catch (error) {
      console.error("Error fetching favorites:", error);
    }
    setLoading(false);
  };

  const filterFavorites = (data, selectedPriority, q) => {
    const query = (q || "").trim().toLowerCase();
    let filtered = data;

    if (selectedPriority !== "all") {
      filtered = filtered.filter(fighter => fighter.priority === selectedPriority);
    }

    if (query) {
      filtered = filtered.filter(f => {
        const name = (f.name || f.fighter || "").toLowerCase();
        return name.includes(query);
      });
    }

    setFavorites(filtered);
  };
  
  useEffect(() => {
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterFavorites(allFavorites, priority, searchTerm);
  }, [priority, allFavorites, searchTerm]);

  const handleRemove = (fighter) => {
    setFighterToRemove(fighter);
    setShowConfirmModal(true);
  };

  const confirmRemove = async () => {
    if (fighterToRemove) {
      const rowId = fighterToRemove.user_favorite_id || fighterToRemove.id;
      await removeFavorite(rowId);
      fetchFavorites();
    }
    setShowConfirmModal(false);
    setFighterToRemove(null);
  };

  const handlePriorityToggle = async (fighter) => {
    try {
      const rowId = fighter.user_favorite_id || fighter.id;
      const newPriority = fighter.priority === "favorite" ? "interested" : "favorite";

      await updateFavoritePriority({ id: rowId, priority: newPriority });
      fetchFavorites();

      console.log(`Toggled ${fighter.name || fighter.fighter} from ${fighter.priority} to ${newPriority}`);
    } catch (error) {
      console.error("Error updating priority:", error);
    }
  };

  const getSortedFavorites = () => {
    return getSortedItems(favorites, sortBy, getRankingValue);
  };

  return (
    <div className={styles.favoritesContainer}>
      <div className={styles.favoritesHeader}>
        <h1>Your Fighter Collection</h1>
        
        <div className={styles.controlsSection}>
          <div className={styles.controlGroup}>
            <label>Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search fighter name..."
              className={styles.selectInput}
            />
          </div>

          <div className={styles.controlGroup}>
            <label>Priority Level</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={styles.selectInput}>
              <option value="all">All</option>
              <option value="favorite">Favorites</option>
              <option value="interested">Interested</option>
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={styles.selectInput}>
              <option value="name">Name (A-Z)</option>
              <option value="recent">Recently Added</option>
              <option value="ranking">UFC Ranking</option>
              <option value="weight_class">Weight Class</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.favoritesContent}>
        {loading ? (
          <div className={styles.cardsGrid}>
            {[1, 2, 3, 4, 5, 6].map(n => <SkeletonCard key={n} />)}
          </div>
        ) : favorites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className={styles.cardsGrid}>
            {getSortedFavorites().map((fav) => {
              const rankings = getRankingDisplay(fav.ufc_rankings);
              const isP4PChampion = rankings?.p4p && rankings.p4p.rank === 1;
              
              return (
                <div 
                  key={fav.fighter_id || fav.id} 
                  className={`${styles.fighterCard} ${isP4PChampion ? styles.p4pChampion : ''}`}
                >
                  {isP4PChampion && (
                    <div className={styles.p4pCrown}>👑</div>
                  )}
                  
                  <div className={styles.fighterImageContainer}>
                    {(fav.image_url || fav.image_local_path) ? (
                      <img
                        src={fav.image_url || fav.image_local_path}
                        alt={fav.name}
                        className={styles.fighterImage}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = fav.image_local_path || '';
                        }}
                      />
                    ) : (
                      <div className={styles.fighterPlaceholder}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🥊</div>
                        <span>No Image</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.fighterInfo}>
                    <h3 className={styles.fighterName}>
                      {fav.name || fav.fighter}
                    </h3>
                    {fav.nickname && (
                      <p className={styles.fighterNickname}>"{fav.nickname}"</p>
                    )}

                    <div className={styles.fighterDetails}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Record</span>
                        <span className={styles.detailValue}>
                          {fav.wins_total || 0}-{fav.losses_total || 0}
                        </span>
                      </div>
                      
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Weight Class</span>
                        <span className={styles.detailValue}>{fav.weight_class || 'N/A'}</span>
                      </div>

                      {fav.country && (
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>Country</span>
                          <span className={styles.detailValue}>
                            {fav.country}
                            <span className={styles.countryFlag}>
                              {countryCodes[fav.country] || ''}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    {rankings && (rankings.p4p || rankings.divisionRank) && (
                      <div className={styles.rankingBadges}>
                        {rankings.p4p && (
                          <div className={`${styles.rankBadge} ${styles.p4p}`}>
                            P4P #{rankings.p4p.rank}
                          </div>
                        )}
                        {rankings.divisionRank && (
                          <div className={`${styles.rankBadge} ${styles.division}`}>
                            #{rankings.divisionRank.rank} {rankings.divisionRank.division}
                          </div>
                        )}
                      </div>
                    )}

                    <div className={styles.fighterFooter}>
                      <div className={styles.userPriority}>
                        <span className={styles.priorityTag}>
                          {fav.priority === 'favorite' ? '⭐ Favorite' : '👀 Interested'}
                        </span>
                      </div>

                      <div className={styles.cardActions}>
                        <button 
                          className={styles.toggleBtn}
                          onClick={() => handlePriorityToggle(fav)}
                          title={`Change to ${fav.priority === 'favorite' ? 'Interested' : 'Favorite'}`}
                        >
                          {fav.priority === 'favorite' ? '👀' : '⭐'}
                        </button>
                        <button 
                          className={styles.removeBtn}
                          onClick={() => handleRemove(fav)}
                          title="Remove from list"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showConfirmModal && (
        <ConfirmModal 
          fighterToRemove={fighterToRemove}
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
};

export default Favorites;