// src/components/NavBar.js
import React from "react";
import { Link } from "react-router-dom";

const NavBar = () => (
  <nav className="flex gap-4 p-4 bg-gray-900 text-white">
    <Link to="/">Search</Link>
    <Link to="/upcoming">Upcoming</Link>
    <Link to="/events">Events</Link>
    <Link to="/rankings">Rankings</Link>
    <Link to="/stats">Stats</Link>
    <Link to="/favorites">Favorites</Link>
  </nav>
);

export default NavBar;
