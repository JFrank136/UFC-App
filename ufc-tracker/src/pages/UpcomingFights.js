import React, { useState, useEffect } from "react";

function UpcomingFights() {
  const [fights, setFights] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedFavorites = JSON.parse(localStorage.getItem("favorites")) || [];
    setFavorites(storedFavorites);

    const cachedFights = JSON.parse(localStorage.getItem("upcomingFights")) || [];
    setFights(cachedFights);
  }, []);

  const fetchFights = async () => {
    try {
      setLoading(true);
      const storedFavorites = JSON.parse(localStorage.getItem("favorites")) || [];
      setFavorites(storedFavorites);

      if (storedFavorites.length === 0) {
        setError("No favorite fighters found. Add some in the Search page!");
        setFights([]);
        return;
      }

      const fighterNames = storedFavorites.map(f => f.name);
      const response = await fetch("/api/upcoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighters: fighterNames }),
      });

      if (!response.ok) throw new Error("Failed to fetch upcoming fights.");
      const data = await response.json();

      const filtered = data
        .filter(fight => fight.event.toLowerCase().includes("ufc"))
        .map(fight => {
          const cleanName = fight.name.replace(/"[^"]+"/g, "").trim();
          const cleanOpponent = fight.opponent.replace(/"[^"]+"/g, "").trim();

          let formattedDate = fight.date;
          try {
            if (
              formattedDate &&
              !formattedDate.toLowerCase().includes("tba") &&
              formattedDate.split(" ").length === 2
            ) {
              const fullDate = new Date(`2025 ${formattedDate}`);
              formattedDate = fullDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              });
            }
          } catch {}

          return {
            ...fight,
            name: cleanName,
            opponent: cleanOpponent,
            date: formattedDate,
          };
        });

      const sortedFights = filtered.sort((a, b) => {
        const parseDate = (d) => {
          if (!d || d.toLowerCase() === "tba") return Infinity;
          return new Date(`2025 ${d}`);
        };
        return parseDate(a.date) - parseDate(b.date);
      });

      localStorage.setItem("upcomingFights", JSON.stringify(sortedFights));
      setFights(sortedFights);
      setError("");
    } catch (err) {
      console.error("Error fetching upcoming fights:", err);
      setError("Error fetching upcoming fights. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const isFavorite = (name) =>
    favorites.some(fav => fav.name.replace(/"[^"]+"/g, "").trim() === name);

  const getUrl = (name) => {
    const match = favorites.find(fav => fav.name.replace(/"[^"]+"/g, "").trim() === name);
    return match?.url || null;
  };

  return (
    <div>
      <h1>Upcoming Fights</h1>
      <button onClick={fetchFights} style={{ marginBottom: "20px" }}>
        Refresh
      </button>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div>{error}</div>
      ) : fights.length === 0 ? (
        <p>No upcoming UFC fights found. Click refresh to load.</p>
      ) : (
        <ul>
          {fights.map((fight, idx) => {
            const nameUrl = getUrl(fight.name);
            const opponentUrl = getUrl(fight.opponent);
            const nameStyle = {
              fontWeight: isFavorite(fight.name) ? "bold" : "normal",
              color: isFavorite(fight.name) ? "#1976d2" : "inherit",
            };
            const opponentStyle = {
              fontWeight: isFavorite(fight.opponent) ? "bold" : "normal",
              color: isFavorite(fight.opponent) ? "#1976d2" : "inherit",
            };

            return (
              <li key={idx}>
                <a href={nameUrl || "#"} style={nameStyle} target="_blank" rel="noopener noreferrer">
                  {fight.name}
                </a>{" "}
                vs.{" "}
                <a href={opponentUrl || "#"} style={opponentStyle} target="_blank" rel="noopener noreferrer">
                  {fight.opponent}
                </a>
                <br />
                Event: {fight.event}<br />
                Date: {fight.date}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default UpcomingFights;
