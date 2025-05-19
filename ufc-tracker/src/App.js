import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import FighterSearch from './pages/FighterSearch';
import UpcomingFights from './pages/UpcomingFights';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <nav className="p-4 bg-gray-100 shadow-sm mb-4">
          <ul className="flex space-x-4 justify-center">
            <li>
              <Link to="/" className="text-blue-600 hover:underline">
                Upcoming Fights
              </Link>
            </li>
            <li>
              <Link to="/search" className="text-blue-600 hover:underline">
                Search Fighters
              </Link>
            </li>
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
