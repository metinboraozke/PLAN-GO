"""
Database module for MongoDB Atlas connection using Motor (async driver).
SITA Smart Planner - Centralized Database Manager for all collections.
"""
import os
from datetime import datetime
from typing import Optional, List, Dict, Any, TypeVar, Generic
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from dotenv import load_dotenv
from bson import ObjectId

# Load environment variables
load_dotenv()

# Database configuration
MONGODB_URL: str = os.getenv("MONGODB_URL", "")
DB_NAME: str = os.getenv("DB_NAME", "sita_db")

# Type variable for generic operations
T = TypeVar('T')


class DatabaseManager:
    """
    Centralized MongoDB connection and operations manager.
    Provides async CRUD operations for all collections.
    """
    
    _client: Optional[AsyncIOMotorClient] = None
    _database: Optional[AsyncIOMotorDatabase] = None
    
    # ============== Connection Management ==============
    
    @classmethod
    async def connect(cls) -> None:
        """
        Establishes connection to MongoDB Atlas.
        Should be called during application startup.
        """
        try:
            cls._client = AsyncIOMotorClient(MONGODB_URL)
            cls._database = cls._client[DB_NAME]
            # Verify connection
            await cls._client.admin.command("ping")
            print("[OK] MongoDB Atlas baglantisi basarili: " + str(DB_NAME))
        except Exception as e:
            print("[ERR] MongoDB baglanti hatasi: " + str(e))
            raise e
    
    @classmethod
    async def disconnect(cls) -> None:
        """
        Closes the MongoDB connection.
        Should be called during application shutdown.
        """
        try:
            if cls._client:
                cls._client.close()
                cls._client = None
                cls._database = None
                print("🔌 MongoDB bağlantısı kapatıldı")
        except Exception as e:
            print(f"❌ Bağlantı kapatma hatası: {e}")
            raise e
    
    @classmethod
    def get_database(cls) -> AsyncIOMotorDatabase:
        """Returns the database instance."""
        if cls._database is None:
            raise RuntimeError("Veritabanına bağlı değil. Önce connect() çağırın.")
        return cls._database
    
    @classmethod
    def get_collection(cls, collection_name: str) -> AsyncIOMotorCollection:
        """Returns a specific collection from the database."""
        database = cls.get_database()
        return database[collection_name]
    
    # ============== Generic CRUD Operations ==============
    
    @classmethod
    async def find_all(
        cls,
        collection_name: str,
        query: Dict[str, Any] = None,
        skip: int = 0,
        limit: int = 100,
        sort_by: str = "created_at",
        sort_order: int = -1
    ) -> List[Dict[str, Any]]:
        """
        Retrieves all documents from a collection with optional filtering.
        
        Args:
            collection_name: Name of the collection.
            query: Optional filter query.
            skip: Number of documents to skip.
            limit: Maximum number of documents to return.
            sort_by: Field to sort by.
            sort_order: Sort order (-1 for descending, 1 for ascending).
            
        Returns:
            List of documents with _id converted to string.
        """
        try:
            collection = cls.get_collection(collection_name)
            query = query or {}
            
            cursor = collection.find(query).skip(skip).limit(limit).sort(sort_by, sort_order)
            documents = await cursor.to_list(length=limit)
            
            # Convert ObjectId to string for each document
            for doc in documents:
                if "_id" in doc:
                    doc["_id"] = str(doc["_id"])
            
            return documents
            
        except Exception as e:
            print(f"❌ find_all hatası ({collection_name}): {e}")
            return []
    
    @classmethod
    async def find_one(
        cls,
        collection_name: str,
        query: Dict[str, Any] = None,
        document_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieves a single document from a collection.
        
        Args:
            collection_name: Name of the collection.
            query: Filter query (optional if document_id is provided).
            document_id: Document ObjectId as string.
            
        Returns:
            Document with _id converted to string, or None if not found.
        """
        try:
            collection = cls.get_collection(collection_name)
            
            # Build query
            if document_id:
                if not ObjectId.is_valid(document_id):
                    return None
                query = {"_id": ObjectId(document_id)}
            elif query is None:
                return None
            
            document = await collection.find_one(query)
            
            if document and "_id" in document:
                document["_id"] = str(document["_id"])
            
            return document
            
        except Exception as e:
            print(f"❌ find_one hatası ({collection_name}): {e}")
            return None
    
    @classmethod
    async def insert_one(
        cls,
        collection_name: str,
        document: Dict[str, Any]
    ) -> Optional[str]:
        """
        Inserts a single document into a collection.
        
        Args:
            collection_name: Name of the collection.
            document: Document to insert.
            
        Returns:
            Inserted document ID as string, or None on failure.
        """
        try:
            collection = cls.get_collection(collection_name)
            
            # Add timestamps if not present
            if "created_at" not in document:
                document["created_at"] = datetime.utcnow()
            if "updated_at" not in document:
                document["updated_at"] = datetime.utcnow()
            
            result = await collection.insert_one(document)
            return str(result.inserted_id)
            
        except Exception as e:
            print(f"❌ insert_one hatası ({collection_name}): {e}")
            return None
    
    @classmethod
    async def update_one(
        cls,
        collection_name: str,
        document_id: str,
        update_data: Dict[str, Any],
        upsert: bool = False
    ) -> bool:
        """
        Updates a single document in a collection.
        
        Args:
            collection_name: Name of the collection.
            document_id: Document ObjectId as string.
            update_data: Fields to update.
            upsert: Whether to insert if document doesn't exist.
            
        Returns:
            True if update was successful, False otherwise.
        """
        try:
            if not ObjectId.is_valid(document_id):
                return False
            
            collection = cls.get_collection(collection_name)
            
            # Add updated_at timestamp
            update_data["updated_at"] = datetime.utcnow()
            
            result = await collection.update_one(
                {"_id": ObjectId(document_id)},
                {"$set": update_data},
                upsert=upsert
            )
            
            return result.modified_count > 0 or result.upserted_id is not None
            
        except Exception as e:
            print(f"❌ update_one hatası ({collection_name}): {e}")
            return False
    
    @classmethod
    async def delete_one(
        cls,
        collection_name: str,
        document_id: str
    ) -> bool:
        """
        Deletes a single document from a collection.
        
        Args:
            collection_name: Name of the collection.
            document_id: Document ObjectId as string.
            
        Returns:
            True if deletion was successful, False otherwise.
        """
        try:
            if not ObjectId.is_valid(document_id):
                return False
            
            collection = cls.get_collection(collection_name)
            result = await collection.delete_one({"_id": ObjectId(document_id)})
            
            return result.deleted_count > 0
            
        except Exception as e:
            print(f"❌ delete_one hatası ({collection_name}): {e}")
            return False
    
    @classmethod
    async def count(
        cls,
        collection_name: str,
        query: Dict[str, Any] = None
    ) -> int:
        """
        Counts documents in a collection.
        
        Args:
            collection_name: Name of the collection.
            query: Optional filter query.
            
        Returns:
            Document count.
        """
        try:
            collection = cls.get_collection(collection_name)
            query = query or {}
            return await collection.count_documents(query)
        except Exception as e:
            print(f"❌ count hatası ({collection_name}): {e}")
            return 0


# ============== Collection Names ==============

COLLECTIONS = {
    "wishlists": "wishlists",
    "deals": "deals",
    "pins": "pins",
    "users": "users",
    "user_profiles": "users",  # Alias for visited-country endpoints
    "price_history": "price_history",
    "event_pins": "event_pins",
    "join_requests": "join_requests",
    "event_chat":    "event_chat",
    "notifications": "notifications",
}


# ============== Convenience Functions ==============

def get_wishlist_collection() -> AsyncIOMotorCollection:
    """Returns the wishlists collection."""
    return DatabaseManager.get_collection(COLLECTIONS["wishlists"])


def get_deals_collection() -> AsyncIOMotorCollection:
    """Returns the discovery deals collection."""
    return DatabaseManager.get_collection(COLLECTIONS["deals"])


def get_pins_collection() -> AsyncIOMotorCollection:
    """Returns the map pins collection."""
    return DatabaseManager.get_collection(COLLECTIONS["pins"])


def get_users_collection() -> AsyncIOMotorCollection:
    """Returns the users collection."""
    return DatabaseManager.get_collection(COLLECTIONS["users"])


def get_price_history_collection() -> AsyncIOMotorCollection:
    """Returns the price_history collection."""
    return DatabaseManager.get_collection(COLLECTIONS["price_history"])


# ============== Collection-Specific Operations ==============

class WishlistService:
    """Service class for wishlist operations."""
    
    @staticmethod
    async def find_all(query=None, skip=0, limit=100) -> List[Dict]:
        return await DatabaseManager.find_all(COLLECTIONS["wishlists"], query, skip, limit)
    
    @staticmethod
    async def find_one(wishlist_id: str) -> Optional[Dict]:
        return await DatabaseManager.find_one(COLLECTIONS["wishlists"], document_id=wishlist_id)
    
    @staticmethod
    async def update(wishlist_id: str, data: Dict) -> bool:
        return await DatabaseManager.update_one(COLLECTIONS["wishlists"], wishlist_id, data)
    
    @staticmethod
    async def delete(wishlist_id: str) -> bool:
        """Deletes a wishlist by ID."""
        return await DatabaseManager.delete_one(COLLECTIONS["wishlists"], wishlist_id)


class DealService:
    """Service class for discovery deal operations."""
    
    @staticmethod
    async def find_all(query=None, skip=0, limit=100) -> List[Dict]:
        return await DatabaseManager.find_all(COLLECTIONS["deals"], query, skip, limit)
    
    @staticmethod
    async def find_one(deal_id: str) -> Optional[Dict]:
        return await DatabaseManager.find_one(COLLECTIONS["deals"], document_id=deal_id)
    
    @staticmethod
    async def find_by_category(category: str, limit=20) -> List[Dict]:
        return await DatabaseManager.find_all(
            COLLECTIONS["deals"], 
            {"category": category}, 
            limit=limit
        )


class PinService:
    """Service class for map pin operations."""
    
    @staticmethod
    async def find_all(query=None, skip=0, limit=500) -> List[Dict]:
        return await DatabaseManager.find_all(COLLECTIONS["pins"], query, skip, limit)
    
    @staticmethod
    async def find_one(pin_id: str) -> Optional[Dict]:
        return await DatabaseManager.find_one(COLLECTIONS["pins"], document_id=pin_id)
    
    @staticmethod
    async def find_by_type(pin_type: str, limit=100) -> List[Dict]:
        return await DatabaseManager.find_all(
            COLLECTIONS["pins"], 
            {"type": pin_type}, 
            limit=limit
        )
    
    @staticmethod
    async def find_nearby(lat: float, lng: float, radius_km: float = 10) -> List[Dict]:
        """Find pins near a location (simplified without geospatial index)."""
        # Note: For production, use MongoDB geospatial queries with 2dsphere index
        all_pins = await DatabaseManager.find_all(COLLECTIONS["pins"], limit=500)
        # Filter by approximate distance (simplified)
        nearby = []
        for pin in all_pins:
            pin_lat = pin.get("lat", 0)
            pin_lng = pin.get("lng", 0)
            # Simple distance check (not accurate for large distances)
            if abs(pin_lat - lat) < radius_km/111 and abs(pin_lng - lng) < radius_km/85:
                nearby.append(pin)
        return nearby


class UserService:
    """Service class for user profile operations."""
    
    @staticmethod
    async def find_all(query=None, skip=0, limit=100) -> List[Dict]:
        return await DatabaseManager.find_all(COLLECTIONS["users"], query, skip, limit)
    
    @staticmethod
    async def find_one(user_id: str = None, username: str = None) -> Optional[Dict]:
        if user_id:
            return await DatabaseManager.find_one(COLLECTIONS["users"], document_id=user_id)
        elif username:
            return await DatabaseManager.find_one(COLLECTIONS["users"], {"username": username})
        return None
    
    @staticmethod
    async def find_by_email(email: str) -> Optional[Dict]:
        """Find a user by email address."""
        return await DatabaseManager.find_one(COLLECTIONS["users"], {"email": email})
    
    @staticmethod
    async def create(user_data: Dict) -> Optional[str]:
        """Create a new user. Returns inserted ID."""
        user_data["created_at"] = datetime.utcnow()
        user_data["updated_at"] = datetime.utcnow()
        return await DatabaseManager.insert_one(COLLECTIONS["users"], user_data)
    
    @staticmethod
    async def update(user_id: str, data: Dict) -> bool:
        return await DatabaseManager.update_one(COLLECTIONS["users"], user_id, data)
    
    @staticmethod
    async def add_badge(user_id: str, badge: Dict) -> bool:
        collection = DatabaseManager.get_collection(COLLECTIONS["users"])
        result = await collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$push": {"badges": badge}, "$set": {"updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0


class EventPinService:
    """Service class for PAX EventPin operations."""

    @staticmethod
    async def find_all(query=None, skip=0, limit=200) -> List[Dict]:
        return await DatabaseManager.find_all(
            COLLECTIONS["event_pins"], query, skip, limit,
            sort_by="event_date", sort_order=1
        )

    @staticmethod
    async def find_one(event_id: str) -> Optional[Dict]:
        return await DatabaseManager.find_one(COLLECTIONS["event_pins"], document_id=event_id)

    @staticmethod
    async def create(data: Dict) -> Optional[str]:
        return await DatabaseManager.insert_one(COLLECTIONS["event_pins"], data)

    @staticmethod
    async def delete(event_id: str) -> bool:
        return await DatabaseManager.delete_one(COLLECTIONS["event_pins"], event_id)

    @staticmethod
    async def increment_participant(event_id: str, delta: int = 1) -> bool:
        """Atomically increment (or decrement) participant_count."""
        if not ObjectId.is_valid(event_id):
            return False
        collection = DatabaseManager.get_collection(COLLECTIONS["event_pins"])
        result = await collection.update_one(
            {"_id": ObjectId(event_id)},
            {"$inc": {"participant_count": delta}, "$set": {"updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

    @staticmethod
    async def count_join_requests(event_id: str) -> int:
        return await DatabaseManager.count(
            COLLECTIONS["join_requests"], {"event_id": event_id}
        )


class JoinRequestService:
    """Service class for PAX EventPin join requests."""

    @staticmethod
    async def find_by_event(event_id: str) -> List[Dict]:
        return await DatabaseManager.find_all(
            COLLECTIONS["join_requests"],
            {"event_id": event_id},
            limit=500,
            sort_by="created_at",
            sort_order=1
        )

    @staticmethod
    async def find_one(request_id: str) -> Optional[Dict]:
        return await DatabaseManager.find_one(COLLECTIONS["join_requests"], document_id=request_id)

    @staticmethod
    async def already_requested(event_id: str, user_id: str) -> bool:
        """Returns True if this user already sent a request for this event."""
        doc = await DatabaseManager.find_one(
            COLLECTIONS["join_requests"], {"event_id": event_id, "user_id": user_id}
        )
        return doc is not None

    @staticmethod
    async def create(data: Dict) -> Optional[str]:
        return await DatabaseManager.insert_one(COLLECTIONS["join_requests"], data)

    @staticmethod
    async def update_status(request_id: str, new_status: str) -> bool:
        return await DatabaseManager.update_one(
            COLLECTIONS["join_requests"], request_id, {"status": new_status}
        )


class NotificationService:
    """Service class for in-app notifications."""

    @staticmethod
    async def create(data: Dict) -> Optional[str]:
        return await DatabaseManager.insert_one(COLLECTIONS["notifications"], data)

    @staticmethod
    async def find_by_user(user_id: str, unread_only: bool = False) -> List[Dict]:
        query: Dict[str, Any] = {"user_id": user_id}
        if unread_only:
            query["read"] = False
        return await DatabaseManager.find_all(
            COLLECTIONS["notifications"], query,
            limit=50, sort_by="created_at", sort_order=-1
        )

    @staticmethod
    async def mark_all_read(user_id: str) -> bool:
        collection = DatabaseManager.get_collection(COLLECTIONS["notifications"])
        result = await collection.update_many(
            {"user_id": user_id, "read": False},
            {"$set": {"read": True, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count >= 0  # True even if 0 updated (already read)

    @staticmethod
    async def unread_count(user_id: str) -> int:
        return await DatabaseManager.count(
            COLLECTIONS["notifications"], {"user_id": user_id, "read": False}
        )


# ============== SEED DATA FUNCTION (DISABLED) ==============

async def seed_data():
    """
    Seed function disabled - Application starts with empty database.
    All data is created dynamically by the user.
    """
    print("\n✅ Uygulama boş veritabanı ile başlıyor - seed verisi eklenmedi.")
    print("   📝 Kullanıcılar kendi planlarını oluşturabilir.")
    return None


