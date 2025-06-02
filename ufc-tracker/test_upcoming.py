import os
from supabase import create_client, Client
from datetime import datetime

# Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Hardcode a test user ID if needed
USER_ID = "Jared"


def main():
    # 1. Fetch favorite fighter UUIDs
    try:
        favs = supabase.table("user_favorites").select("fighter_id").eq("user", USER_ID).execute()
    except Exception as e:
        print("❌ Error fetching favorites:", e)
        return

    favorite_ids = [row["fighter_id"] for row in favs.data]
    print("✅ Favorite fighter UUIDs:", favorite_ids)

    # 2. Fetch all upcoming fights
    try:
        fights = supabase.table("upcoming_fights").select("*").execute()
    except Exception as e:
        print("❌ Error fetching upcoming fights:", e)
        return


    print(f"📦 Total upcoming fights: {len(fights.data)}")

    # 3. Filter for favorites
    filtered = [
        fight for fight in fights.data
        if fight["fighter1_id"] in favorite_ids or fight["fighter2_id"] in favorite_ids
    ]

    print(f"\n🎯 Found {len(filtered)} upcoming fights for favorite fighters:\n")
    for fight in filtered:
        print(f" - {fight.get('fighter1_name')} vs {fight.get('fighter2_name')} on {fight.get('date')}")

if __name__ == "__main__":
    main()
