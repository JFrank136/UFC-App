// src/routes/AppRoutes.js
import React from "react";
import { Routes, Route } from "react-router-dom";
import SearchFighter from "../pages/SearchFighter";
import UpcomingFights from "../pages/UpcomingFights";
import Events from "../pages/Events";
import Rankings from "../pages/Rankings";
import FighterStats from "../pages/FighterStats";
import Favorites from "../pages/Favorites";
import UFCpicks from '../pages/UFCpicks';

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<SearchFighter />} />
    <Route path="/upcoming" element={<UpcomingFights />} />
    <Route path="/events" element={<Events />} />
    <Route path="/rankings" element={<Rankings />} />
    <Route path="/stats" element={<FighterStats />} />
    <Route path="/favorites" element={<Favorites />} />
    <Route path="/picks" element={<UFCpicks />} />
  </Routes>
);

export default AppRoutes;
