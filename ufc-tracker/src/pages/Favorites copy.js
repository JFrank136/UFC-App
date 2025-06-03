import React, { useState, useEffect } from "react";
import { getUserFavorites, removeFavorite } from "../api/fighters";

const USERS = ["Jared", "Mars"];

const getThemeColors = (user) => {
  return user === "Mars" ? {
    primary: '#dc2626', // Red
    primaryLight: 'rgba(220, 38, 38, 0.1)',
    primaryBorder: 'rgba(220, 38, 38, 0.3)',
    gradient: 'linear-gradient(45deg, #dc2626, #ef4444)',
    secondary: '#b91c1c'
  } : {
    primary: '#2563eb', // Blue  
    primaryLight: 'rgba(37, 99, 235, 0.1)',
    primaryBorder: 'rgba(37, 99, 235, 0.3)', 
    gradient: 'linear-gradient(45deg, #2563eb, #3b82f6)',
    secondary: '#1d4ed8'
  };
};

// Flag component for countries
const FlagIcon = ({ country }) => {
  const flagMap = {
    'Russia': '🇷🇺',
    'USA': '🇺🇸',
    'United States': '🇺🇸',
    'Brazil': '🇧🇷',
    'Canada': '🇨🇦',
    'United Kingdom': '🇬🇧',
    'England': '🇬🇧',
    'Ireland': '🇮🇪',
    'Australia': '🇦🇺',
    'Mexico': '🇲🇽',
    'France': '🇫🇷',
    'Germany': '🇩🇪',
    'Poland': '🇵🇱',
    'Sweden': '🇸🇪',
    'Norway': '🇳🇴',
    'Netherlands': '🇳🇱',
    'China': '🇨🇳',
    'Japan': '🇯🇵',
    'South Korea': '🇰🇷',
    'Georgia': '🇬🇪',
    'Dagestan': '🇷🇺',
    'Chechnya': '🇷🇺',
    'Turkey': '🇹🇷',
    'Bolivia': '🇧🇴',
    'Bahrain': '🇧🇭',
    'Nigeria': '🇳🇬',
    'Romania': '🇷🇴',
    'Chile': '🇨🇱',
    'Jamaica': '🇯🇲',
    'Lithuania': '🇱🇹',
    'South Africa': '🇿🇦',
    'Scotland': '🏴',
    'Moldova': '🇲🇩',
    'Thailand': '🇹🇭',
    'Denmark': '🇩🇰',
    'Cuba': '🇨🇺',
    'Venezuela': '🇻🇪',
    'Croatia': '🇭🇷',
    'Kazakhstan': '🇰🇿',
  };

  return <span className="flag-icon">{flagMap[country] || '🏴'}</span>;
};

const Favorites = () => {
  const [user, setUser] = useState("all");
  const [priority, setPriority] = useState("all");
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fighterToRemove, setFighterToRemove] = useState(null);
  const [allFavorites, setAllFavorites] = useState([]);

const fetchFavorites = async () => {
    setLoading(true);
    try {
      // Fetch all favorites and interested for all users
      const jaredFavorites = await getUserFavorites({ group: "Jared", priority: "favorite" });
      const jaredInterested = await getUserFavorites({ group: "Jared", priority: "interested" });
      const marsFavorites = await getUserFavorites({ group: "Mars", priority: "favorite" });
      const marsInterested = await getUserFavorites({ group: "Mars", priority: "interested" });
      
      const allData = [
        ...jaredFavorites.map(f => ({ ...f, user: "Jared", priority: "favorite" })),
        ...jaredInterested.map(f => ({ ...f, user: "Jared", priority: "interested" })),
        ...marsFavorites.map(f => ({ ...f, user: "Mars", priority: "favorite" })),
        ...marsInterested.map(f => ({ ...f, user: "Mars", priority: "interested" }))
      ];
      
      setAllFavorites(allData);
      filterFavorites(allData, user, priority);
    } catch (error) {
      console.error("Error fetching favorites:", error);
    }
    setLoading(false);
  };

  const filterFavorites = (data, selectedUser, selectedPriority) => {
    let filtered = data;
    
    if (selectedUser !== "all") {
      filtered = filtered.filter(f => f.user === selectedUser);
    }
    
    if (selectedPriority !== "all") {
      filtered = filtered.filter(f => f.priority === selectedPriority);
    }
    
    setFavorites(filtered);
  };

  useEffect(() => {
    fetchFavorites();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    filterFavorites(allFavorites, user, priority);
  }, [user, priority, allFavorites]);

  const handleRemove = (fighter) => {
    setFighterToRemove(fighter);
    setShowConfirmModal(true);
  };

  const confirmRemove = async () => {
    if (fighterToRemove) {
      await removeFavorite(fighterToRemove.id);
      fetchFavorites();
    }
    setShowConfirmModal(false);
    setFighterToRemove(null);
  };

  const handlePriorityToggle = async (fighter) => {
    try {
      // Remove and re-add with new priority
      await removeFavorite(fighter.id);
      // For now, just refresh - you'll need to implement updateFighterPriority in your API
      fetchFavorites();
      console.log(`Would toggle ${fighter.fighter} from ${fighter.priority} to ${fighter.priority === "favorite" ? "interested" : "favorite"}`);
    } catch (error) {
      console.error("Error updating priority:", error);
    }
  };

const getSortedFavorites = () => {
    const sorted = [...favorites];
    
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.fighter.localeCompare(b.fighter));
        break;
      case "recent":
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
      case "ranking":
        sorted.sort((a, b) => {
          const aRank = getRankingValue(a);
          const bRank = getRankingValue(b);
          if (aRank === bRank) return a.fighter.localeCompare(b.fighter);
          return aRank - bRank;
        });
        break;
      case "weight_class":
        const weightOrder = {
          "Flyweight": 1, "Bantamweight": 2, "Featherweight": 3, "Lightweight": 4,
          "Welterweight": 5, "Middleweight": 6, "Light Heavyweight": 7, "Heavyweight": 8,
          "Women's Strawweight": 9, "Women's Flyweight": 10, "Women's Bantamweight": 11,
          "Women's Featherweight": 12
        };
        sorted.sort((a, b) => {
          const aWeight = weightOrder[a.weight_class] || 999;
          const bWeight = weightOrder[b.weight_class] || 999;
          if (aWeight === bWeight) return a.fighter.localeCompare(b.fighter);
          return aWeight - bWeight;
        });
        break;
      default:
        break;
    }
    return sorted;
  };

  const getRankingValue = (fighter) => {
    if (!fighter.ufc_rankings || !Array.isArray(fighter.ufc_rankings)) return 999;
    
    const p4p = fighter.ufc_rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    if (p4p) return p4p.rank;
    
    const divisionRank = fighter.ufc_rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
    if (divisionRank) return divisionRank.rank + 15; // P4P gets priority
    
    return 999;
  };

  const getRankingDisplay = (rankings) => {
    if (!rankings || !Array.isArray(rankings)) return null;
    
    const p4p = rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divisionRank = rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
    
    return { p4p, divisionRank };
  };

  const capitalize = (str) =>
    str
      ?.split(" ")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ") || "";

  const SkeletonCard = () => (
    <div className="skeleton-card">
      <div className="skeleton-title"></div>
      <div className="skeleton-buttons">
        <div className="skeleton-button"></div>
        <div className="skeleton-button"></div>
      </div>
    </div>
  );

  const EmptyState = () => (
    <div className="empty-state">
      <div className="empty-icon">🥊</div>
      <h3>No Fighters in Your Corner</h3>
      <p>Start building your fighter collection by exploring and saving your favorites!</p>
    </div>
  );

  const ConfirmModal = () => (
    <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Remove Fighter</h3>
        <p>Are you sure you want to remove <strong>{fighterToRemove?.fighter}</strong> from your list?</p>
        <div className="modal-buttons">
          <button className="btn-cancel" onClick={() => setShowConfirmModal(false)}>
            Cancel
          </button>
          <button className="btn-confirm" onClick={confirmRemove}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="favorites-container">
      <div className="favorites-header">
        <h1>Your Fighter Collection</h1>
        
        <div className="controls-section">
          <div className="control-group">
            <label>Fighter</label>
            <select value={user} onChange={e => setUser(e.target.value)} className="select-input">
              <option value="all">All Users</option>
              <option value="Jared">Jared</option>
              <option value="Mars">Mars</option>
            </select>
          </div>

          <div className="control-group">
            <label>Priority Level</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="select-input">
              <option value="all">All</option>
              <option value="favorite">Favorites</option>
              <option value="interested">Interested</option>
            </select>
          </div>

          <div className="control-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="select-input">
              <option value="name">Name (A-Z)</option>
              <option value="recent">Recently Added</option>
              <option value="ranking">UFC Ranking</option>
              <option value="weight_class">Weight Class</option>
            </select>
          </div>
        </div>
      </div>

      <div className="favorites-content">
        {loading ? (
          <div className="cards-grid">
            {[1, 2, 3, 4, 5, 6].map(n => <SkeletonCard key={n} />)}
          </div>
        ) : favorites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="cards-grid">
            {getSortedFavorites().map((fav) => {
              const rankings = getRankingDisplay(fav.ufc_rankings);
              const isP4PChampion = rankings?.p4p && rankings.p4p.rank === 1;
              
              return (
                <div 
                  key={fav.id} 
                  className={`fighter-card${isP4PChampion ? ' p4p-champion' : ''}`}
                >
                  {isP4PChampion && (
                    <div className="p4p-crown">👑</div>
                  )}
                  
                  <div className="fighter-image-container">
                    {(fav.image_url || fav.image_local_path) && (
                      <img
                        src={fav.image_url || fav.image_local_path}
                        alt={fav.fighter}
                        className="fighter-image"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  
                  <div className="fighter-content">
                    <div className="fighter-header">
                      <h3 className="fighter-name">
                        {fav.profile_url_ufc ? (
                          <a href={fav.profile_url_ufc} target="_blank" rel="noreferrer">
                            {capitalize(fav.fighter)}
                          </a>
                        ) : (
                          capitalize(fav.fighter)
                        )}
                      </h3>
                      {fav.nickname && (
                        <p className="fighter-nickname">"{fav.nickname}"</p>
                      )}
                    </div>
                    
                    <div className="fighter-stats">
                      <div className="stat-row">
                        {fav.country && (
                          <div className="stat-item">
                            <FlagIcon country={fav.country} />
                            <span>{fav.country}</span>
                          </div>
                        )}
                        {fav.age && (
                          <div className="stat-item">
                            <span>Age: {fav.age}</span>
                          </div>
                        )}
                      </div>
                      
                      {fav.weight_class && (
                        <div className="stat-item weight-class">
                          <span>{fav.weight_class}</span>
                        </div>
                      )}
                      
                      <div className="stat-item record">
                        <span className="record-text">
                          {fav.wins_total}-{fav.losses_total}
                          {fav.draws_total && parseInt(fav.draws_total) > 0 && `-${fav.draws_total}`}
                        </span>
                      </div>
                    </div>
                    
                    {rankings && (rankings.p4p || rankings.divisionRank) && (
                      <div className="rankings">
                        {rankings.p4p && (
                          <span className="rank-badge p4p">
                            P4P #{rankings.p4p.rank}
                          </span>
                        )}
                        {rankings.divisionRank && (
                          <span className="rank-badge division">
                            #{rankings.divisionRank.rank} {rankings.divisionRank.division}
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="fighter-footer">
                      <div className="user-priority">
                        <span className={`user-tag ${fav.user.toLowerCase()}`}>
                          {fav.user}
                        </span>
                        <span className="priority-tag">
                          {fav.priority === "favorite" ? "⭐ Favorite" : "👀 Interested"}
                        </span>
                      </div>
                      
                      <div className="card-actions">
                        <button 
                          className="action-btn toggle-btn"
                          onClick={() => handlePriorityToggle(fav)}
                          title={fav.priority === "favorite" ? "Move to Interested" : "Move to Favorites"}
                        >
                          {fav.priority === "favorite" ? "👀" : "⭐"}
                        </button>
                        <button 
                          className="action-btn remove-btn"
                          onClick={() => handleRemove(fav)}
                          title="Remove Fighter"
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

      {showConfirmModal && <ConfirmModal />}

      <style jsx>{`
        .favorites-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 50%, #0c0c0c 100%);
          color: #fff;
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .favorites-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .favorites-header h1 {
          font-size: 3rem;
          font-weight: 800;
          margin-bottom: 1rem;
          background: linear-gradient(45deg, #ff6b35, #ff8e35, #ffa735);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 0 30px rgba(255, 107, 53, 0.3);
        }

        .controls-section {
          display: flex;
          justify-content: center;
          gap: 2rem;
          flex-wrap: wrap;
          margin-top: 2rem;
          padding: 2rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 16px;
          border: 1px solid rgba(255, 107, 53, 0.1);
          backdrop-filter: blur(10px);
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 150px;
        }

        .control-group label {
          font-weight: 600;
          color: #ff6b35;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .select-input {
          padding: 0.75rem 1rem;
          background: rgba(0, 0, 0, 0.4);
          border: 2px solid rgba(255, 107, 53, 0.2);
          border-radius: 8px;
          color: #fff;
          font-size: 0.95rem;
          transition: all 0.3s ease;
          backdrop-filter: blur(5px);
        }

        .select-input:focus {
          outline: none;
          border-color: #ff6b35;
          box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 2rem;
          margin-top: 2rem;
        }

        .fighter-card {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
          border-radius: 20px;
          border: 1px solid rgba(255, 107, 53, 0.1);
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          backdrop-filter: blur(10px);
        }

        .fighter-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #ff6b35, #ff8e35, #ffa735);
          transform: scaleX(0);
          transition: transform 0.4s ease;
        }

        .fighter-card:hover {
          transform: translateY(-8px);
          border-color: rgba(255, 107, 53, 0.3);
          box-shadow: 0 20px 40px rgba(255, 107, 53, 0.1);
        }

        .fighter-card:hover::before {
          transform: scaleX(1);
        }

        .p4p-champion {
          border-color: #FFD700 !important;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
        }

        .p4p-crown {
          position: absolute;
          top: 1rem;
          right: 1rem;
          font-size: 1.5rem;
          z-index: 2;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }

        .fighter-image-container {
          height: 200px;
          overflow: hidden;
          position: relative;
          background: linear-gradient(45deg, rgba(255, 107, 53, 0.1), rgba(255, 138, 53, 0.1));
        }

        .fighter-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease;
        }

        .fighter-card:hover .fighter-image {
          transform: scale(1.05);
        }

        .fighter-content {
          padding: 1.5rem;
        }

        .fighter-header {
          margin-bottom: 1rem;
        }

        .fighter-name {
          font-size: 1.3rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
          color: #fff;
          line-height: 1.2;
        }

        .fighter-name a {
          color: inherit;
          text-decoration: none;
          transition: color 0.3s ease;
        }

        .fighter-name a:hover {
          color: #ff6b35;
        }

        .fighter-nickname {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
          font-style: italic;
          margin: 0;
        }

        .fighter-stats {
          margin-bottom: 1rem;
        }

        .stat-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .weight-class {
          color: #ff6b35;
          font-weight: 600;
        }

        .record {
          margin-top: 0.5rem;
        }

        .record-text {
          font-weight: 700;
          color: #fff;
          font-size: 0.95rem;
        }

        .flag-icon {
          font-size: 1rem;
        }

        .rankings {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .rank-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .rank-badge.p4p {
          background: linear-gradient(45deg, #FFD700, #FFA500);
          color: #000;
        }

        .rank-badge.division {
          background: rgba(255, 107, 53, 0.2);
          color: #ff6b35;
          border: 1px solid rgba(255, 107, 53, 0.3);
        }

        .fighter-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .user-priority {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .user-tag {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .user-tag.jared {
          background: rgba(37, 99, 235, 0.2);
          color: #60a5fa;
          border: 1px solid rgba(37, 99, 235, 0.3);
        }

        .user-tag.mars {
          background: rgba(220, 38, 38, 0.2);
          color: #f87171;
          border: 1px solid rgba(220, 38, 38, 0.3);
        }

        .priority-tag {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
        }

        .card-actions {
          display: flex;
          gap: 0.5rem;
        }

        .action-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 1.1rem;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toggle-btn {
          background: rgba(255, 107, 53, 0.1);
          color: #ff6b35;
          border: 1px solid rgba(255, 107, 53, 0.2);
        }

        .toggle-btn:hover {
          background: rgba(255, 107, 53, 0.2);
          transform: scale(1.1);
        }

        .remove-btn {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .remove-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          transform: scale(1.1);
        }

        .skeleton-card {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 20px;
          border: 1px solid rgba(255, 107, 53, 0.1);
          overflow: hidden;
          animation: pulse 2s ease-in-out infinite;
        }

        .skeleton-title {
          height: 200px;
          background: linear-gradient(90deg, rgba(255, 107, 53, 0.1), rgba(255, 107, 53, 0.2), rgba(255, 107, 53, 0.1));
          margin-bottom: 1rem;
          animation: shimmer 2s infinite;
        }

        .skeleton-buttons {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          padding: 1.5rem;
        }

        .skeleton-button {
          width: 36px;
          height: 36px;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          animation: shimmer 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: rgba(255, 255, 255, 0.6);
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.7;
        }

        .empty-state h3 {
          font-size: 1.5rem;
          color: #ff6b35;
          margin-bottom: 1rem;
          font-weight: 700;
        }

        .empty-state p {
          font-size: 1.1rem;
          max-width: 400px;
          margin: 0 auto;
          line-height: 1.6;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease;
          backdrop-filter: blur(5px);
        }

        .modal-content {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          border-radius: 16px;
          padding: 2rem;
          border: 1px solid rgba(255, 107, 53, 0.2);
          max-width: 400px;
          width: 90%;
          animation: slideUp 0.3s ease;
          backdrop-filter: blur(20px);
        }

        .modal-content h3 {
          color: #ff6b35;
          margin-bottom: 1rem;
          font-size: 1.3rem;
          font-weight: 700;
        }

        .modal-content p {
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .modal-buttons {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }

        .btn-cancel, .btn-confirm {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
          font-size: 0.9rem;
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .btn-confirm {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .btn-confirm:hover {
          background: rgba(239, 68, 68, 0.3);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @media (max-width: 768px) {
          .favorites-container {
            padding: 1rem;
          }

          .favorites-header h1 {
            font-size: 2rem;
          }

          .controls-section {
            flex-direction: column;
            gap: 1rem;
            padding: 1.5rem;
          }

          .cards-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .control-group {
            min-width: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default Favorites;