// src/components/NavBar.js
import React from "react";
import { Link } from "react-router-dom";

const NavBar = () => (
  <nav className="flex gap-6 p-4 bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg" style={{width: '100%', margin: 0}}>
    <Link to="/" className="nav-link">Search</Link>
    <Link to="/favorites" className="nav-link">Favorites</Link>
    <Link to="/upcoming" className="nav-link">Upcoming</Link>
    <Link to="/events" className="nav-link">Events</Link>
    <Link to="/rankings" className="nav-link">Rankings</Link>
    <Link to="/stats" className="nav-link">Stats</Link>
  </nav>
  
);


<style jsx>{`
  .nav-link {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    transition: all 0.2s ease;
    text-decoration: none;
    font-weight: 500;
    color: #ffffff;
  }
  
  .nav-link:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }
`}</style>

export default NavBar;
