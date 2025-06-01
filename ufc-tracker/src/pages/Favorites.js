import React, { useState, useEffect } from "react";
import { getUserFavorites, removeFavorite } from "../api/fighters";

const Favorites = () => {
  const [user, setUser] = useState("Jared");
  const [priority, setPriority] = useState("favorite");
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fighterToRemove, setFighterToRemove] = useState(null);

  const fetchFavorites = async () => {
    setLoading(true);
    const favs = await getUserFavorites({ group: user, priority });
    setFavorites(favs);
    setLoading(false);
  };

  useEffect(() => {
    fetchFavorites();
    // eslint-disable-next-line
  }, [user, priority]);

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
    // This would need to be implemented in your API
    // For now, just showing the UI structure
    const newPriority = fighter.priority === "favorite" ? "interested" : "favorite";
    // await updateFighterPriority(fighter.id, newPriority);
    fetchFavorites();
  };

  const getSortedFavorites = () => {
    const sorted = [...favorites];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.fighter.localeCompare(b.fighter));
    }
    return sorted;
  };

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
              <option value="Jared">Jared</option>
              <option value="Mars">Mars</option>
            </select>
          </div>

          <div className="control-group">
            <label>Priority Level</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="select-input">
              <option value="favorite">Favorites</option>
              <option value="interested">Interested</option>
            </select>
          </div>

          <div className="control-group">
            <label>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="select-input">
              <option value="name">Name (A-Z)</option>
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
            {getSortedFavorites().map((fav) => (
              <div key={fav.id} className="fighter-card">
                <div className="card-content">
                  <h3 className="fighter-name">{fav.fighter}</h3>
                  <div className="priority-badge">
                    {priority === "favorite" ? "⭐ Favorite" : "👀 Interested"}
                  </div>
                </div>
                
                <div className="card-actions">
                  <button 
                    className="btn-toggle"
                    onClick={() => handlePriorityToggle(fav)}
                    title={priority === "favorite" ? "Move to Interested" : "Move to Favorites"}
                  >
                    {priority === "favorite" ? "👀" : "⭐"}
                  </button>
                  <button 
                    className="btn-remove"
                    onClick={() => handleRemove(fav)}
                    title="Remove Fighter"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showConfirmModal && <ConfirmModal />}

      <style jsx>{`
        .favorites-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          min-height: 100vh;
          color: #ffffff;
        }

        .favorites-header {
          margin-bottom: 2.5rem;
        }

        .favorites-header h1 {
          font-size: 2.5rem;
          font-weight: 700;
          background: linear-gradient(45deg, #FFD700, #FFA500);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .controls-section {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          justify-content: center;
          background: rgba(255, 215, 0, 0.1);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .control-group label {
          font-weight: 600;
          color: #FFD700;
          font-size: 0.9rem;
        }

        .select-input {
          padding: 0.75rem 1rem;
          border: 2px solid rgba(255, 215, 0, 0.3);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.8);
          color: #ffffff;
          font-size: 1rem;
          transition: all 0.3s ease;
        }

        .select-input:focus {
          outline: none;
          border-color: #FFD700;
          box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2);
        }

        .favorites-content {
          margin-top: 2rem;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .fighter-card {
          background: linear-gradient(145deg, #1a1a1a, #2a2a2a);
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid rgba(255, 215, 0, 0.2);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .fighter-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #FFD700, #FFA500);
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .fighter-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(255, 215, 0, 0.2);
          border-color: #FFD700;
        }

        .fighter-card:hover::before {
          transform: scaleX(1);
        }

        .card-content {
          margin-bottom: 1rem;
        }

        .fighter-name {
          font-size: 1.4rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 0.5rem 0;
        }

        .priority-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: rgba(255, 215, 0, 0.2);
          border: 1px solid rgba(255, 215, 0, 0.4);
          border-radius: 20px;
          font-size: 0.85rem;
          color: #FFD700;
          font-weight: 500;
        }

        .card-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        .btn-toggle, .btn-remove {
          padding: 0.5rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1.2rem;
          transition: all 0.3s ease;
          min-width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-toggle {
          background: rgba(255, 215, 0, 0.2);
          border: 1px solid rgba(255, 215, 0, 0.4);
        }

        .btn-toggle:hover {
          background: rgba(255, 215, 0, 0.3);
          transform: scale(1.1);
        }

        .btn-remove {
          background: rgba(220, 53, 69, 0.2);
          border: 1px solid rgba(220, 53, 69, 0.4);
        }

        .btn-remove:hover {
          background: rgba(220, 53, 69, 0.3);
          transform: scale(1.1);
        }

        .skeleton-card {
          background: linear-gradient(145deg, #1a1a1a, #2a2a2a);
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid rgba(255, 215, 0, 0.1);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .skeleton-title {
          height: 1.5rem;
          background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.1));
          border-radius: 4px;
          margin-bottom: 1rem;
          animation: shimmer 2s infinite;
        }

        .skeleton-buttons {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        .skeleton-button {
          width: 40px;
          height: 40px;
          background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.1));
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
          color: rgba(255, 255, 255, 0.7);
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          filter: grayscale(1);
        }

        .empty-state h3 {
          font-size: 1.5rem;
          color: #FFD700;
          margin-bottom: 0.5rem;
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
        }

        .modal-content {
          background: linear-gradient(145deg, #1a1a1a, #2a2a2a);
          border-radius: 12px;
          padding: 2rem;
          border: 1px solid rgba(255, 215, 0, 0.3);
          max-width: 400px;
          width: 90%;
          animation: slideUp 0.3s ease;
        }

        .modal-content h3 {
          color: #FFD700;
          margin-bottom: 1rem;
          font-size: 1.3rem;
        }

        .modal-content p {
          color: rgba(255, 255, 255, 0.9);
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
        }

        .btn-cancel {
          background: rgba(108, 117, 125, 0.2);
          color: #ffffff;
          border: 1px solid rgba(108, 117, 125, 0.4);
        }

        .btn-cancel:hover {
          background: rgba(108, 117, 125, 0.3);
        }

        .btn-confirm {
          background: rgba(220, 53, 69, 0.2);
          color: #ffffff;
          border: 1px solid rgba(220, 53, 69, 0.4);
        }

        .btn-confirm:hover {
          background: rgba(220, 53, 69, 0.3);
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
          }

          .cards-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default Favorites;