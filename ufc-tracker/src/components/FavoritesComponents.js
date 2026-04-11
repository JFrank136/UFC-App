import React from 'react';

/**
 * Loading skeleton card component
 */
export const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-title"></div>
    <div className="skeleton-buttons">                
      <div className="skeleton-button"></div>
      <div className="skeleton-button"></div>
    </div>
  </div>
);

/**
 * Empty state component when no fighters are found
 */
export const EmptyState = () => (
  <div className="empty-state">
    <div className="empty-icon">🥊</div>
    <h3>No Fighters in Your Corner</h3>
    <p>Start building your fighter collection by exploring and saving your favorites!</p>
  </div>
);

/**
 * Confirmation modal for removing fighters
 */
export const ConfirmModal = ({ fighterToRemove, onCancel, onConfirm }) => (
  <div className="modal-overlay" onClick={onCancel}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <h3>Remove Fighter</h3>
      <p>Are you sure you want to remove <strong>{fighterToRemove?.fighter}</strong> from your list?</p>
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-confirm" onClick={onConfirm}>
          Remove
        </button>
      </div>
    </div>
  </div>
);