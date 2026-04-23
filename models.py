"""
Pydantic models for SITA Smart Planner - Complete Data Schema.
Supports: Discovery, Social Map, Smart Planner, Social Profile screens.
"""
from datetime import datetime, date
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr
from bson import ObjectId


# ============================================================================
#                              ENUMS
# ============================================================================

class TripStatus(str, Enum):
    """Trip/wishlist status tracking."""
    PROCESSING = "processing"   # Fiyatlar taranıyor
    TRACKING = "tracking"       # Aktif olarak takip ediliyor
    CONFIRMED = "confirmed"     # Kullanıcı tarafından onaylandı, scraping durdu
    COMPLETED = "completed"     # Tamamlandı


class ItineraryItemType(str, Enum):
    """Types of itinerary items."""
    FLIGHT = "flight"
    HOTEL = "hotel"
    TRANSFER = "transfer"
    ACTIVITY = "activity"
    RESTAURANT = "restaurant"


class DealCategory(str, Enum):
    """Discovery deal categories."""
    VISA_FREE = "visa-free"
    UNDER_5K = "under-5k"
    UNDER_10K = "under-10k"
    WEEKEND_GETAWAY = "weekend-getaway"
    BEACH = "beach"
    CULTURAL = "cultural"
    ADVENTURE = "adventure"
    LUXURY = "luxury"
    BUDGET = "budget"
    TRENDING = "trending"


class MapPinType(str, Enum):
    """Social map pin types."""
    CHEAP_EATS = "cheap-eats"
    VIEWPOINTS = "viewpoints"
    HIDDEN_GEMS = "hidden-gems"
    NIGHTLIFE = "nightlife"
    SHOPPING = "shopping"
    HISTORICAL = "historical"
    NATURE = "nature"
    CAFE = "cafe"
    RESTAURANT = "restaurant"
    ATTRACTION = "attraction"


class BadgeType(str, Enum):
    """Types of digital passport badges."""
    EXPLORER     = "explorer"      # 5 countries
    ADVENTURER   = "adventurer"    # 10 countries
    GLOBETROTTER = "globetrotter"  # 20 countries
    NOMAD        = "nomad"         # 50 countries
    SOCIAL_EVENT = "social_event"  # PAX etkinlik katılımı


class NotificationType(str, Enum):
    """In-app notification categories."""
    JOIN_APPROVED   = "join_approved"   # Join request approved
    JOIN_REJECTED   = "join_rejected"   # Join request rejected
    EVENT_REMINDER  = "event_reminder"  # Upcoming event reminder
    EVENT_STAMP     = "event_stamp"     # Social event stamp awarded


class NotificationCreate(BaseModel):
    """Payload for a new notification."""
    user_id:     str
    type:        NotificationType
    title:       str            = Field(..., max_length=120)
    body:        str            = Field(..., max_length=500)
    event_id:    Optional[str]  = None
    event_title: Optional[str]  = None
    read:        bool           = False
    created_at:  datetime       = Field(default_factory=datetime.utcnow)


class UserProfileUpdate(BaseModel):
    """Kullanıcı profili güncelleme modeli."""
    avatar_url: Optional[str] = None   # base64 data URL veya harici URL
    bio:        Optional[str] = Field(None, max_length=160)
    location:   Optional[str] = Field(None, max_length=80)


class VisitedCountry(BaseModel):
    """Model for a visited country with metadata."""
    country_code: str = Field(..., min_length=2, max_length=3, description="ISO Code (TR, US)")
    country_name: Optional[str] = None
    location: Optional[Dict[str, float]] = Field(None, description="Coordinates {lat: float, lng: float}")
    visited_at: datetime = Field(default_factory=datetime.utcnow)


class DateType(str, Enum):
    """Date flexibility type for planner."""
    FIXED = "fixed"
    FLEXIBLE = "flexible"  # Genel esnek tarih
    FLEXIBLE_WEEKEND = "flexible-weekend"
    FLEXIBLE_WEEK = "flexible-week"
    FLEXIBLE_MONTH = "flexible-month"


class TripType(str, Enum):
    """Seyahat tipi (Seyahat Detay Ekranı)."""
    BIREYSEL = "bireysel"
    TUR = "tur"


# ============================================================================
#                           HELPER CLASSES
# ============================================================================

class PyObjectId(str):
    """Custom type for MongoDB ObjectId handling."""
    
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    
    @classmethod
    def validate(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str) and ObjectId.is_valid(v):
            return v
        raise ValueError("Invalid ObjectId")


# ============================================================================
#                    DISCOVERY (KEŞFET) MODELS
# ============================================================================

class DiscoveryDealBase(BaseModel):
    """Base model for Discovery deals."""
    title: str = Field(..., min_length=2, max_length=200, description="Deal title")
    destination: str = Field(..., description="Destination city/country")
    discount_rate: Optional[int] = Field(None, ge=0, le=100, description="Discount percentage")
    price: float = Field(..., gt=0, description="Deal price")
    original_price: Optional[float] = Field(None, description="Original price before discount")
    currency: str = Field(default="TRY", description="Currency code")
    image_url: Optional[str] = Field(None, description="Deal image URL")
    category: DealCategory = Field(..., description="Deal category")
    description: Optional[str] = Field(None, description="Deal description")
    valid_until: Optional[date] = Field(None, description="Deal validity date")
    is_featured: bool = Field(default=False, description="Featured deal flag")


class DiscoveryDealCreate(DiscoveryDealBase):
    """Model for creating a discovery deal."""
    pass


class DiscoveryDealResponse(DiscoveryDealBase):
    """Response model for discovery deals."""
    id: Optional[str] = Field(None, alias="_id", description="MongoDB document ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat()
        }


class DiscoveryDealInDB(DiscoveryDealBase):
    """Internal model for database operations."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "destination": self.destination,
            "discount_rate": self.discount_rate,
            "price": self.price,
            "original_price": self.original_price,
            "currency": self.currency,
            "image_url": self.image_url,
            "category": self.category.value,
            "description": self.description,
            "valid_until": self.valid_until.isoformat() if self.valid_until else None,
            "is_featured": self.is_featured,
            "created_at": self.created_at
        }


# ============================================================================
#                    DISCOVERY - DETAILED MODELS
# ============================================================================

class DealOfTheDay(BaseModel):
    """Deal of the Day - Featured deal with countdown."""
    id: Optional[str] = Field(None, alias="_id")
    title: str = Field(..., description="Deal title - e.g., 'Istanbul → London'")
    route: str = Field(..., description="Route string - e.g., 'IST → LHR'")
    origin: str = Field(..., description="Origin city/airport code")
    destination: str = Field(..., description="Destination city/airport code")
    airline: Optional[str] = Field(None, description="Airline name")
    discount_rate: int = Field(..., ge=0, le=100, description="Discount percentage")
    original_price: float = Field(..., gt=0, description="Original price")
    discounted_price: float = Field(..., gt=0, description="Discounted price")
    currency: str = Field(default="TRY")
    image_url: str = Field(..., description="Hero image URL")
    valid_until: datetime = Field(..., description="Deal expiration time")
    remaining_hours: Optional[int] = Field(None, description="Calculated remaining hours")
    remaining_days: Optional[int] = Field(None, description="Calculated remaining days")
    is_live: bool = Field(default=True, description="Live status indicator")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True


class ViralPinStory(BaseModel):
    """Viral Pin Story - Instagram-style story circles."""
    id: Optional[str] = Field(None, alias="_id")
    location_name: str = Field(..., description="Location name - e.g., 'Cappadocia'")
    cover_image_url: str = Field(..., description="Circle cover image")
    story_slides: List[Dict[str, Any]] = Field(default_factory=list, description="Story slide content")
    view_count: int = Field(default=0, description="Total views")
    user_id: Optional[str] = Field(None, description="Creator user ID")
    username: Optional[str] = Field(None, description="Creator username")
    city: Optional[str] = None
    country: Optional[str] = None
    is_viral: bool = Field(default=False, description="Trending status")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True


class BudgetEscape(BaseModel):
    """Budget Escape - Affordable destination cards."""
    id: Optional[str] = Field(None, alias="_id")
    city: str = Field(..., description="City name - e.g., 'Rome'")
    country: str = Field(..., description="Country name")
    image_url: str = Field(..., description="Destination image")
    starting_price: float = Field(..., gt=0, description="Starting from price")
    currency: str = Field(default="TRY")
    discount_badge: Optional[str] = Field(None, description="Discount badge text - e.g., '30%'")
    flight_duration: Optional[str] = Field(None, description="Flight duration")
    is_visa_free: bool = Field(default=False, description="Visa-free for TR passports")
    rating: Optional[float] = Field(None, ge=0, le=5)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True


class VisaFreeGem(BaseModel):
    """Visa-Free Gem - Countries without visa requirement."""
    id: Optional[str] = Field(None, alias="_id")
    country: str = Field(..., description="Country name")
    city: str = Field(..., description="Main city")
    flag_emoji: str = Field(..., description="Country flag emoji")
    visa_status: str = Field(default="Visa-Free", description="Visa requirement status")
    flight_duration: str = Field(..., description="Flight duration from Istanbul")
    nights: int = Field(..., ge=1, description="Suggested nights")
    price: float = Field(..., gt=0, description="Package price")
    currency: str = Field(default="TRY")
    includes: List[str] = Field(default_factory=list, description="What's included")
    image_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True


class DiscoveryScreenResponse(BaseModel):
    """Complete Discovery Screen Response - All sections in one."""
    deal_of_the_day: Optional[DealOfTheDay] = None
    viral_stories: List[ViralPinStory] = Field(default_factory=list)
    budget_escapes: List[BudgetEscape] = Field(default_factory=list)
    visa_free_gems: List[VisaFreeGem] = Field(default_factory=list)
    featured_deals: List[DiscoveryDealResponse] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
#                    SOCIAL MAP (HARİTA) MODELS
# ============================================================================

class UserTip(BaseModel):
    """User tip for a map pin."""
    user_id: str = Field(..., description="User who left the tip")
    username: str = Field(..., description="Username")
    content: str = Field(..., description="Tip text content")
    audio_url: Optional[str] = Field(None, description="Voice note URL")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MapPinBase(BaseModel):
    """Base model for Social Map pins."""
    user_id: Optional[str] = Field(None, description="Owner user ID")
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lng: float = Field(..., ge=-180, le=180, description="Longitude")
    title: str = Field(..., min_length=2, max_length=200, description="Pin title/name")
    type: MapPinType = Field(..., description="Pin category type")
    rating: Optional[float] = Field(None, ge=0, le=5, description="Average rating")
    address: Optional[str] = Field(None, description="Location address")
    image_url: Optional[str] = Field(None, description="Pin image URL")
    audio_note_url: Optional[str] = Field(None, description="Voice note URL (optional)")
    user_tips: List[UserTip] = Field(default_factory=list, description="User tips/notes")
    city: Optional[str] = Field(None, description="City name")
    country: Optional[str] = Field(None, description="Country name")
    # Enhanced Social Map fields
    is_secret_spot: bool = Field(default=False, description="Secret Spot tag")
    is_viral: bool = Field(default=False, description="Viral Pin Story tag")
    friends_visited: int = Field(default=0, description="Number of friends who visited")
    description: Optional[str] = Field(None, description="Place description/details")
    place_type: Optional[str] = Field(None, description="Type label - e.g., 'Cafe & Lounge'")
    price_range: Optional[str] = Field(None, description="Price range - e.g., '₺₺'")
    opening_hours: Optional[str] = Field(None, description="Opening hours")
    has_voice_note: bool = Field(default=False, description="Flag for voice note presence")


class MapPinCreate(BaseModel):
    """Model for creating a map pin with optional media."""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    title: str = Field(..., min_length=2, max_length=200)
    type: MapPinType
    user_id: Optional[str] = Field(None, description="Creator user ID")
    rating: Optional[float] = Field(None, ge=0, le=5)
    address: Optional[str] = None
    image_url: Optional[str] = Field(None, description="Image URL (optional)")
    audio_note_url: Optional[str] = Field(None, description="Voice note URL (optional)")
    city: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = Field(None, description="Pin details/description")
    place_type: Optional[str] = Field(None, description="Category label")
    is_secret_spot: bool = Field(default=False)


class MapPinResponse(MapPinBase):
    """Response model for map pins."""
    id: Optional[str] = Field(None, alias="_id", description="MongoDB document ID")
    tips_count: int = Field(default=0, description="Number of user tips")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat()
        }


class MapPinInDB(MapPinBase):
    """Internal model for database operations."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "lat": self.lat,
            "lng": self.lng,
            "title": self.title,
            "type": self.type.value,
            "rating": self.rating,
            "address": self.address,
            "image_url": self.image_url,
            "audio_note_url": self.audio_note_url,
            "has_voice_note": bool(self.audio_note_url),
            "user_tips": [tip.model_dump() for tip in self.user_tips],
            "city": self.city,
            "country": self.country,
            "description": self.description,
            "place_type": self.place_type,
            "is_secret_spot": self.is_secret_spot,
            "is_viral": self.is_viral,
            "friends_visited": self.friends_visited,
            "created_at": self.created_at
        }


# ============================================================================
#                  PAX — EVENT PINS & JOIN REQUESTS
# ============================================================================

class EventType(str, Enum):
    """PAX EventPin category types."""
    SOCIAL    = "social"      # Genel buluşma
    SPORT     = "sport"       # Spor & aktif
    FOOD      = "food"        # Yemek & foodie
    CULTURE   = "culture"     # Kültür & sanat
    TRAVEL    = "travel"      # Seyahat & tur
    MUSIC     = "music"       # Müzik & konser
    ADVENTURE = "adventure"   # Macera & outdoor


class EventStatus(str, Enum):
    ACTIVE  = "active"
    EXPIRED = "expired"


class JoinRequestStatus(str, Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class EventPinCreate(BaseModel):
    """Payload to create a PAX EventPin."""
    lat:              float          = Field(..., ge=-90, le=90)
    lng:              float          = Field(..., ge=-180, le=180)
    title:            str            = Field(..., min_length=3, max_length=150)
    description:      str            = Field(..., min_length=5, max_length=800)
    event_date:       datetime       = Field(..., description="Etkinlik tarihi/saati (ISO 8601)")
    max_participants: int            = Field(default=10, ge=2, le=500)
    event_type:       EventType      = Field(default=EventType.SOCIAL)
    creator_id:       str            = Field(..., description="Oluşturan kullanıcının ID veya oturum anahtarı")
    creator_name:     Optional[str]  = Field(None, description="Görünen isim")
    address:          Optional[str]  = None
    city:             Optional[str]  = None
    country:          Optional[str]  = None
    image_url:        Optional[str]  = None


class EventPinInDB(EventPinCreate):
    """Internal DB model — adds runtime state fields."""
    status:            EventStatus  = Field(default=EventStatus.ACTIVE)
    participant_count: int          = Field(default=0)
    created_at:        datetime     = Field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        d = self.model_dump()
        d["event_date"]  = self.event_date.isoformat() if isinstance(self.event_date, datetime) else self.event_date
        d["created_at"]  = self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at
        d["event_type"]  = self.event_type.value
        d["status"]      = self.status.value
        return d


class EventPinResponse(BaseModel):
    """API response for a single EventPin."""
    id:                Optional[str] = Field(None, alias="_id")
    lat:               float
    lng:               float
    title:             str
    description:       str
    event_date:        Any
    max_participants:  int
    event_type:        str
    creator_id:        str
    creator_name:      Optional[str] = None
    address:           Optional[str] = None
    city:              Optional[str] = None
    country:           Optional[str] = None
    image_url:         Optional[str] = None
    status:            str           = "active"
    participant_count: int           = 0
    join_request_count: int          = 0
    created_at:        Any           = None

    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
        }


class JoinRequestCreate(BaseModel):
    """Send a join request to an EventPin."""
    user_id:   str           = Field(..., description="İstek gönderenin user_id veya oturum anahtarı")
    user_name: Optional[str] = Field(None, description="Görünen isim")
    message:   Optional[str] = Field(None, max_length=300, description="Kısa motivasyon mesajı")


class JoinRequestInDB(JoinRequestCreate):
    """Internal DB model for a join request."""
    event_id:   str
    status:     JoinRequestStatus = Field(default=JoinRequestStatus.PENDING)
    created_at: datetime          = Field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        d = self.model_dump()
        d["created_at"] = self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at
        d["status"]     = self.status.value
        return d


class JoinRequestResponse(BaseModel):
    """API response for a join request."""
    id:        Optional[str] = Field(None, alias="_id")
    event_id:  str
    user_id:   str
    user_name: Optional[str] = None
    message:   Optional[str] = None
    status:    str           = "pending"
    created_at: Any          = None

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class JoinRequestStatusUpdate(BaseModel):
    """Payload to approve or reject a join request (creator only)."""
    status: JoinRequestStatus = Field(..., description="approved veya rejected")



# ============================================================================
#                         EVENT GROUP CHAT MODELS
# ============================================================================

class ChatMessageCreate(BaseModel):
    """Payload to send a message in an event group chat."""
    user_id:   str           = Field(..., description="Mesajı gönderenin user_id")
    user_name: Optional[str] = Field(None, description="Görünen isim")
    text:      str           = Field(..., min_length=1, max_length=500)

class ChatMessageInDB(ChatMessageCreate):
    event_id:   str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        d = self.model_dump()
        d["created_at"] = self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at
        return d

class ChatMessageResponse(BaseModel):
    id:         Optional[str] = Field(None, alias="_id")
    event_id:   str
    user_id:    str
    user_name:  Optional[str] = None
    text:       str
    created_at: Any           = None

    class Config:
        populate_by_name = True

# ============================================================================
#                  SOCIAL PROFILE (PASAPORT) MODELS
# ============================================================================

class Badge(BaseModel):
    """User badge model for Digital Passport."""
    badge_type: BadgeType = Field(..., description="Badge type")
    name: str = Field(..., description="Badge display name")
    icon_url: Optional[str] = Field(None, description="Badge icon URL")
    earned_at: datetime = Field(default_factory=datetime.utcnow)
    description: Optional[str] = Field(None, description="Badge description")


class UserProfileBase(BaseModel):
    """Base model for User Profile / Digital Passport."""
    username: str = Field(..., min_length=3, max_length=50, description="Username")
    email: Optional[str] = Field(None, description="User email")
    avatar_url: Optional[str] = Field(None, description="Profile picture URL")
    level: int = Field(default=1, ge=1, description="User level")
    xp: int = Field(default=0, ge=0, description="Experience points")
    total_saved: float = Field(default=0, ge=0, description="Total money saved (TRY)")
    visited_countries_count: int = Field(default=0, ge=0, description="Number of countries visited")
    total_trips: int = Field(default=0, ge=0, description="Total trips completed")
    badges: List[Badge] = Field(default_factory=list, description="Earned badges")
    visited_countries: List[VisitedCountry] = Field(default_factory=list, description="Visited countries list")


class UserProfileCreate(BaseModel):
    """Model for creating a user profile."""
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class UserProfileResponse(UserProfileBase):
    """Response model for user profile."""
    id: Optional[str] = Field(None, alias="_id", description="MongoDB document ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat()
        }


class UserProfileInDB(UserProfileBase):
    """Internal model for database operations."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    fcm_token: Optional[str] = None   # Firebase Cloud Messaging device token

    def to_dict(self) -> dict:
        return {
            "username": self.username,
            "email": self.email,
            "avatar_url": self.avatar_url,
            "level": self.level,
            "xp": self.xp,
            "total_saved": self.total_saved,
            "visited_countries_count": self.visited_countries_count,
            "total_trips": self.total_trips,
            "badges": [badge.model_dump() for badge in self.badges],
            "visited_countries": [vc.model_dump() for vc in self.visited_countries],
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }


# ============================================================================
#                    SMART PLANNER (WISHLIST) MODELS
# ============================================================================

class FlightDetails(BaseModel):
    """Detailed flight information."""
    flight_number: Optional[str] = Field(None, description="Flight number (e.g., TK1234)")
    airline: str = Field(..., description="Airline name")
    departure_airport: str = Field(..., description="Departure airport code")
    arrival_airport: str = Field(..., description="Arrival airport code")
    departure_time: str = Field(..., description="Departure time (HH:MM)")
    arrival_time: str = Field(..., description="Arrival time (HH:MM)")
    duration: Optional[str] = Field(None, description="Flight duration")
    stops: int = Field(default=0, ge=0, description="Number of stops")
    cabin_class: str = Field(default="economy", description="Cabin class")
    price: float = Field(..., gt=0, description="Flight price")
    currency: str = Field(default="TRY")
    baggage_info: Optional[str] = Field(None, description="Baggage allowance")


class HotelDetails(BaseModel):
    """Detailed hotel information."""
    hotel_name: str = Field(..., description="Hotel name")
    stars: int = Field(default=3, ge=1, le=5, description="Hotel star rating")
    rating: Optional[float] = Field(None, ge=0, le=10, description="User rating")
    address: Optional[str] = Field(None, description="Hotel address")
    check_in: str = Field(..., description="Check-in date")
    check_out: str = Field(..., description="Check-out date")
    room_type: str = Field(default="Standard", description="Room type")
    board_type: Optional[str] = Field(None, description="Board type (e.g., All Inclusive)")
    price_per_night: float = Field(..., gt=0)
    total_price: float = Field(..., gt=0)
    currency: str = Field(default="TRY")
    amenities: List[str] = Field(default_factory=list, description="Hotel amenities")
    image_url: Optional[str] = Field(None)


class ActivityDetails(BaseModel):
    """Detailed activity/tour information."""
    activity_name: str = Field(..., description="Activity name")
    description: Optional[str] = Field(None)
    date: str = Field(..., description="Activity date")
    time: Optional[str] = Field(None, description="Activity time")
    duration: Optional[str] = Field(None, description="Activity duration")
    location: Optional[str] = Field(None, description="Activity location")
    price: float = Field(..., gt=0)
    currency: str = Field(default="TRY")
    includes: List[str] = Field(default_factory=list)
    image_url: Optional[str] = Field(None)


# ============================================================================
#          TRIP DETAIL MODELS — Seyahat Detay Ekranı v2.0
# ============================================================================

class FlightLeg(BaseModel):
    """Uçuş bacağı — UI için zengin veri (Seyahat Detay Ekranı)."""
    departure_code: str = Field(..., description="Kalkış havalimanı kodu (IST)")
    arrival_code: str = Field(..., description="Varış havalimanı kodu (CDG)")
    departure_city: Optional[str] = Field(None, description="Kalkış şehri")
    arrival_city: Optional[str] = Field(None, description="Varış şehri")
    departure_time: Optional[str] = Field(None, description="Kalkış saati HH:MM")
    arrival_time: Optional[str] = Field(None, description="Varış saati HH:MM")
    duration: Optional[str] = Field(None, description="Uçuş süresi (ör. 3s 30dk)")
    stops: int = Field(default=0, ge=0, description="Aktarma sayısı")
    airline: Optional[str] = Field(None, description="Havayolu adı")
    airline_logo_url: Optional[str] = Field(None, description="Havayolu logo URL")
    flight_number: Optional[str] = Field(None, description="Uçuş numarası")
    price: float = Field(default=0.0, ge=0, description="Uçuş fiyatı")
    currency: str = Field(default="TRY")
    cabin_class: str = Field(default="economy")


class HotelOption(BaseModel):
    """Otel alternatifi — Seyahat Detay Ekranı (en fazla 3 seçenek)."""
    hotel_name: str = Field(..., description="Otel adı")
    stars: int = Field(default=3, ge=0, le=5, description="Yıldız sayısı")
    rating: Optional[float] = Field(None, ge=0, le=10, description="Kullanıcı puanı (0-10)")
    image_url: Optional[str] = Field(None, description="Otel görseli URL")
    address: Optional[str] = Field(None, description="Otel adresi")
    price_per_night: float = Field(default=0.0, ge=0, description="Gecelik fiyat")
    total_price: float = Field(default=0.0, ge=0, description="Toplam konaklama fiyatı")
    currency: str = Field(default="TRY")
    nights: int = Field(..., ge=1, description="Konaklama gece sayısı")
    room_type: str = Field(default="Standard Oda")
    amenities: List[str] = Field(default_factory=list, description="Otel olanakları")
    provider: str = Field(default="trivago", description="Veri kaynağı")
    is_recommended: bool = Field(default=False, description="Önerilen seçenek (en iyi puan/fiyat skoru)")


class BudgetSummary(BaseModel):
    """Bütçe özeti — Hedef bütçe vs Mevcut toplam karşılaştırması."""
    target_budget: Optional[float] = Field(None, description="Kullanıcı hedef bütçesi")
    flight_cost: float = Field(default=0.0, description="Uçuş toplam maliyeti")
    hotel_cost: float = Field(default=0.0, description="Otel toplam maliyeti")
    total_cost: float = Field(default=0.0, description="Toplam paket maliyeti")
    currency: str = Field(default="TRY")
    label: str = Field(default="en-iyi-teklif", description="Bütçe etiketi (tam-butce / premium-oneri / en-iyi-teklif / butce-asimi)")
    label_text: str = Field(default="En İyi Teklif", description="Bütçe etiket metni")
    label_icon: str = Field(default="🎯", description="Bütçe etiket ikonu")
    savings: Optional[float] = Field(None, description="Tasarruf miktarı (pozitif = tasarruf)")
    overage: Optional[float] = Field(None, description="Aşım miktarı (pozitif = aşım)")
    usage_percent: Optional[float] = Field(None, description="Bütçe kullanım yüzdesi (%)")


class TripDetail(BaseModel):
    """
    Seyahat detay ekranı için zengin veri objesi.
    Scraper çalıştıktan sonra MongoDB'de 'trip_details' alanı olarak saklanır.
    """
    trip_type: TripType = Field(default=TripType.BIREYSEL, description="Seyahat tipi")
    outbound_flight: Optional[FlightLeg] = Field(None, description="Gidiş uçuşu")
    return_flight: Optional[FlightLeg] = Field(None, description="Dönüş uçuşu")
    hotel_options: List[HotelOption] = Field(
        default_factory=list,
        description="Otel alternatifleri — en fazla 3"
    )
    selected_hotel_index: int = Field(default=0, ge=0, description="Seçili otel indexi (0 = önerilen)")
    budget_summary: Optional[BudgetSummary] = Field(None, description="Bütçe özeti")
    nights: int = Field(default=0, ge=0, description="Konaklama gece sayısı")
    ai_day_plans: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Gemini AI günlük aktivite planları (ilerleyen versiyonda)"
    )
    scraped_at: datetime = Field(default_factory=datetime.utcnow, description="Son tarama zamanı")
    scrape_provider: str = Field(default="trivago+skyscanner", description="Kullanılan scrape sağlayıcısı")


class ItineraryItem(BaseModel):
    """Model for individual itinerary items."""
    item_type: ItineraryItemType = Field(..., description="Type of itinerary item")
    provider: str = Field(..., description="Service provider")
    title: str = Field(..., description="Item title/description")
    price: float = Field(..., gt=0, description="Price for this item")
    currency: str = Field(default="TRY")
    is_selected: bool = Field(default=False, description="Whether this option is selected")
    
    # Type-specific details (only one will be populated based on item_type)
    flight_details: Optional[FlightDetails] = Field(None, description="Flight specific details")
    hotel_details: Optional[HotelDetails] = Field(None, description="Hotel specific details")
    activity_details: Optional[ActivityDetails] = Field(None, description="Activity specific details")
    
    # Generic fields for simple items
    date: Optional[str] = Field(None, description="Date for the item")
    time: Optional[str] = Field(None, description="Time for the item")
    notes: Optional[str] = Field(None, description="Additional notes")


class WishlistBase(BaseModel):
    """Base model for Wishlist/Trip with Smart Planner fields."""
    user_id: Optional[str] = Field(None, description="Owner user ID")
    image_url: Optional[str] = Field(None, description="Destination image URL from Unsplash")
    trip_name: Optional[str] = Field(None, min_length=2, max_length=200, description="Trip name")
    origin: str = Field(..., min_length=2, max_length=100, description="Departure location")
    destination: str = Field(..., min_length=2, max_length=100, description="Arrival location")
    start_date: Optional[date] = Field(None, description="Trip start date")
    end_date: Optional[date] = Field(None, description="Trip end date")
    date_type: DateType = Field(default=DateType.FIXED, description="Date flexibility type")
    target_price: Optional[float] = Field(None, ge=0, description="Target total budget (Legacy)")
    budget: Optional[float] = Field(None, ge=0, description="User defined budget")
    currency: str = Field(default="TRY", max_length=3)
    is_active: bool = Field(default=True, description="Whether price tracking is active")
    status: TripStatus = Field(default=TripStatus.TRACKING)
    travelers_count: int = Field(default=1, ge=1, description="Number of travelers")
    adults: int = Field(default=1, ge=1, description="Number of adults")
    children: int = Field(default=0, ge=0, description="Number of children")
    preferences: List[str] = Field(default_factory=list, description="Trip preferences")
    notes: Optional[str] = Field(None, description="Trip notes")


class WishlistCreate(BaseModel):
    """Model for creating a new wishlist entry."""
    user_id: Optional[str] = Field(None, description="Owner user ID (sent from authenticated client)")
    trip_name: Optional[str] = Field(None, min_length=2, max_length=200)
    origin: str = Field(..., min_length=2, max_length=100)
    destination: str = Field(..., min_length=2, max_length=100)
    
    # Destination coordinates (from autocomplete)
    destination_display: Optional[str] = Field(None, max_length=200, description="Full display name: City, Country")
    destination_lat: Optional[float] = Field(None, description="Latitude coordinate")
    destination_lng: Optional[float] = Field(None, description="Longitude coordinate")
    destination_country: Optional[str] = Field(None, max_length=100, description="Country name")
    destination_country_code: Optional[str] = Field(None, max_length=3, description="ISO country code")
    destination_iata: Optional[str] = Field(None, max_length=3, description="Destination airport IATA code (e.g. ADB, CDG)")
    
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    date_type: DateType = Field(default=DateType.FIXED)
    
    # Flexible date options
    flexible_month: Optional[str] = Field(None, description="Month for flexible dates (jan, feb, etc)")
    flexible_duration: Optional[str] = Field(None, description="Duration for flexible dates (weekend, week, custom)")
    
    target_price: Optional[float] = None
    budget: Optional[float] = None
    currency: str = Field(default="TRY", max_length=3)
    adults: int = Field(default=1, ge=1)
    children: int = Field(default=0, ge=0)
    travelers_count: int = Field(default=1, ge=1)
    preferences: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class WishlistResponse(WishlistBase):
    """Model for wishlist response with database ID and itinerary."""
    id: Optional[str] = Field(None, alias="_id", description="MongoDB document ID")
    itinerary_items: List[ItineraryItem] = Field(default_factory=list)
    trip_details: Optional[Dict[str, Any]] = Field(None, description="Zengin seyahat detay verisi (scraper sonrası)")
    current_price: Optional[float] = Field(None, description="En güncel bulunan fiyat")
    scrape_status: Optional[str] = Field(None, description="Tarama durumu: pending/ready/no_data/error")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_scraped_at: Optional[datetime] = Field(None)

    class Config:
        populate_by_name = True
        extra = 'ignore'
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat()
        }


class WishlistInDB(WishlistBase):
    """Internal model for database operations."""
    itinerary_items: List[ItineraryItem] = Field(default_factory=list)
    trip_details: Optional[TripDetail] = Field(None, description="Zengin seyahat detay verisi")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_scraped_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "image_url": self.image_url,
            "trip_name": self.trip_name,
            "origin": self.origin,
            "destination": self.destination,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "date_type": self.date_type.value,
            "target_price": self.target_price,
            "budget": self.budget,
            "currency": self.currency,
            "is_active": self.is_active,
            "status": self.status.value,
            "travelers_count": self.travelers_count,
            "adults": self.adults,
            "children": self.children,
            "preferences": self.preferences,
            "notes": self.notes,
            "itinerary_items": [item.model_dump() for item in self.itinerary_items],
            "trip_details": self.trip_details.model_dump() if self.trip_details else None,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_scraped_at": self.last_scraped_at
        }


# ============================================================================
#                         STORY MODELS — Hikayeler
# ============================================================================

class StoryCreate(BaseModel):
    """Yeni story oluşturma modeli."""
    country_code: str = Field(..., description="ISO 2-harf ülke kodu (FR, TR vb.)")
    country_name: str = Field(..., description="Türkçe ülke adı")
    media_url: str    = Field(..., description="Base64 data URL (image/jpeg;base64,...)")
    caption: Optional[str] = Field(None, max_length=300, description="Açıklama (opsiyonel)")


class StoryResponse(BaseModel):
    """Story response modeli."""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    country_code: str
    country_name: str
    media_url: str
    caption: Optional[str] = None
    created_at: datetime

    class Config:
        populate_by_name = True
        extra = 'ignore'
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
        }


# ============================================================================
#                         API RESPONSE MODELS
# ============================================================================

class PlannerResponse(BaseModel):
    """Complete planner response for the Smart Planner UI."""
    id: str
    trip_name: str
    origin: str
    destination: str
    start_date: str
    end_date: str
    target_price: float
    current_price: Optional[float] = None
    currency: str
    is_active: bool
    status: str
    travelers_count: int = 1

    # Categorized itinerary items
    flights: List[Dict[str, Any]] = Field(default_factory=list)
    hotels: List[Dict[str, Any]] = Field(default_factory=list)
    activities: List[Dict[str, Any]] = Field(default_factory=list)

    # Price summary
    price_summary: Dict[str, Any] = Field(default_factory=dict)

    # AI-generated plan (from planner.py)
    ai_suggestions: Optional[Dict[str, Any]] = None

    # Rich trip detail (populated after scraper runs)
    trip_details: Optional[Dict[str, Any]] = Field(
        None, description="Zengin seyahat detay verisi (scraper sonrası oluşturulur)"
    )

    # Metadata
    last_scraped_at: Optional[str] = None
    created_at: str


class PlanDetailsResponse(BaseModel):
    """
    GET /api/v1/plans/{plan_id}/details için tam seyahat detay paketi.
    Scraper verisi + AI gün planlarını tek seferde döner.
    """
    plan_id: str
    trip_name: Optional[str] = None
    origin: str
    destination: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    image_url: Optional[str] = None

    # Kullanıcının girdiği hedef bütçe (scraper bağımsız)
    budget: Optional[float] = None

    # Trip detail fields (scraper sonrası)
    trip_type: str = "bireysel"
    nights: int = 0
    outbound_flight: Optional[Dict[str, Any]] = None
    return_flight: Optional[Dict[str, Any]] = None
    hotel_options: List[Dict[str, Any]] = Field(default_factory=list)
    selected_hotel_index: int = 0
    budget_summary: Optional[Dict[str, Any]] = None

    # AI gün planları (Gemini placeholder)
    ai_day_plans: List[Dict[str, Any]] = Field(default_factory=list)

    # Durum bilgisi
    scrape_status: str = Field(
        default="pending",
        description="Scraper durumu: 'ready' | 'pending' | 'error' | 'no_data'"
    )
    last_scraped_at: Optional[str] = None


class BudgetCalculateResponse(BaseModel):
    """
    GET /api/v1/plans/{plan_id}/budget?hotel_index=N
    Otel seçimi değiştiğinde anlık bütçe hesaplama döner.
    """
    plan_id: str
    selected_hotel_index: int
    hotel_name: Optional[str] = None
    flight_cost: float = 0.0
    hotel_cost: float = 0.0
    total_cost: float = 0.0
    currency: str = "TRY"
    label: str = "en-iyi-teklif"
    label_text: str = "En İyi Teklif"
    label_icon: str = "🎯"
    savings: Optional[float] = None
    overage: Optional[float] = None
    usage_percent: Optional[float] = None
    target_budget: Optional[float] = None


class ScrapeResponse(BaseModel):
    """Response model for scrape trigger endpoint."""
    success: bool
    wishlist_id: str
    current_price: Optional[float] = None
    provider: str
    message: str
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PriceHistoryBase(BaseModel):
    """Base model for price history tracking."""
    wishlist_id: str
    current_price: float = Field(..., gt=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    provider: str


class PriceHistoryInDB(PriceHistoryBase):
    """Internal model for database operations."""
    
    def to_dict(self) -> dict:
        return {
            "wishlist_id": self.wishlist_id,
            "current_price": self.current_price,
            "timestamp": self.timestamp,
            "provider": self.provider
        }


# ============================================================================
#                    AUTHENTICATION MODELS
# ============================================================================

class UserRegister(BaseModel):
    """Model for user registration."""
    username: str = Field(..., min_length=3, max_length=50, description="Username")
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=6, description="User password")


class UserLogin(BaseModel):
    """Model for user login."""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="User password")


class TokenResponse(BaseModel):
    """Response model for authentication tokens."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer")
    user_id: str = Field(..., description="User ID")
    username: str = Field(..., description="Username")
    email: str = Field(..., description="User email")
    avatar_url: Optional[str] = Field(None, description="Profile picture URL")
    email_verified: bool = Field(default=True, description="Email doğrulama durumu")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


class ResendVerificationRequest(BaseModel):
    email: EmailStr

