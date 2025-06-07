// src/components/NavBar.js
import React, { useState } from "react";
import { Link } from "react-router-dom";

const NavBar = () => {
  const [isUFCDropdownOpen, setIsUFCDropdownOpen] = useState(false);

  return (
    <>
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-link">Search</Link>
          <Link to="/favorites" className="nav-link">Favorites</Link>
          <Link to="/upcoming" className="nav-link">Upcoming</Link>
          <Link to="/events" className="nav-link">Events</Link>
          
          <div 
            className="nav-dropdown"
            onMouseEnter={() => setIsUFCDropdownOpen(true)}
            onMouseLeave={() => setIsUFCDropdownOpen(false)}
          >
            <button 
              className="nav-link dropdown-trigger"
              onClick={() => setIsUFCDropdownOpen(!isUFCDropdownOpen)}
            >
              UFC
              <svg 
                className={`dropdown-icon ${isUFCDropdownOpen ? 'rotated' : ''}`} 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <polyline points="6,9 12,15 18,9"></polyline>
              </svg>
            </button>
            
            {isUFCDropdownOpen && (
              <div className={`dropdown-menu ${isUFCDropdownOpen ? 'show' : ''}`}>
                <Link to="/rankings" className="dropdown-link" onClick={() => setIsUFCDropdownOpen(false)}>
                  Rankings
                </Link>
                <Link to="/stats" className="dropdown-link" onClick={() => setIsUFCDropdownOpen(false)}>
                  Stats
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      <style jsx>{`
        .navbar {
          width: 100%;
          margin: 0;
          background: linear-gradient(to right, #1f2937, #111827);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          position: relative;
        }

        .nav-container {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1rem;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          position: relative;
        }

        .nav-container::-webkit-scrollbar {
          display: none;
        }

        .nav-container::before,
        .nav-container::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          width: 20px;
          pointer-events: none;
          z-index: 1;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .nav-container::before {
          left: 0;
          background: linear-gradient(to right, #1f2937, transparent);
        }

        .nav-container::after {
          right: 0;
          background: linear-gradient(to left, #111827, transparent);
        }

        .nav-container:hover::before,
        .nav-container:hover::after {
          opacity: 1;
        }

        .nav-link {
          padding: 0.75rem 1.25rem;
          border-radius: 8px;
          transition: all 0.3s ease;
          text-decoration: none;
          font-weight: 500;
          color: #ffffff;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: fit-content;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.95rem;
        }
        
        .nav-link:hover {
          background: rgba(255, 255, 255, 0.15);
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        .nav-dropdown {
          position: relative;
          display: flex;
          align-items: center;
        }

        .nav-dropdown:hover .dropdown-menu {
          display: block;
        }

        .dropdown-menu {
          display: none;
        }

        .dropdown-menu.show {
          display: block;
        }

        .dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .dropdown-icon {
          transition: transform 0.3s ease;
        }

        .dropdown-icon.rotated {
          transform: rotate(180deg);
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 0.5rem;
          background: #1f2937;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
          min-width: 140px;
          z-index: 1000;
          backdrop-filter: blur(10px);
          animation: slideDown 0.2s ease-out;
          display: block;
          opacity: 1;
          visibility: visible;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-link {
          display: block;
          padding: 0.75rem 1rem;
          color: #ffffff;
          text-decoration: none;
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.2s ease;
          border-radius: 6px;
          margin: 0.25rem;
        }

        .dropdown-link:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #60a5fa;
        }

      /* Mobile Optimizations */
        @media (max-width: 768px) {
          .nav-container {
            gap: 1rem;
            padding: 0.75rem 1rem;
            scroll-snap-type: x mandatory;
          }

          .nav-link {
            padding: 0.875rem 1rem;
            font-size: 0.9rem;
            min-height: 44px;
            scroll-snap-align: start;
          }

          .nav-dropdown {
            position: static;
          }

          .dropdown-menu {
            position: fixed;
            top: 70px;
            left: 1rem;
            right: 1rem;
            margin-top: 0;
            max-width: none;
            background: #1f2937;
            border-radius: 12px;
            animation: slideUp 0.3s ease-out;
            z-index: 1000;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .dropdown-link {
            padding: 1rem;
            font-size: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin: 0;
            border-radius: 0;
          }

          .dropdown-link:first-child {
            border-radius: 12px 12px 0 0;
          }

          .dropdown-link:last-child {
            border-radius: 0 0 12px 12px;
            border-bottom: none;
          }

          .nav-container::before,
          .nav-container::after {
            opacity: 1;
          }
        }

        /* Touch device optimizations */
        @media (hover: none) and (pointer: coarse) {
          .nav-dropdown:hover .dropdown-menu {
            display: none;
          }
          
          .nav-link:hover {
            transform: none;
            background: rgba(255, 255, 255, 0.1);
          }
        }

        /* Very small screens */
        @media (max-width: 480px) {
          .nav-container {
            padding: 0.5rem 0.75rem;
            gap: 0.75rem;
          }

          .nav-link {
            padding: 0.75rem 0.875rem;
            font-size: 0.85rem;
          }
        }
      `}</style>
    </>
  );
};

export default NavBar;