import React from 'react';

const LoadingState = ({ message = 'Loading...', darkMode = true }) => {
  return (
    <div className={`loading-container ${darkMode ? 'dark' : 'light'}`}>
      <div className="spinner"></div>
      <p className="loading-message">{message}</p>

      <style jsx>{`
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          padding: 2rem;
        }

        .loading-container.dark {
          background: linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #2d2d2d 100%);
          color: #ffffff;
        }

        .loading-container.light {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%);
          color: #1a1a1a;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid var(--spinner-track);
          border-top-color: var(--spinner-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .dark .spinner {
          --spinner-track: rgba(255, 215, 0, 0.2);
          --spinner-color: #FFD700;
        }

        .light .spinner {
          --spinner-track: rgba(0, 0, 0, 0.1);
          --spinner-color: #1a1a1a;
        }

        .loading-message {
          font-size: 1.1rem;
          opacity: 0.7;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingState;
