import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import FighterSearch from "./pages/FighterSearch";
import UpcomingFights from "./pages/UpcomingFights";

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
          <Route path="/search" element={<FighterSearch />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
