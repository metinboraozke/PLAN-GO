"""
AI Planner module for SITA Smart Planner.
Prepares for Gemini/GPT-4o integration for intelligent trip planning.
"""
from datetime import datetime, date
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field


@dataclass
class TripPlanRequest:
    """Request model for AI trip planning."""
    origin: str
    destination: str
    start_date: str
    end_date: str
    budget: float
    currency: str = "TRY"
    travelers_count: int = 1
    preferences: Dict[str, Any] = field(default_factory=dict)
    # Preferences can include: travel_style, interests, accommodation_type, etc.


@dataclass
class TripPlanResponse:
    """Response model for AI-generated trip plan."""
    success: bool
    plan_id: Optional[str] = None
    destination: Optional[str] = None
    summary: Optional[str] = None
    
    # Suggested itinerary
    suggested_flights: List[Dict[str, Any]] = field(default_factory=list)
    suggested_hotels: List[Dict[str, Any]] = field(default_factory=list)
    suggested_activities: List[Dict[str, Any]] = field(default_factory=list)
    
    # Budget breakdown
    estimated_total: Optional[float] = None
    budget_breakdown: Dict[str, float] = field(default_factory=dict)
    
    # AI insights
    travel_tips: List[str] = field(default_factory=list)
    best_time_to_visit: Optional[str] = None
    local_insights: List[str] = field(default_factory=list)
    
    # Meta
    generated_at: datetime = field(default_factory=datetime.utcnow)
    ai_provider: Optional[str] = None  # "gemini" or "gpt4o"
    error_message: Optional[str] = None


class AIPlanner:
    """
    AI-powered trip planner.
    
    This class will integrate with Gemini or GPT-4o API
    to generate intelligent travel plans based on user preferences.
    
    Current Status: SKELETON - Returns null/empty plans
    Future: Full AI integration with real-time suggestions
    """
    
    def __init__(self, api_key: Optional[str] = None, provider: str = "gemini"):
        """
        Initialize the AI Planner.
        
        Args:
            api_key: API key for the AI service (Gemini/OpenAI)
            provider: AI provider to use ("gemini" or "gpt4o")
        """
        self.api_key = api_key
        self.provider = provider
        self._is_configured = api_key is not None
    
    async def generate_trip_plan(
        self,
        request: TripPlanRequest
    ) -> TripPlanResponse:
        """
        Generates an AI-powered trip plan.
        
        This is a SKELETON implementation that returns a null plan.
        Actual AI integration will be implemented in future versions.
        
        Args:
            request: Trip planning request with destination, dates, and budget.
            
        Returns:
            TripPlanResponse with null/empty data (skeleton).
        """
        print(f"🤖 AI Planner çağrıldı: {request.origin} → {request.destination}")
        print(f"   Tarihler: {request.start_date} - {request.end_date}")
        print(f"   Bütçe: {request.budget} {request.currency}")
        
        # SKELETON: Return empty plan
        # TODO: Implement actual AI integration
        # 
        # Future implementation will:
        # 1. Call Gemini/GPT-4o API with travel context
        # 2. Generate personalized itinerary suggestions
        # 3. Provide local insights and travel tips
        # 4. Optimize for budget and preferences
        
        return TripPlanResponse(
            success=False,
            destination=request.destination,
            summary=None,
            suggested_flights=[],
            suggested_hotels=[],
            suggested_activities=[],
            estimated_total=None,
            budget_breakdown={},
            travel_tips=[],
            best_time_to_visit=None,
            local_insights=[],
            ai_provider=self.provider,
            error_message="AI entegrasyonu henüz aktif değil. Yakında Gemini/GPT-4o desteği eklenecek."
        )
    
    async def get_destination_insights(
        self,
        destination: str,
        travel_dates: Optional[tuple] = None
    ) -> Dict[str, Any]:
        """
        Gets AI-generated insights about a destination.
        
        SKELETON: Returns null data.
        
        Args:
            destination: Destination city/country
            travel_dates: Optional tuple of (start_date, end_date)
            
        Returns:
            Dictionary with destination insights (empty in skeleton).
        """
        print(f"🔍 Destinasyon analizi istendi: {destination}")
        
        # SKELETON: Return empty insights
        return {
            "destination": destination,
            "insights": None,
            "weather_forecast": None,
            "local_events": [],
            "price_trends": None,
            "safety_info": None,
            "visa_requirements": None,
            "error": "AI entegrasyonu henüz aktif değil"
        }
    
    async def optimize_budget(
        self,
        wishlist_id: str,
        current_selections: List[Dict],
        target_budget: float
    ) -> Dict[str, Any]:
        """
        Optimizes trip selections to fit within budget.
        
        SKELETON: Returns null optimization.
        
        Args:
            wishlist_id: ID of the wishlist to optimize
            current_selections: Current flight/hotel/activity selections
            target_budget: Target budget to optimize for
            
        Returns:
            Optimization suggestions (empty in skeleton).
        """
        print(f"💰 Bütçe optimizasyonu istendi: {target_budget} TRY hedef")
        
        # SKELETON: Return empty optimization
        return {
            "wishlist_id": wishlist_id,
            "optimized": False,
            "suggestions": [],
            "potential_savings": None,
            "alternative_dates": [],
            "error": "AI entegrasyonu henüz aktif değil"
        }
    
    async def generate_daily_itinerary(
        self,
        destination: str,
        num_days: int,
        interests: List[str] = None
    ) -> Dict[str, Any]:
        """
        Generates a day-by-day itinerary for a destination.
        
        SKELETON: Returns null itinerary.
        
        Args:
            destination: Destination city
            num_days: Number of days for the trip
            interests: List of user interests (e.g., ["history", "food", "nature"])
            
        Returns:
            Daily itinerary (empty in skeleton).
        """
        print(f"📅 Günlük program oluşturma: {destination}, {num_days} gün")
        
        # SKELETON: Return empty itinerary
        return {
            "destination": destination,
            "num_days": num_days,
            "daily_plans": [],
            "highlights": [],
            "error": "AI entegrasyonu henüz aktif değil"
        }


# ============================================================================
#   AI GÜN PLANLARI — Gemini Entegrasyonuna Hazır Placeholder
# ============================================================================

# Destinasyona özel gün planı şablonları
_DAY_PLAN_TEMPLATES: Dict[str, List[Dict[str, Any]]] = {
    "paris": [
        {"gun": 1, "baslik": "Gizli Montmartre Kafeleri",   "icon": "☕", "desc": "Yerel sanatçıların uğrak noktaları, Sacré-Cœur etekleri",
         "food": "Croque-Monsieur", "food_desc": "Fransız kafelerin vazgeçilmez sıcak sandviçi, içi erimiş beyaz peynirle dolu"},
        {"gun": 2, "baslik": "Marais Sokak Pazarları",       "icon": "🛍️", "desc": "Antika, vintage ve yerel tasarımcı atölyeleri",
         "food": "Falafel du Marais", "food_desc": "L'As du Fallafel'in meşhur sokak yemeği, tahin sosuyla servis edilir"},
        {"gun": 3, "baslik": "Seine Nehri Akşam Yürüyüşü",  "icon": "🌅", "desc": "Gün batımında köprü manzaraları ve street food",
         "food": "Vin chaud & Crêpe", "food_desc": "Nehir kenarı sokak satıcılarından sıcak şarap ve taze krep"},
        {"gun": 4, "baslik": "Yerel Patisserie Turu",        "icon": "🥐", "desc": "Turistlerin bilmediği mahalle fırınları",
         "food": "Pain au chocolat", "food_desc": "Mahalle fırınından taze çıkmış çikolatalı kruvasan, sabahın erken saatinde en iyi"},
    ],
    "roma": [
        {"gun": 1, "baslik": "Trastevere Sabah Pazarı",     "icon": "🍋", "desc": "Yerel İtalyanların alışveriş yaptığı antika pazar",
         "food": "Supplì al telefono", "food_desc": "Kızarmış pirinç topları, kesilince içinden uzayan erimiş mozzarella ile"},
        {"gun": 2, "baslik": "Gizli Terrazze Manzaraları",  "icon": "🏛️", "desc": "Kalabalıktan uzak panoramik teras noktaları",
         "food": "Cacio e Pepe", "food_desc": "Sadece peynir ve karabiberle yapılan Roma'nın ikonik makarnası"},
        {"gun": 3, "baslik": "Aperitivo Saati Turu",         "icon": "🍷", "desc": "Yerel barlar ve ücretsiz aperitivo geleneği",
         "food": "Aperol Spritz", "food_desc": "Aperitivo saatinin vazgeçilmez turuncu kokteyli, atıştırmalıklarla birlikte"},
        {"gun": 4, "baslik": "Tivoli Günü Gezisi",           "icon": "🌿", "desc": "Villa d'Este bahçeleri ve şelaleleri",
         "food": "Gelato artigianale", "food_desc": "Tivoli yolundaki küçük ustalık dondurma dükkanlarından el yapımı gelato"},
    ],
    "rome": [
        {"gun": 1, "baslik": "Trastevere Morning Market",   "icon": "🍋", "desc": "Local antique market by the river",
         "food": "Supplì al telefono", "food_desc": "Fried rice balls with melted mozzarella stretching from the center"},
        {"gun": 2, "baslik": "Hidden Terrace Views",         "icon": "🏛️", "desc": "Panoramic spots away from the crowds",
         "food": "Cacio e Pepe", "food_desc": "Rome's iconic pasta made with just cheese and black pepper"},
        {"gun": 3, "baslik": "Aperitivo Bar Tour",           "icon": "🍷", "desc": "Local bars with free aperitivo tradition",
         "food": "Aperol Spritz", "food_desc": "The iconic orange aperitivo cocktail, served with complimentary snacks"},
        {"gun": 4, "baslik": "Tivoli Day Trip",              "icon": "🌿", "desc": "Villa d'Este gardens and waterfalls",
         "food": "Gelato artigianale", "food_desc": "Artisan ice cream from small craft shops along the Tivoli road"},
    ],
    "barcelona": [
        {"gun": 1, "baslik": "El Born Gizli Barlar",         "icon": "🍹", "desc": "Orta Çağ mahallesi ve cocktail barları",
         "food": "Patatas bravas", "food_desc": "Çıtır patates kızartması, acı domates ve aioli soslarıyla servis edilir"},
        {"gun": 2, "baslik": "La Boqueria Dışı Pazar",       "icon": "🥘", "desc": "Yerel pazarlar ve tapas kültürü",
         "food": "Pan con tomate", "food_desc": "Domates sürülmüş ekmek, zeytinyağı ve tuz — Katalonya mutfağının temel taşı"},
        {"gun": 3, "baslik": "Gracia Mahallesi Keşfi",       "icon": "🎨", "desc": "Bohemyan atmosfer ve sokak sanatı",
         "food": "Croquetas de jamón", "food_desc": "İçi kremsi jamón serrano dolgulu çıtır kroket, tapas barların favorisi"},
        {"gun": 4, "baslik": "Montjuïc Gün Batımı",         "icon": "🌇", "desc": "Kaleye yürüyüş ve şehir panoraması",
         "food": "Sangria de Cava", "food_desc": "Katalonya köpüklü şarabıyla yapılan ev yapımı sangria, gün batımında mükemmel"},
    ],
    "amsterdam": [
        {"gun": 1, "baslik": "Jordaan Gizli Kafeler",        "icon": "☕", "desc": "Kanal kenarı eski fabrika dönüşümü kafeler",
         "food": "Stroopwafel", "food_desc": "İki wafel arasına karamel doldurulmuş Hollanda'nın simge atıştırmalığı"},
        {"gun": 2, "baslik": "Yerel Pazar Turu",             "icon": "🧀", "desc": "Albert Cuyp ve peynir pazarı",
         "food": "Gouda vers", "food_desc": "Pazardan taze kesilen genç Gouda peyniri, hardal ile"},
        {"gun": 3, "baslik": "Bisiklet ile Keşif",           "icon": "🚲", "desc": "Şehir dışı köy ve yel değirmeni turu",
         "food": "Haring met uitjes", "food_desc": "Taze çiğ ringa balığı, soğan ve turşuyla — Hollanda'nın en bilinen sokak yemeği"},
        {"gun": 4, "baslik": "Gece Canal Cruise",            "icon": "🛶", "desc": "Işıklı kanal turu ve yerel restoranlar",
         "food": "Bitterballen", "food_desc": "Çıtır kızarmış et kroket topları, bira ile servis edilen klasik bar atıştırmalığı"},
    ],
    "london": [
        {"gun": 1, "baslik": "Brick Lane Sokak Yemeği",     "icon": "🍛", "desc": "Çok kültürlü East End'in gizli lezzetleri",
         "food": "Chicken tikka masala", "food_desc": "İngiltere'nin gayri resmi milli yemeği, Brick Lane'in efsane Hint restoranlarından"},
        {"gun": 2, "baslik": "Columbia Çiçek Pazarı",        "icon": "🌸", "desc": "Pazar sabahı rengarenk çiçek atmosferi",
         "food": "Full English breakfast", "food_desc": "Bacon, yumurta, sosis, fasulye ve mantar — İngilizlerin pazar sabahı ritüeli"},
        {"gun": 3, "baslik": "Notting Hill Antikacıları",    "icon": "🎪", "desc": "Portobello Road vintage ve antika turu",
         "food": "Scotch egg", "food_desc": "Sosis köftesiyle sarılı haşlanmış yumurta, Portobello Market'in klasik sokak yemeği"},
        {"gun": 4, "baslik": "Thames Güney Yakası",          "icon": "🎭", "desc": "Borough Market ve sahil yürüyüşü",
         "food": "Borough Market pie", "food_desc": "Borough Market'ten taze el yapımı börek, İngiltere'nin en iyi gıda pazarından"},
    ],
    "dubai": [
        {"gun": 1, "baslik": "Al-Fahidi Tarihi Mahalle",    "icon": "🕌", "desc": "Eski Dubai ve geleneksel çarşı",
         "food": "Al Harees", "food_desc": "Buğday ve etle yapılan geleneksel Emirati püresi, yüzyıllık bir lezzet"},
        {"gun": 2, "baslik": "Çöl Safari",                   "icon": "🐪", "desc": "Gün batımında çöl deneyimi ve kamp ateşi",
         "food": "Mezze tabağı", "food_desc": "Hummus, babagannuş ve taze ekmekle Orta Doğu mezeleri, çöl kampında servis"},
        {"gun": 3, "baslik": "Gizli Plaj Noktaları",        "icon": "🏖️", "desc": "Kalabalıktan uzak yerel plajlar",
         "food": "Fresh mango juice", "food_desc": "Taze sıkılmış mango suyu, Dubai'nin sokak dükkanlarından serinletici bir mola"},
        {"gun": 4, "baslik": "Spice & Gold Çarşısı",        "icon": "🌶️", "desc": "Geleneksel baharatlar ve altın çarşısı",
         "food": "Shawarma al-fahem", "food_desc": "Odun ateşinde pişirilen tavukla yapılan Arap usulü dürüm, Deira sokaklarından"},
    ],
    "antalya": [
        {"gun": 1, "baslik": "Kaleiçi Gizli Kafeler",       "icon": "☕", "desc": "Tarihi kent içi ve antik atmosfer",
         "food": "Piyaz", "food_desc": "Beyaz fasulye, tahini ve haşlanmış yumurtayla Antalya'ya özgü meşhur salata"},
        {"gun": 2, "baslik": "Düden Şelalesi Yürüyüşü",     "icon": "💧", "desc": "Sahile dökülen şelale ve piknik alanı",
         "food": "Taze portakal suyu", "food_desc": "Yol üzeri tezgahlardan taze sıkılmış, Antalya portakalının eşsiz tadı"},
        {"gun": 3, "baslik": "Yerel Pazar Turu",             "icon": "🍊", "desc": "Portakal ve bölgesel ürünler",
         "food": "Şiş köfte", "food_desc": "Antalya usulü baharatlı ızgara köfte, közlenmiş biber ve lavaş ekmekle"},
        {"gun": 4, "baslik": "Aspendos Antik Tiyatro",      "icon": "🏛️", "desc": "2000 yıllık Roma tiyatrosunda gün batımı",
         "food": "Kabak çiçeği dolması", "food_desc": "Zeytinyağlı pirinç dolgulu kabak çiçeği, Akdeniz mutfağının narin lezzeti"},
    ],
    "istanbul": [
        {"gun": 1, "baslik": "Balat Sokakları",              "icon": "🎨", "desc": "Renkli evler, antika dükkanlar ve sokak kafeleri",
         "food": "Balat böreği", "food_desc": "Balat'ın eski Rum fırınlarından su böreği, ıspanak ve beyaz peynirle"},
        {"gun": 2, "baslik": "Boğaz Sabah Balıkçısı",       "icon": "🐟", "desc": "Kadıköy balık hali ve pazar gezisi",
         "food": "Midye dolma", "food_desc": "Baharatlı pilavla doldurulmuş midye, limon sıkılarak Boğaz kenarında yenir"},
        {"gun": 3, "baslik": "Kapalıçarşı Dışı Çarşı",     "icon": "🛺", "desc": "Mısır Çarşısı ve çevre dar sokaklar",
         "food": "Mısır Çarşısı macunu", "food_desc": "Baharat tüccarlarından taze öğütülmüş baharat macunu, rengarenk"},
        {"gun": 4, "baslik": "Adalar Günübirlik",            "icon": "⛵", "desc": "Büyükada'da faytonla doğa turu",
         "food": "Balık ekmek", "food_desc": "Boğaz vapurları iskele kenarında ızgara balık sandviç, soğan ve limonla"},
    ],
    "new york": [
        {"gun": 1, "baslik": "Brooklyn Cafe Turu",           "icon": "☕", "desc": "Williamsburg'un gizli specialty coffee noktaları",
         "food": "Bagel with lox", "food_desc": "Somon ve krem peynirle doldurulmuş New York simidi, sabahın vazgeçilmezi"},
        {"gun": 2, "baslik": "Chelsea Market & Çevresi",     "icon": "🥪", "desc": "High Line ve market lezzetleri",
         "food": "Lobster roll", "food_desc": "Chelsea Market'ten taze ıstakoz doldurulmuş brioche sandviç"},
        {"gun": 3, "baslik": "Queens Sokak Yemeği",          "icon": "🍜", "desc": "Dünya mutfaklarının buluşma noktası",
         "food": "Queens hand-pulled noodles", "food_desc": "Flushing'in Çin restoranlarından el çekme erişte, gerçek Sichuan baharatlı"},
        {"gun": 4, "baslik": "Brooklyn Bridge Sabahı",       "icon": "🌁", "desc": "Erken saatte köprü ve şehir manzarası",
         "food": "NYC pizza slice", "food_desc": "Köprü altındaki fırından büyük boy New York dilim pizzası, katlanarak yenir"},
    ],
    "bangkok": [
        {"gun": 1, "baslik": "Gizli Nehir Kanalları",        "icon": "⛵", "desc": "Yüzen pazar ve kanal köyleri",
         "food": "Pad Thai", "food_desc": "Yüzen pazarın teknelerinden taze piştachio fıstığı ve limonla Pad Thai"},
        {"gun": 2, "baslik": "Chatuchak Hafta Sonu Pazarı",  "icon": "🎪", "desc": "8000 stand, antika ve yerel el sanatları",
         "food": "Mango sticky rice", "food_desc": "Hindistan cevizi sütü soslu yapışkan pirinç ve taze mango, Tayland'ın şeker gibi tatlısı"},
        {"gun": 3, "baslik": "Yemek Sokağı Turu",            "icon": "🍲", "desc": "Chinatown ve gece yemek sokakları",
         "food": "Tom yum goong", "food_desc": "Limon otu ve kaffir limonu yapraklı acı-ekşi karides çorbası"},
        {"gun": 4, "baslik": "Tapınak Bisiklet Turu",        "icon": "🛕", "desc": "Kalabalıktan uzak antik tapınaklar",
         "food": "Som tam", "food_desc": "Havanda dövülen yeşil papaya salatası, acı biber ve kurutulmuş karidesle"},
    ],
}

# Destinasyon bilinmiyorsa kullanılacak genel şablon
_GENERIC_DAY_PLANS: List[Dict[str, Any]] = [
    {"gun": 1, "baslik": "Tarihi Merkez Keşfi",             "icon": "🗺️", "desc": "Şehrin kalbi: tarihi meydanlar ve eski mahalleler",
     "food": "Yerel çorba", "food_desc": "Sabah pazarının yanında sıcak bir kase yerel çorba, günün en iyi başlangıcı"},
    {"gun": 2, "baslik": "Yerel Pazar Turu",                 "icon": "🥬", "desc": "Taze ürünler, yerel lezzetler ve el sanatları",
     "food": "Pazar böreği", "food_desc": "Pazar tezgahından taze yapılmış peynirli börek veya yerel hamur tatlısı"},
    {"gun": 3, "baslik": "Gizli Manzara Noktaları",         "icon": "📸", "desc": "Fotoğraf tutkunlarının bildiği gizli noktalar",
     "food": "Sokak tatlısı", "food_desc": "Yürüyüş molasında yerel sokak satıcısından mevsim meyvesi ya da tatlı atıştırmalık"},
    {"gun": 4, "baslik": "Yerel Mutfak Deneyimi",           "icon": "🍽️", "desc": "Turistlerin gitmediği yerel restoranlar",
     "food": "Günün tabağı", "food_desc": "Küçük aile restoranının günlük özel menüsü, en taze yerel malzemelerle"},
]


def generate_ai_day_plans(
    destination: str,
    nights: int = 4,
    origin: str = "IST"
) -> List[Dict[str, Any]]:
    """
    Hedef şehre göre AI gün planı listesi döner.
    Şimdilik placeholder — Gemini/GPT-4o entegrasyonuna hazır yapı.

    Args:
        destination: Hedef şehir (ör. "Paris", "CDG", "Barcelona")
        nights: Konaklama gece sayısı (max 4 gün döner)
        origin: Kalkış şehri (ileride kişiselleştirme için)

    Returns:
        List[Dict]: [{gun, baslik, icon, desc}] formatında gün planları
    """
    dest_lower = destination.lower().strip()

    # IATA kodu → şehir adına çevir (kısmi)
    iata_to_city = {
        "cdg": "paris", "ory": "paris",
        "fco": "rome",  "fcm": "rome",
        "bcn": "barcelona",
        "ams": "amsterdam",
        "lhr": "london", "lgw": "london",
        "dxb": "dubai",
        "ayt": "antalya",
        "ist": "istanbul", "saw": "istanbul",
        "jfk": "new york", "lax": "los angeles",
        "bkk": "bangkok",
    }
    dest_lower = iata_to_city.get(dest_lower, dest_lower)

    # Destinasyon template'ini bul
    templates: Optional[List[Dict[str, Any]]] = None
    for key, plans in _DAY_PLAN_TEMPLATES.items():
        if key in dest_lower or dest_lower.startswith(key):
            templates = plans
            break

    if not templates:
        templates = _GENERIC_DAY_PLANS

    count = min(max(nights, 1), 4)
    return [dict(item) for item in templates[:count]]


# ============== Singleton Instance ==============

_planner_instance: Optional[AIPlanner] = None


def get_ai_planner(api_key: Optional[str] = None) -> AIPlanner:
    """
    Returns a singleton AI planner instance.
    
    Args:
        api_key: Optional API key for AI service
        
    Returns:
        AIPlanner instance
    """
    global _planner_instance
    if _planner_instance is None:
        _planner_instance = AIPlanner(api_key=api_key)
    return _planner_instance


async def generate_null_plan(
    origin: str,
    destination: str,
    start_date: str,
    end_date: str,
    budget: float
) -> TripPlanResponse:
    """
    Convenience function to generate a null trip plan.
    
    This is the main entry point for future AI integration.
    Currently returns empty/null data.
    
    Args:
        origin: Departure city/airport
        destination: Destination city
        start_date: Trip start date (YYYY-MM-DD)
        end_date: Trip end date (YYYY-MM-DD)
        budget: Target budget
        
    Returns:
        TripPlanResponse with null data (skeleton)
    """
    planner = get_ai_planner()
    request = TripPlanRequest(
        origin=origin,
        destination=destination,
        start_date=start_date,
        end_date=end_date,
        budget=budget
    )
    return await planner.generate_trip_plan(request)


# ============== Future Integration Notes ==============
"""
GEMINI INTEGRATION (Future):
----------------------------
from google import generativeai as genai

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-pro')

prompt = f'''
Sen bir profesyonel seyahat planlayıcısısın.
{origin} -> {destination} için {start_date} - {end_date} tarihleri arasında
{budget} {currency} bütçeyle bir seyahat planı oluştur.

Şunları içersin:
- En uygun uçuş önerileri
- Otel tavsiyeleri
- Günlük aktivite programı
- Yerel ipuçları
- Bütçe dağılımı
'''

response = model.generate_content(prompt)


GPT-4O INTEGRATION (Future):
----------------------------
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

response = await client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "Sen profesyonel bir seyahat planlayıcısısın."},
        {"role": "user", "content": prompt}
    ]
)
"""
