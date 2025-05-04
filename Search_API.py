from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app)

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
    print("Incoming data:", data)
    fighter_names = data.get("fighters", [])
    if not fighter_names:
        return jsonify([])

    results = []
    headers = {"User-Agent": "Mozilla/5.0"}

    for name in fighter_names:
        print(f"Searching for fighter: {name}")
        search_url = f"https://www.tapology.com/search?term={name.replace(' ', '+')}"
        res = requests.get(search_url, headers=headers)
        soup = BeautifulSoup(res.text, 'html.parser')

        fighter_link = soup.select_one("a[href^='/fightcenter/fighters/']")
        if not fighter_link:
            print(f"No fighter link found for {name}")
            continue

        fighter_page_url = "https://www.tapology.com" + fighter_link['href']
        print(f"Fighter page URL: {fighter_page_url}")

        res_fighter = requests.get(fighter_page_url, headers=headers)
        soup_fighter = BeautifulSoup(res_fighter.text, 'html.parser')

        # Look for "Confirmed Upcoming Bout" link
        confirmed_bout = soup_fighter.find("a", string="Confirmed Upcoming Bout")
        if not confirmed_bout:
            print(f"No confirmed upcoming bout found for {name}")
            continue

        try:
            # Go up several levels to get the full card block
            fight_card_container = confirmed_bout
            for _ in range(5):  # climb enough to reach enclosing card div
                if fight_card_container.parent:
                    fight_card_container = fight_card_container.parent

            # Get event name
            event_tag = fight_card_container.find("a", title="Event Page")
            event = event_tag.get_text(strip=True) if event_tag else "TBD"

            # Get event date
            date_tag = fight_card_container.find("span", class_="text-xs11 text-neutral-600")
            date = date_tag.get_text(strip=True) if date_tag else "TBA"

            # Get opponent by excluding searched fighter
            fighter_links = fight_card_container.select("a[href^='/fightcenter/fighters/']")
            opponent = next(
                (a.get_text(strip=True) for a in fighter_links if a.get_text(strip=True).lower() != name.lower()),
                "TBD"
            )

            print(f"Upcoming Fight: {name} vs {opponent} at {event} on {date}")

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

# ---------- Run Server ----------
if __name__ == '__main__':
    app.run(debug=True)
