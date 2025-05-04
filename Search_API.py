from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import json
import os

app = Flask(__name__)
CORS(app)

FAVORITES_FILE = "favorites.json"

# ---------- Search Fighters Route ----------
@app.route('/api/search')
def search():
    query = request.args.get('query', '').strip().lower()

    if not query:
        return jsonify([])

    search_url = f"https://www.tapology.com/search?term={query.replace(' ', '+')}"
    headers = {"User-Agent": "Mozilla/5.0"}

    try:
        res = requests.get(search_url, headers=headers)
        if res.status_code != 200:
            return jsonify({"error": "Failed to fetch search page"}), 500

        soup = BeautifulSoup(res.text, 'html.parser')
        fighter_links = soup.select("a[href^='/fightcenter/fighters/']")
        results = []

        for a in fighter_links:
            name = a.text.strip()
            href = a['href']
            if name and href:
                results.append({
                    "name": name,
                    "url": f"https://www.tapology.com{href}"
                })

        return jsonify(results)

    except Exception as e:
        print("Error during scraping:", e)
        return jsonify({"error": "Scraping failed"}), 500

# ---------- Upcoming Fights Route ----------
@app.route('/api/upcoming', methods=["POST"])
def upcoming():
    data = request.get_json()
    fighter_names = data.get("fighters", [])
    if not fighter_names:
        return jsonify([])

    results = []
    headers = {"User-Agent": "Mozilla/5.0"}

    for name in fighter_names:
        search_url = f"https://www.tapology.com/search?term={name.replace(' ', '+')}"
        res = requests.get(search_url, headers=headers)
        soup = BeautifulSoup(res.text, 'html.parser')

        fighter_link = soup.select_one("a[href^='/fightcenter/fighters/']")
        if not fighter_link:
            continue

        fighter_page_url = "https://www.tapology.com" + fighter_link['href']
        res_fighter = requests.get(fighter_page_url, headers=headers)
        soup_fighter = BeautifulSoup(res_fighter.text, 'html.parser')

        confirmed_bout = soup_fighter.find("a", string="Confirmed Upcoming Bout")
        if not confirmed_bout:
            continue

        try:
            fight_card_container = confirmed_bout
            for _ in range(5):
                if fight_card_container.parent:
                    fight_card_container = fight_card_container.parent

            event_tag = fight_card_container.find("a", title="Event Page")
            event = event_tag.get_text(strip=True) if event_tag else "TBD"

            date_tag = fight_card_container.find("span", class_="text-xs11 text-neutral-600")
            date = date_tag.get_text(strip=True) if date_tag else "TBA"

            fighter_links = fight_card_container.select("a[href^='/fightcenter/fighters/']")
            opponent = next(
                (a.get_text(strip=True) for a in fighter_links if a.get_text(strip=True).lower() != name.lower()),
                "TBD"
            )

            results.append({
                "name": name,
                "opponent": opponent,
                "event": event,
                "date": date
            })

        except Exception as e:
            print(f"Error parsing fight details for {name}: {e}")
            continue

    return jsonify(results)

# ---------- Favorites API ----------
@app.route('/api/favorites', methods=["GET"])
def get_favorites():
    try:
        if not os.path.exists(FAVORITES_FILE):
            return jsonify([])
        with open(FAVORITES_FILE, "r") as f:
            favorites = json.load(f)
        return jsonify(favorites), 200
    except Exception as e:
        print("Load favorites error:", e)
        return jsonify([]), 200

@app.route('/api/favorites', methods=["POST"])
def add_favorite():
    fighter = request.get_json()
    try:
        if os.path.exists(FAVORITES_FILE):
            with open(FAVORITES_FILE, "r") as f:
                favorites = json.load(f)
        else:
            favorites = []

        if not any(f['name'] == fighter['name'] for f in favorites):
            favorites.append(fighter)

        with open(FAVORITES_FILE, "w") as f:
            json.dump(favorites, f, indent=2)

        return jsonify({"status": "success"}), 200
    except Exception as e:
        print("Add favorite error:", e)
        return jsonify({"error": "Could not save favorite"}), 500

@app.route('/api/favorites', methods=["DELETE"])
def delete_favorite():
    fighter = request.get_json()
    try:
        if os.path.exists(FAVORITES_FILE):
            with open(FAVORITES_FILE, "r") as f:
                favorites = json.load(f)
        else:
            favorites = []

        updated = [f for f in favorites if f['name'] != fighter['name']]

        with open(FAVORITES_FILE, "w") as f:
            json.dump(updated, f, indent=2)

        return jsonify({"status": "deleted"}), 200
    except Exception as e:
        print("Delete favorite error:", e)
        return jsonify({"error": "Could not delete favorite"}), 500

# ---------- Run Server ----------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
