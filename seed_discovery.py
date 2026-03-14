"""
SITA Discovery Seed Script
Populates MongoDB with realistic data for the Discovery screen
"""

import asyncio
import os
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = "sita_db"

async def seed_database():
    """Main seeding function"""
    print("🌱 SITA Veritabanı Seeding Başlıyor...")
    print(f"📡 MongoDB'ye bağlanılıyor...")
    
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    # ============================================
    # 1. DEAL OF THE DAY
    # ============================================
    print("\n🔥 Deal of the Day ekleniyor...")
    
    await db.deal_of_day.delete_many({})  # Clear existing
    
    deal_of_day = {
        "title": "Istanbul → London",
        "route": "IST → LHR",
        "origin": "IST",
        "destination": "LHR",
        "airline": "Pegasus Airlines",
        "discount_rate": 45,
        "original_price": 2200,
        "discounted_price": 1200,
        "currency": "TRY",
        "image_url": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800",
        "valid_until": datetime.utcnow() + timedelta(days=4, hours=23),
        "remaining_days": 4,
        "remaining_hours": 23,
        "is_live": True,
        "visa_required": True,
        "created_at": datetime.utcnow()
    }
    await db.deal_of_day.insert_one(deal_of_day)
    print("   ✅ Istanbul → London ₺1,200 (%45 OFF)")
    
    # ============================================
    # 2. VIRAL STORIES
    # ============================================
    print("\n📸 Viral Stories ekleniyor...")
    
    await db.viral_stories.delete_many({})  # Clear existing
    
    viral_stories = [
        {
            "location_name": "Cappadocia",
            "cover_image_url": "https://images.unsplash.com/photo-1641128324972-af3212f0f6bd?w=200",
            "story_slides": [
                {"type": "image", "url": "https://images.unsplash.com/photo-1641128324972-af3212f0f6bd?w=600"}
            ],
            "view_count": 12500,
            "city": "Nevşehir",
            "country": "Turkey",
            "is_viral": True,
            "created_at": datetime.utcnow()
        },
        {
            "location_name": "Dubai",
            "cover_image_url": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=200",
            "story_slides": [
                {"type": "image", "url": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600"}
            ],
            "view_count": 18200,
            "city": "Dubai",
            "country": "UAE",
            "is_viral": True,
            "created_at": datetime.utcnow()
        },
        {
            "location_name": "Bodrum",
            "cover_image_url": "https://images.unsplash.com/photo-1568867294988-e49f8c5de4c9?w=200",
            "story_slides": [
                {"type": "image", "url": "https://images.unsplash.com/photo-1568867294988-e49f8c5de4c9?w=600"}
            ],
            "view_count": 7200,
            "city": "Bodrum",
            "country": "Turkey",
            "is_viral": False,
            "created_at": datetime.utcnow()
        },
        {
            "location_name": "Paris",
            "cover_image_url": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200",
            "story_slides": [
                {"type": "image", "url": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600"}
            ],
            "view_count": 15600,
            "city": "Paris",
            "country": "France",
            "is_viral": True,
            "created_at": datetime.utcnow()
        }
    ]
    
    for story in viral_stories:
        await db.viral_stories.insert_one(story)
        print(f"   ✅ {story['location_name']} ({story['view_count']:,} views)")
    
    # ============================================
    # 3. BUDGET ESCAPES
    # ============================================
    print("\n💰 Budget Escapes ekleniyor...")
    
    await db.budget_escapes.delete_many({})  # Clear existing
    
    budget_escapes = [
        {
            "city": "Rome",
            "country": "Italy",
            "image_url": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400",
            "starting_price": 1890,
            "currency": "TRY",
            "discount_badge": "30%",
            "flight_duration": "2h 15m",
            "is_visa_free": False,
            "visa_required": True,
            "rating": 4.7,
            "created_at": datetime.utcnow()
        },
        {
            "city": "Berlin",
            "country": "Germany",
            "image_url": "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=400",
            "starting_price": 2150,
            "currency": "TRY",
            "discount_badge": "25%",
            "flight_duration": "2h 45m",
            "is_visa_free": False,
            "visa_required": True,
            "rating": 4.5,
            "created_at": datetime.utcnow()
        },
        {
            "city": "Athens",
            "country": "Greece",
            "image_url": "https://images.unsplash.com/photo-1555993539-1732b0258235?w=400",
            "starting_price": 1450,
            "currency": "TRY",
            "discount_badge": "20%",
            "flight_duration": "1h 20m",
            "is_visa_free": False,
            "visa_required": True,
            "rating": 4.6,
            "created_at": datetime.utcnow()
        },
        {
            "city": "Sarajevo",
            "country": "Bosnia",
            "image_url": "https://images.unsplash.com/photo-1586183189334-a4a7f7a36969?w=400",
            "starting_price": 3100,
            "currency": "TRY",
            "discount_badge": None,
            "flight_duration": "1h 30m",
            "is_visa_free": True,
            "visa_required": False,
            "rating": 4.8,
            "transport_type": "Bus + Flight",
            "created_at": datetime.utcnow()
        },
        {
            "city": "Tbilisi",
            "country": "Georgia",
            "image_url": "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=400",
            "starting_price": 2800,
            "currency": "TRY",
            "discount_badge": "15%",
            "flight_duration": "2h 00m",
            "is_visa_free": True,
            "visa_required": False,
            "rating": 4.7,
            "created_at": datetime.utcnow()
        }
    ]
    
    for escape in budget_escapes:
        await db.budget_escapes.insert_one(escape)
        visa_status = "✅ Vizesiz" if escape['is_visa_free'] else "🛂 Vize Gerekli"
        print(f"   ✅ {escape['city']} - ₺{escape['starting_price']:,} {visa_status}")
    
    # ============================================
    # 4. VISA-FREE GEMS
    # ============================================
    print("\n💎 Visa-Free Gems ekleniyor...")
    
    await db.visa_free_gems.delete_many({})  # Clear existing
    
    visa_free_gems = [
        {
            "country": "Serbia",
            "city": "Belgrade",
            "flag_emoji": "🇷🇸",
            "visa_status": "Visa-Free",
            "flight_duration": "1h 45m",
            "nights": 2,
            "price": 4200,
            "currency": "TRY",
            "is_visa_free": True,
            "created_at": datetime.utcnow()
        },
        {
            "country": "Bosnia",
            "city": "Sarajevo",
            "flag_emoji": "🇧🇦",
            "visa_status": "Visa-Free",
            "flight_duration": "1h 30m",
            "nights": 3,
            "price": 3100,
            "currency": "TRY",
            "is_visa_free": True,
            "created_at": datetime.utcnow()
        },
        {
            "country": "Georgia",
            "city": "Tbilisi",
            "flag_emoji": "🇬🇪",
            "visa_status": "Visa-Free",
            "flight_duration": "2h 00m",
            "nights": 4,
            "price": 2800,
            "currency": "TRY",
            "is_visa_free": True,
            "created_at": datetime.utcnow()
        },
        {
            "country": "Montenegro",
            "city": "Kotor",
            "flag_emoji": "🇲🇪",
            "visa_status": "Visa-Free",
            "flight_duration": "1h 40m",
            "nights": 3,
            "price": 4500,
            "currency": "TRY",
            "is_visa_free": True,
            "created_at": datetime.utcnow()
        },
        {
            "country": "North Macedonia",
            "city": "Skopje",
            "flag_emoji": "🇲🇰",
            "visa_status": "Visa-Free",
            "flight_duration": "1h 15m",
            "nights": 2,
            "price": 2200,
            "currency": "TRY",
            "is_visa_free": True,
            "created_at": datetime.utcnow()
        }
    ]
    
    for gem in visa_free_gems:
        await db.visa_free_gems.insert_one(gem)
        print(f"   ✅ {gem['flag_emoji']} {gem['city']}, {gem['country']} - ₺{gem['price']:,}")
    
    # ============================================
    # 5. MAP PINS
    # ============================================
    print("\n📍 Map Pins ekleniyor...")
    
    await db.map_pins.delete_many({})  # Clear existing
    
    map_pins = [
        {
            "title": "Galata Hidden Rooftop",
            "description": "Gizli bir çatı katı mekanı, İstanbul manzarası eşsiz!",
            "lat": 41.0256,
            "lng": 28.9744,
            "category": "cafe",
            "image_url": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400",
            "is_secret_spot": True,
            "is_viral": True,
            "friends_visited": 12,
            "rating": 4.8,
            "has_voice_note": True,
            "voice_note_url": None,
            "tags": ["Cafe & Lounge", "Rooftop", "Hidden Gem"],
            "added_by": "ahmet_traveler",
            "created_at": datetime.utcnow()
        },
        {
            "title": "Karaköy Lokantası",
            "description": "En iyi mezes ve rakı için harika bir yer.",
            "lat": 41.0225,
            "lng": 28.9773,
            "category": "restaurant",
            "image_url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400",
            "is_secret_spot": False,
            "is_viral": False,
            "friends_visited": 8,
            "rating": 4.6,
            "has_voice_note": False,
            "tags": ["Restaurant", "Turkish", "Meze"],
            "added_by": "zeynep_foodie",
            "created_at": datetime.utcnow()
        },
        {
            "title": "Cihangir Sunset Point",
            "description": "Günbatımı izlemek için en güzel nokta.",
            "lat": 41.0312,
            "lng": 28.9823,
            "category": "viewpoint",
            "image_url": "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=400",
            "is_secret_spot": True,
            "is_viral": True,
            "friends_visited": 24,
            "rating": 4.9,
            "has_voice_note": True,
            "tags": ["Viewpoint", "Sunset", "Photo Spot"],
            "added_by": "can_photographer",
            "created_at": datetime.utcnow()
        }
    ]
    
    for pin in map_pins:
        await db.map_pins.insert_one(pin)
        viral_badge = "🔥" if pin['is_viral'] else ""
        print(f"   ✅ {pin['title']} ⭐{pin['rating']} {viral_badge}")
    
    # ============================================
    # DONE!
    # ============================================
    print("\n" + "="*50)
    print("🎉 Veritabanı canlandırıldı, Keşfet ekranı veriye doydu!")
    print("="*50)
    
    # Print summary
    print(f"\n📊 Özet:")
    print(f"   • Deal of the Day: 1 kayıt")
    print(f"   • Viral Stories: {len(viral_stories)} kayıt")
    print(f"   • Budget Escapes: {len(budget_escapes)} kayıt")
    print(f"   • Visa-Free Gems: {len(visa_free_gems)} kayıt")
    print(f"   • Map Pins: {len(map_pins)} kayıt")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
