#!/usr/bin/env python3
"""
Generate supabase_schema.json by extracting complete records from each table
Finds the first record with no NULL values for each table
"""

import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

def get_complete_record(supabase: Client, table_name, batch_size=100, max_records=1000):
    """Get the first record from a table that has no NULL values"""
    try:
        offset = 0
        
        while offset < max_records:
            response = supabase.table(table_name).select("*").range(offset, offset + batch_size - 1).execute()
            
            if not response.data:
                break
            
            # Check each record for completeness
            for record in response.data:
                if all(value is not None for value in record.values()):
                    return record
            
            offset += batch_size
        
        # Fallback: return the record with the fewest NULLs
        response = supabase.table(table_name).select("*").limit(batch_size).execute()
        if response.data:
            best_record = min(response.data, key=lambda r: sum(1 for v in r.values() if v is None))
            return best_record
        
        return {}
        
    except Exception as e:
        print(f"❌ Error getting record from {table_name}: {e}")
        return {}

def main():
    print("🔍 Extracting Supabase schema...")
    
    # Load environment variables from ufc-tracker folder
    env_path = os.path.join("ufc-tracker", ".env")
    if not os.path.exists(env_path):
        alternative_paths = [
            ".env",
            os.path.join("..", "ufc-tracker", ".env"),
            os.path.join(".", "ufc-tracker", ".env")
        ]
        
        for path in alternative_paths:
            if os.path.exists(path):
                env_path = path
                break
        else:
            print("❌ Could not find .env file")
            return
    
    load_dotenv(env_path)
    
    # Get Supabase connection details
    supabase_url = os.getenv("REACT_APP_SUPABASE_URL")
    supabase_key = os.getenv("REACT_APP_SUPABASE_ANON_KEY")
    
    if not all([supabase_url, supabase_key]):
        print("❌ Missing required environment variables")
        return
    
    # Connect to Supabase
    try:
        supabase: Client = create_client(supabase_url, supabase_key)
    except Exception as e:
        print(f"❌ Supabase connection failed: {e}")
        return
    
    # Define tables to extract
    tables = [
        "fighters",
        "fight_history", 
        "rankings",
        "upcoming_fights",
        "user_favorites"
    ]
    
    schema_data = {}
    
    for table in tables:
        complete_record = get_complete_record(supabase, table)
        if complete_record:
            schema_data[table] = complete_record
    
    # Save schema to file
    output_file = "supabase_schema.json"
    
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(schema_data, f, indent=2, ensure_ascii=False, default=str)
        
        print(f"✅ Schema extracted successfully and saved to {output_file}")
        
    except Exception as e:
        print(f"❌ Error saving schema file: {e}")

if __name__ == "__main__":
    main()