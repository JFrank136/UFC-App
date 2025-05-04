import requests
from bs4 import BeautifulSoup

# Your list of favorite fighters' Tapology URLs
fighter_urls = [
    "https://www.tapology.com/fightcenter/fighters/68186-sean-omalley",
    "https://www.tapology.com/fightcenter/fighters/85643-diego-lopes"
]

def get_fighter_info(url):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')

    fighter_name = soup.find('h1').get_text(strip=True)

    upcoming_section = soup.find('section', class_='fightCard upcoming')
    if not upcoming_section:
        return {
            'name': fighter_name,
            'status': 'No upcoming fight'
        }

    opponent = upcoming_section.find('span', class_='opp').get_text(strip=True)
    event = upcoming_section.find('h2').get_text(strip=True)
    date = upcoming_section.find('span', class_='date').get_text(strip=True)

    return {
        'name': fighter_name,
        'opponent': opponent,
        'event': event,
        'date': date
    }

# Loop through each fighter and print their info
for url in fighter_urls:
    info = get_fighter_info(url)
    print("-----------")
    print(f"Fighter: {info['name']}")
    if 'status' in info:
        print(info['status'])
    else:
        print(f"Opponent: {info['opponent']}")
        print(f"Event: {info['event']}")
        print(f"Date: {info['date']}")
