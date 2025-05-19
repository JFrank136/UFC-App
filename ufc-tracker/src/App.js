import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import FighterSearch from "./pages/FighterSearch";
import UpcomingFights from "./pages/UpcomingFights";
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<FighterSearch />} />
      </Routes>
    </Router>
  );
}


function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <nav>
          <ul>
            <li><Link to="/">Upcoming Fights</Link></li>
            <li><Link to="/search">Search Fighters</Link></li>
          </ul>
        </nav>
        <Routes>
          <Route path="/" element={<UpcomingFights />} />
          <Route path="/" element={<FighterSearch />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
