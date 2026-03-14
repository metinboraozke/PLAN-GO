import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DB_NAME", "sita_db")

async def check_db():
    if not MONGODB_URL:
        print("❌ MONGODB_URL is missing in .env")
        return

    print(f"🔄 Connecting to MongoDB: {DB_NAME}...")
    try:
        client = AsyncIOMotorClient(MONGODB_URL)
        # The is_master command is cheap and does not require auth.
        await client.admin.command('ping')
        print(f"✅ MongoDB Connection Successful!")
        
        db = client[DB_NAME]
        collections = await db.list_collection_names()
        print(f"📂 Collections: {collections}")
        
    except Exception as e:
        print(f"❌ MongoDB Connection Failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
