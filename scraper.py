"""
Web scraper module using Playwright with advanced stealth mode.
SITA Smart Planner - Flight & Hotel price scraping engine.

Features:
- playwright-stealth integration for anti-bot detection
- Random User-Agent rotation
- Human-like scrolling behavior
- Skyscanner & Trivago compatible
"""
import re
import random
import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

from playwright.async_api import async_playwright, Page, Browser, BrowserContext, TimeoutError as PlaywrightTimeout

# playwright-stealth import - bot algılamayı atlatmak için
try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False
    print("[WARNING] playwright-stealth yuklu degil. Yuklemek icin: pip install playwright-stealth")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("SITA.Scraper")


# ============================================================================
#                       RANDOM USER-AGENT HAVUZU
# ============================================================================

USER_AGENTS = [
    # Chrome Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Chrome macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    # Firefox Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    # Firefox macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
    # Edge Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
    # Safari macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
]


def get_random_user_agent() -> str:
    """Returns a random user agent from the pool."""
    return random.choice(USER_AGENTS)


# ============================================================================
#                       İNSANSI KAYIRMA (HUMAN SCROLLING)
# ============================================================================

class HumanScroller:
    """
    İnsansı kaydırma davranışı simülasyonu.
    Bot algılamayı atlatmak için rastgele hız ve duraklamalar kullanır.
    """
    
    def __init__(self, page: Page):
        self.page = page
    
    async def scroll_down_slowly(self, distance: int = 500, steps: int = 5) -> None:
        """
        Sayfayı yavaşça aşağı kaydırır (insan gibi).
        
        Args:
            distance: Toplam kaydırma mesafesi (piksel)
            steps: Kaç adımda kaydırılacağı
        """
        step_distance = distance // steps
        
        for _ in range(steps):
            # Rastgele mesafe ve gecikme
            actual_distance = step_distance + random.randint(-20, 20)
            delay = random.uniform(0.1, 0.3)  # 100-300ms arası
            
            await self.page.mouse.wheel(0, actual_distance)
            await asyncio.sleep(delay)
    
    async def scroll_to_element(self, selector: str) -> bool:
        """
        Belirli bir elemente doğru kaydırır.
        """
        try:
            element = await self.page.query_selector(selector)
            if element:
                await element.scroll_into_view_if_needed()
                await asyncio.sleep(random.uniform(0.3, 0.7))
                return True
        except Exception:
            pass
        return False
    
    async def random_scroll_pattern(self) -> None:
        """
        Rastgele kaydırma deseni - sayfayı keşfeder gibi.
        Bot algılamayı zorlaştırır.
        """
        patterns = [
            (300, 0.5),   # Aşağı kaydır, bekle
            (-100, 0.3),  # Biraz yukarı
            (200, 0.4),   # Tekrar aşağı
            (0, 0.8),     # Dur ve oku
            (400, 0.6),   # Daha fazla aşağı
        ]
        
        for scroll_y, wait_time in patterns:
            await self.page.mouse.wheel(0, scroll_y)
            await asyncio.sleep(wait_time + random.uniform(-0.2, 0.2))
    
    async def simulate_reading(self, duration: float = 2.0) -> None:
        """
        Okuma davranışı simülasyonu - rastgele fare hareketleri.
        """
        viewport = self.page.viewport_size
        if not viewport:
            return
            
        for _ in range(random.randint(2, 5)):
            x = random.randint(100, viewport['width'] - 100)
            y = random.randint(100, viewport['height'] - 100)
            
            await self.page.mouse.move(x, y)
            await asyncio.sleep(random.uniform(0.2, 0.5))
        
        await asyncio.sleep(duration)


# ============================================================================
#                           DATA CLASSES
# ============================================================================

@dataclass
class FlightResult:
    """Data class for scraped flight information."""
    price: Optional[float] = None
    currency: str = "TRY"
    provider: str = "unknown"
    airline: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    duration: Optional[str] = None
    stops: int = 0
    success: bool = False
    error_message: Optional[str] = None
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class HotelResult:
    """Data class for scraped hotel information."""
    price: Optional[float] = None
    currency: str = "TRY"
    provider: str = "unknown"
    hotel_name: Optional[str] = None
    rating: Optional[float] = None
    stars: Optional[int] = None
    location: Optional[str] = None
    image_url: Optional[str] = None
    success: bool = False
    error_message: Optional[str] = None
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScrapeResult:
    """Complete scrape result with multiple options."""
    origin: str
    destination: str
    date: str
    flights: List[FlightResult] = field(default_factory=list)
    hotels: List[HotelResult] = field(default_factory=list)
    lowest_price: Optional[float] = None
    provider: str = "unknown"
    success: bool = False
    error_message: Optional[str] = None
    scraped_at: datetime = field(default_factory=datetime.utcnow)


class PriceScraper:
    """
    Advanced web scraping engine with anti-bot detection bypass.
    Uses playwright-stealth + Random User-Agent + Human-like behavior.
    
    SITA Operasyon Merkezi - Fiyat Kazıma Motoru v2.0
    
    Desteklenen Providerlar:
    - Skyscanner (flights + hotels)
    - Trivago (hotels)
    - Enuygun (flights)
    - Pegasus (flights)
    - THY (flights - limited)
    """
    
    def __init__(self):
        self._browser: Optional[Browser] = None
        self._playwright = None
        self._current_user_agent: str = ""
    
    async def _initialize_browser(self) -> Browser:
        """
        Initializes and returns a stealth browser instance.
        Configures advanced anti-detection measures.
        """
        logger.info("🌐 Tarayıcı başlatılıyor (Advanced Stealth Mode)...")
        
        self._playwright = await async_playwright().start()
        
        # Random user agent seç
        self._current_user_agent = get_random_user_agent()
        logger.info(f"🎭 User-Agent: {self._current_user_agent[:50]}...")
        
        browser = await self._playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--window-size=1920,1080",
                "--start-maximized",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--ignore-certificate-errors",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                "--lang=tr-TR",
            ]
        )
        logger.info("✅ Tarayıcı hazır")
        return browser
    
    async def _create_stealth_page(self, browser: Browser) -> Page:
        """
        Creates a new page with advanced stealth configurations.
        Applies playwright-stealth if available + custom evasion scripts.
        """
        # Random viewport boyutları (küçük varyasyonlar)
        viewport_width = 1920 + random.randint(-100, 100)
        viewport_height = 1080 + random.randint(-50, 50)
        
        context = await browser.new_context(
            viewport={"width": viewport_width, "height": viewport_height},
            user_agent=self._current_user_agent,
            locale="tr-TR",
            timezone_id="Europe/Istanbul",
            geolocation={"latitude": 41.0082, "longitude": 28.9784},
            permissions=["geolocation"],
            java_script_enabled=True,
            accept_downloads=False,
            color_scheme="light",
            reduced_motion="no-preference",
        )
        
        # Add extra HTTP headers (daha gerçekçi)
        await context.set_extra_http_headers({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
        })
        
        page = await context.new_page()
        
        # Apply playwright-stealth if available
        if STEALTH_AVAILABLE:
            await stealth_async(page)
            logger.info("🔒 playwright-stealth uygulandı")
        else:
            # Fallback: Manual stealth scripts
            await self._apply_manual_stealth(page)
            logger.info("🔒 Manuel stealth scriptleri uygulandı")
        
        return page
    
    async def _apply_manual_stealth(self, page: Page) -> None:
        """
        Manual stealth evasion scripts for when playwright-stealth is not available.
        """
        await page.add_init_script("""
            // Override webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Override plugins to look like real browser
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const plugins = [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin' }
                    ];
                    plugins.item = (i) => plugins[i] || null;
                    plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
                    plugins.refresh = () => {};
                    return plugins;
                }
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['tr-TR', 'tr', 'en-US', 'en']
            });
            
            // Override platform
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32'
            });
            
            // Override hardwareConcurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8
            });
            
            // Override deviceMemory
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8
            });
            
            // Chrome specific properties
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Canvas fingerprint protection
            const originalGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, attributes) {
                const context = originalGetContext.call(this, type, attributes);
                if (type === '2d') {
                    const originalGetImageData = context.getImageData;
                    context.getImageData = function(x, y, w, h) {
                        const imageData = originalGetImageData.call(this, x, y, w, h);
                        // Add slight noise to prevent fingerprinting
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            imageData.data[i] = imageData.data[i] + (Math.random() * 2 - 1);
                        }
                        return imageData;
                    };
                }
                return context;
            };
            
            // WebGL fingerprint protection
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                return getParameter.call(this, parameter);
            };
        """)

    
    async def fetch_price(
        self, 
        origin: str, 
        destination: str, 
        travel_date: str = None,
        provider: str = "enuygun"
    ) -> ScrapeResult:
        """
        Fetches flight prices for a given route.
        
        Args:
            origin: Departure airport code (e.g., IST, SAW)
            destination: Arrival airport code (e.g., AYT, ADB)
            travel_date: Travel date in YYYY-MM-DD format
            provider: Price provider to scrape
            
        Returns:
            ScrapeResult containing scraped prices or error information.
        """
        browser: Optional[Browser] = None
        result = ScrapeResult(
            origin=origin,
            destination=destination,
            date=travel_date or "flexible",
            provider=provider
        )
        
        logger.info(f"🔍 Fiyat taraması başlatıldı: {origin} → {destination}")
        logger.info(f"📅 Tarih: {travel_date or 'Esnek'} | Provider: {provider}")
        
        try:
            browser = await self._initialize_browser()
            page = await self._create_stealth_page(browser)
            
            # Route to appropriate provider scraper
            if provider.lower() == "enuygun":
                result = await self._scrape_enuygun(page, origin, destination, travel_date)
            elif provider.lower() == "pegasus":
                result = await self._scrape_pegasus(page, origin, destination, travel_date)
            elif provider.lower() == "thy":
                result = await self._scrape_thy(page, origin, destination, travel_date)
            else:
                # Default: Try enuygun
                result = await self._scrape_enuygun(page, origin, destination, travel_date)
            
            if result.success:
                logger.info(f"✅ Tarama başarılı! En düşük fiyat: {result.lowest_price} {result.flights[0].currency if result.flights else 'TRY'}")
            else:
                logger.warning(f"⚠️ Fiyat bulunamadı: {result.error_message}")
                
        except PlaywrightTimeout as e:
            error_msg = f"Sayfa yükleme zaman aşımı: {str(e)}"
            logger.error(f"❌ {error_msg}")
            result.error_message = error_msg
            result.success = False
            
        except Exception as e:
            error_msg = f"Beklenmeyen hata: {str(e)}"
            logger.error(f"❌ {error_msg}")
            result.error_message = error_msg
            result.success = False
            
        finally:
            if browser:
                await browser.close()
                logger.info("🔌 Tarayıcı kapatıldı")
            if self._playwright:
                await self._playwright.stop()
                self._playwright = None
        
        return result
    
    async def _scrape_enuygun(
        self, 
        page: Page, 
        origin: str, 
        destination: str, 
        travel_date: str
    ) -> ScrapeResult:
        """
        Scrapes flight prices from Enuygun.com
        """
        result = ScrapeResult(
            origin=origin,
            destination=destination,
            date=travel_date or "flexible",
            provider="enuygun"
        )
        
        try:
            # Build search URL
            date_param = travel_date.replace("-", "") if travel_date else ""
            search_url = f"https://www.enuygun.com/ucak-bileti/arama/{origin.lower()}-{destination.lower()}/?gidis={date_param}&yetiskin=1&sinif=ekonomi"
            
            logger.info(f"📡 URL: {search_url}")
            
            # Navigate to search page
            await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            
            # Wait for page to stabilize
            await page.wait_for_timeout(3000)
            
            # Try to find price elements (multiple selectors for robustness)
            price_selectors = [
                "[data-testid='flight-card-price']",
                ".flight-price",
                ".price-amount",
                "[class*='price']",
                ".result-price"
            ]
            
            for selector in price_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=5000)
                    price_elements = await page.query_selector_all(selector)
                    
                    if price_elements:
                        for elem in price_elements[:5]:  # Get top 5 results
                            price_text = await elem.text_content()
                            price = self._extract_price(price_text)
                            
                            if price:
                                flight = FlightResult(
                                    price=price,
                                    currency="TRY",
                                    provider="enuygun",
                                    success=True
                                )
                                result.flights.append(flight)
                        
                        if result.flights:
                            result.success = True
                            result.lowest_price = min(f.price for f in result.flights if f.price)
                            return result
                            
                except PlaywrightTimeout:
                    continue
            
            # If no prices found with selectors, try to get page content
            content = await page.content()
            
            # Try regex to find prices in page content
            prices = re.findall(r'(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|₺)', content)
            
            if prices:
                for price_str in prices[:5]:
                    price = self._extract_price(price_str)
                    if price and price > 100:  # Filter out very low values
                        flight = FlightResult(
                            price=price,
                            currency="TRY",
                            provider="enuygun",
                            success=True
                        )
                        result.flights.append(flight)
                
                if result.flights:
                    result.success = True
                    result.lowest_price = min(f.price for f in result.flights if f.price)
                    return result
            
            result.error_message = "Fiyat elementi bulunamadı"
            logger.warning("⚠️ Sayfada fiyat elementi bulunamadı")
            
        except Exception as e:
            result.error_message = f"Enuygun scraping hatası: {str(e)}"
            logger.error(f"❌ {result.error_message}")
        
        return result
    
    async def _scrape_pegasus(
        self, 
        page: Page, 
        origin: str, 
        destination: str, 
        travel_date: str
    ) -> ScrapeResult:
        """
        Scrapes flight prices from Pegasus Airlines.
        Note: Pegasus has strong bot protection, this may not always work.
        """
        result = ScrapeResult(
            origin=origin,
            destination=destination,
            date=travel_date or "flexible",
            provider="pegasus"
        )
        
        try:
            # Pegasus search URL format
            search_url = f"https://www.flypgs.com/ucak-bileti/{origin.lower()}-{destination.lower()}"
            
            logger.info(f"📡 Pegasus URL: {search_url}")
            
            await page.goto(search_url, wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(5000)
            
            # Pegasus typically requires interaction, log warning
            logger.warning("⚠️ Pegasus bot koruması tespit edilebilir, manuel test gerekebilir")
            
            # Try to find prices
            content = await page.content()
            prices = re.findall(r'(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|TRY|₺)', content)
            
            if prices:
                for price_str in prices[:5]:
                    price = self._extract_price(price_str)
                    if price and price > 100:
                        flight = FlightResult(
                            price=price,
                            currency="TRY",
                            provider="pegasus",
                            airline="Pegasus",
                            success=True
                        )
                        result.flights.append(flight)
                
                if result.flights:
                    result.success = True
                    result.lowest_price = min(f.price for f in result.flights if f.price)
                    return result
            
            result.error_message = "Pegasus fiyatları çekilemedi (bot koruması olabilir)"
            
        except Exception as e:
            result.error_message = f"Pegasus scraping hatası: {str(e)}"
            logger.error(f"❌ {result.error_message}")
        
        return result
    
    async def _scrape_thy(
        self, 
        page: Page, 
        origin: str, 
        destination: str, 
        travel_date: str
    ) -> ScrapeResult:
        """
        Scrapes flight prices from Turkish Airlines.
        Note: THY has very strong bot protection.
        """
        result = ScrapeResult(
            origin=origin,
            destination=destination,
            date=travel_date or "flexible",
            provider="thy"
        )
        
        logger.warning("⚠️ THY güçlü bot korumasına sahip, fiyat çekimi başarısız olabilir")
        result.error_message = "THY bot koruması nedeniyle otomatik fiyat çekimi desteklenmiyor"
        
        return result
    
    def _extract_price(self, price_text: str) -> Optional[float]:
        """
        Extracts numeric price from text string.
        Handles Turkish number formatting (1.234,56 TL).
        """
        if not price_text:
            return None
        
        try:
            # Remove currency symbols and whitespace
            cleaned = price_text.replace("₺", "").replace("TL", "").replace("TRY", "").strip()
            
            # Handle Turkish number format: 1.234,56 -> 1234.56
            if "," in cleaned and "." in cleaned:
                # Has both: 1.234,56
                cleaned = cleaned.replace(".", "").replace(",", ".")
            elif "," in cleaned:
                # Only comma: 1234,56

                cleaned = cleaned.replace(",", ".")
            elif "." in cleaned:
                # Check if it's thousands separator or decimal
                parts = cleaned.split(".")
                if len(parts[-1]) == 3:
                    # It's a thousands separator: 1.234
                    cleaned = cleaned.replace(".", "")
            
            # Remove any remaining non-numeric characters except decimal point
            cleaned = re.sub(r'[^\d.]', '', cleaned)
            
            if cleaned:
                return float(cleaned)
                
        except (ValueError, AttributeError) as e:
            logger.debug(f"Fiyat parse hatası: {price_text} -> {e}")
        
        return None
    
    async def fetch_best_deal(
        self,
        origin: str,
        destination: str,
        travel_date: str = None,
        budget: float = None
    ) -> Dict[str, Any]:
        """
        Smart deal finder with budget intelligence.
        
        Logic:
        - If Budget: Checks if flight price fits within reasonable allocation (e.g. 40% of budget).
          If cheapest > 40%, suggests 'Premium' option if within +20% tolerance.
        - No Budget: Returns lowest price flight.
        """
        # Fetch raw flight prices
        scrape_result = await self.fetch_price(origin, destination, travel_date)
        
        response = {
            "flight_option": None,
            "suggestion_type": "standard",
            "message": "Uçuş bulunamadı",
            "scrape_result": scrape_result
        }
        
        if not scrape_result.success or not scrape_result.flights:
            return response
            
        # Sort flights by price
        sorted_flights = sorted(scrape_result.flights, key=lambda x: x.price)
        cheapest_flight = sorted_flights[0]
        
        if not budget:
            # NO BUDGET: Just return the cheapest
            response["flight_option"] = cheapest_flight
            response["suggestion_type"] = "cheapest"
            response["message"] = "En uygun fiyatlı uçuş bulundu."
            return response
            
        # WITH BUDGET Logic
        # Heuristic: Flight should be max 50% of total budget for a balanced trip
        flight_budget_limit = budget * 0.50
        
        if cheapest_flight.price <= flight_budget_limit:
            response["flight_option"] = cheapest_flight
            response["suggestion_type"] = "budget-friendly"
            response["message"] = f"Bütçenize uygun uçuş! (Bütçe kullanımı: %{int((cheapest_flight.price/budget)*100)})"
        else:
            # Over budget logic
            tolerance = flight_budget_limit * 1.20 # 20% tolerance
            if cheapest_flight.price <= tolerance:
                response["flight_option"] = cheapest_flight
                response["suggestion_type"] = "premium-stretch"
                response["message"] = "Bütçenizi biraz aşıyor ama buna değer!"
            else:
                # Way over budget
                response["flight_option"] = cheapest_flight
                response["suggestion_type"] = "over-budget"
                response["message"] = f"Bütçeniz uçuş için yetersiz kalabilir (En düşük: {cheapest_flight.price} TL)"
                
        return response
    
    # ============================================================================
    #               BÜTÇE ALGORİTMASI - SMART PACKAGE FINDER
    # ============================================================================
    
    async def fetch_smart_package(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        return_date: str,
        guests: int = 2,
        budget: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Akıllı Paket Bulucu - Uçak + Otel kombinasyonunu bütçeye göre önerir.
        
        Etiket Mantığı:
        1. Bütçe Verilmişse:
           - Toplam ≤ Bütçe → "Tam Bütçene Göre" ✅
           - Toplam > Bütçe ama fark ≤ %20 → "Bütçeni biraz aşıyor ama buna değer" 💎
           - Toplam > Bütçe + %20 → "Bütçe Aşımı" ⚠️
        
        2. Bütçe Verilmemişse:
           - En iyi fiyat/performans sonucu → "En İyi Teklif" 🎯
        
        Args:
            origin: Kalkış şehri/havalimanı
            destination: Varış şehri/havalimanı
            departure_date: Gidiş tarihi (YYYY-MM-DD)
            return_date: Dönüş tarihi (YYYY-MM-DD)
            guests: Misafir sayısı
            budget: Kullanıcı bütçesi (opsiyonel)
            
        Returns:
            Dict: Paket önerisi, etiket ve detaylar
        """
        logger.info("=" * 60)
        logger.info("🎯 [SMART PACKAGE] Akıllı Paket Arama Başlatılıyor")
        logger.info(f"   ✈️  Rota: {origin} → {destination}")
        logger.info(f"   📅 Gidiş: {departure_date} | Dönüş: {return_date}")
        logger.info(f"   👥 Misafir: {guests}")
        if budget:
            logger.info(f"   💰 Bütçe: {budget} TL")
        else:
            logger.info("   💰 Bütçe: Belirtilmedi (En iyi fiyat/performans aranacak)")
        logger.info("=" * 60)
        
        # Sonuç şablonu
        response = {
            "success": False,
            "label": None,           # Etiket (tam-butce, premium-oneri, en-iyi-teklif, butce-asimi)
            "label_text": None,      # Türkçe etiket metni
            "label_icon": None,      # Emoji
            "message": None,         # Kullanıcıya mesaj
            
            "flight": None,          # En iyi uçuş
            "hotel": None,           # En iyi otel
            
            "flight_price": None,
            "hotel_price": None,     # Gecelik fiyat
            "hotel_total": None,     # Toplam otel fiyatı
            "total_price": None,     # Uçak + Otel toplam
            
            "budget": budget,
            "budget_difference": None,  # Bütçe farkı (+ veya -)
            "budget_usage_percent": None,
            
            "nights": None,
            "errors": []
        }
        
        try:
            # ============== GECELİK HESAPLA ==============
            dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
            ret_date = datetime.strptime(return_date, "%Y-%m-%d")
            nights = (ret_date - dep_date).days
            
            if nights <= 0:
                response["errors"].append("Dönüş tarihi gidiş tarihinden sonra olmalı")
                return response
                
            response["nights"] = nights
            logger.info(f"🌙 Konaklama süresi: {nights} gece")
            
            # ============== UÇUŞ FİYATLARINI ÇEK ==============
            logger.info("✈️  Uçuş fiyatları çekiliyor...")
            
            flight_result = await self.fetch_prices_skyscanner(
                origin=origin,
                destination=destination,
                departure_date=departure_date,
                return_date=return_date,
                passengers=guests
            )
            
            if not flight_result.success or not flight_result.flights:
                response["errors"].append(f"Uçuş bulunamadı: {flight_result.error_message}")
                logger.warning(f"⚠️ Uçuş hatası: {flight_result.error_message}")
            else:
                # En ucuz uçuşu al
                best_flight = min(flight_result.flights, key=lambda f: f.price or float('inf'))
                response["flight"] = best_flight
                response["flight_price"] = best_flight.price
                logger.info(f"✅ En ucuz uçuş: {best_flight.price} TL")
            
            # ============== OTEL FİYATLARINI ÇEK ==============
            logger.info("🏨 Otel fiyatları çekiliyor...")
            
            hotel_result = await self.fetch_prices_trivago(
                destination=destination,
                check_in=departure_date,
                check_out=return_date,
                guests=guests
            )
            
            if not hotel_result.success or not hotel_result.hotels:
                response["errors"].append(f"Otel bulunamadı: {hotel_result.error_message}")
                logger.warning(f"⚠️ Otel hatası: {hotel_result.error_message}")
            else:
                # En iyi puan/fiyat oranını bul
                # Skor = Puan / (Fiyat / 100) - yüksek puan, düşük fiyat iyidir
                def calculate_value_score(hotel):
                    if not hotel.price:
                        return 0
                    rating = hotel.rating or 7.0  # Varsayılan puan
                    return rating / (hotel.price / 100)
                
                best_hotel = max(hotel_result.hotels, key=calculate_value_score)
                response["hotel"] = best_hotel
                response["hotel_price"] = best_hotel.price  # Gecelik
                response["hotel_total"] = best_hotel.price * nights
                # Tüm otel alternatifleri (en fazla 3) — TripDetail için
                response["hotel_options"] = hotel_result.hotels[:3]
                logger.info(f"✅ En iyi otel: {best_hotel.hotel_name} - {best_hotel.price} TL/gece (Toplam: {best_hotel.price * nights} TL)")
            
            # ============== TOPLAM FİYAT HESAPLA ==============
            flight_price = response["flight_price"] or 0
            hotel_total = response["hotel_total"] or 0
            total_price = flight_price + hotel_total
            response["total_price"] = total_price
            
            if total_price == 0:
                response["message"] = "Fiyat bilgisi alınamadı"
                return response
            
            logger.info(f"💰 Toplam Paket: {flight_price} (Uçuş) + {hotel_total} (Otel) = {total_price} TL")
            
            # ============== BÜTÇE ALGORİTMASI ==============
            response["success"] = True
            
            if budget is None:
                # ===== BÜTÇE VERİLMEDİ: En İyi Fiyat/Performans =====
                response["label"] = "en-iyi-teklif"
                response["label_text"] = "En İyi Teklif"
                response["label_icon"] = "🎯"
                response["message"] = f"Size özel en iyi fiyat/performans paketi! Toplam: {total_price:,.0f} TL"
                
                logger.info("🎯 Etiket: En İyi Teklif (bütçe belirtilmedi)")
                
            else:
                # Bütçe farkını hesapla
                difference = total_price - budget
                response["budget_difference"] = difference
                response["budget_usage_percent"] = round((total_price / budget) * 100, 1)
                
                if total_price <= budget:
                    # ===== TAM BÜTÇEYE UYGUN =====
                    savings = budget - total_price
                    response["label"] = "tam-butce"
                    response["label_text"] = "Tam Bütçene Göre"
                    response["label_icon"] = "✅"
                    response["message"] = f"Harika! Bu paket tam bütçene uyuyor. {savings:,.0f} TL tasarruf ediyorsun!"
                    
                    logger.info(f"✅ Etiket: Tam Bütçene Göre (Tasarruf: {savings} TL)")
                    
                elif difference <= budget * 0.20:
                    # ===== BÜTÇEYI BİRAZ AŞIYOR (%20'ye kadar) - PREMIUM ÖNERİ =====
                    overage_percent = round((difference / budget) * 100, 1)
                    response["label"] = "premium-oneri"
                    response["label_text"] = "Bütçeni biraz aşıyor ama buna değer"
                    response["label_icon"] = "💎"
                    response["message"] = f"Bu premium paket bütçeni %{overage_percent} aşıyor ama kalitesi için buna değer!"
                    
                    logger.info(f"💎 Etiket: Premium Öneri (Aşım: %{overage_percent})")
                    
                else:
                    # ===== BÜTÇE AŞIMI (%20'den fazla) =====
                    overage_percent = round((difference / budget) * 100, 1)
                    response["label"] = "butce-asimi"
                    response["label_text"] = "Bütçe Aşımı"
                    response["label_icon"] = "⚠️"
                    response["message"] = f"Bu paket bütçeni %{overage_percent} aşıyor. Alternatifler için tarihleri değiştirmeyi dene."
                    
                    logger.info(f"⚠️ Etiket: Bütçe Aşımı (%{overage_percent})")
            
            # ============== SONUÇ ÖZET ==============
            logger.info("=" * 60)
            logger.info("📦 [SMART PACKAGE] Sonuç Özeti")
            logger.info(f"   {response['label_icon']} {response['label_text']}")
            logger.info(f"   ✈️  Uçuş: {response['flight_price']} TL")
            logger.info(f"   🏨 Otel: {response['hotel_price']} TL/gece × {nights} = {response['hotel_total']} TL")
            logger.info(f"   💰 TOPLAM: {response['total_price']} TL")
            if budget:
                logger.info(f"   📊 Bütçe Kullanımı: %{response['budget_usage_percent']}")
            logger.info("=" * 60)
            
        except Exception as e:
            logger.error(f"❌ Smart Package hatası: {str(e)}")
            logger.exception("Detaylı hata:")
            response["errors"].append(str(e))
        
        return response
    
    def get_budget_recommendation(
        self,
        total_price: float,
        budget: Optional[float]
    ) -> Dict[str, Any]:
        """
        Sadece bütçe karşılaştırması yapar (scraping yapmadan).
        Mevcut fiyatları değerlendirmek için kullanılır.
        
        Args:
            total_price: Uçak + Otel toplam fiyatı
            budget: Kullanıcı bütçesi (opsiyonel)
            
        Returns:
            Dict: Etiket ve öneri
        """
        result = {
            "label": None,
            "label_text": None,
            "label_icon": None,
            "message": None,
            "is_within_budget": None,
            "difference": None,
            "usage_percent": None
        }
        
        if budget is None:
            result["label"] = "en-iyi-teklif"
            result["label_text"] = "En İyi Teklif"
            result["label_icon"] = "🎯"
            result["message"] = f"En uygun paket: {total_price:,.0f} TL"
            result["is_within_budget"] = True
            
        else:
            difference = total_price - budget
            result["difference"] = difference
            result["usage_percent"] = round((total_price / budget) * 100, 1)
            
            if total_price <= budget:
                result["label"] = "tam-butce"
                result["label_text"] = "Tam Bütçene Göre"
                result["label_icon"] = "✅"
                result["message"] = f"Bütçene uygun! {abs(difference):,.0f} TL tasarruf"
                result["is_within_budget"] = True
                
            elif difference <= budget * 0.20:
                result["label"] = "premium-oneri"
                result["label_text"] = "Bütçeni biraz aşıyor ama buna değer"
                result["label_icon"] = "💎"
                result["message"] = f"Premium seçenek (+{difference:,.0f} TL)"
                result["is_within_budget"] = False
                
            else:
                result["label"] = "butce-asimi"
                result["label_text"] = "Bütçe Aşımı"
                result["label_icon"] = "⚠️"
                result["message"] = f"Bütçeyi {difference:,.0f} TL aşıyor"
                result["is_within_budget"] = False
        
        return result
    #               SKYSCANNER SCRAPING IMPLEMENTATION
    # ============================================================================
    
    async def fetch_prices_skyscanner(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        return_date: Optional[str] = None,
        passengers: int = 1
    ) -> ScrapeResult:
        """
        Skyscanner'dan uçuş fiyatlarını çeker.
        
        Skyscanner URL Formatı:
        https://www.skyscanner.com.tr/transport/flights/{origin}/{destination}/{departure_date}/{return_date}/
        
        Args:
            origin: Kalkış havalimanı kodu (IST, SAW, ADB vb.)
            destination: Varış havalimanı kodu
            departure_date: Gidiş tarihi (YYYY-MM-DD formatında)
            return_date: Dönüş tarihi (opsiyonel, tek yön için None)
            passengers: Yolcu sayısı
            
        Returns:
            ScrapeResult: Fiyat sonuçları
        """
        result = ScrapeResult(
            origin=origin.upper(),
            destination=destination.upper(),
            date=departure_date,
            provider="skyscanner"
        )
        
        browser: Optional[Browser] = None
        
        logger.info("=" * 60)
        logger.info(f"🔍 [SKYSCANNER] Fiyat Taraması Başlatılıyor")
        logger.info(f"   ✈️  Rota: {origin.upper()} → {destination.upper()}")
        logger.info(f"   📅 Gidiş: {departure_date}")
        if return_date:
            logger.info(f"   📅 Dönüş: {return_date}")
        logger.info(f"   👥 Yolcu: {passengers}")
        logger.info("=" * 60)
        
        try:
            # ============== URL OLUŞTURMA ==============
            # Tarih formatını YYMMDD'ye çevir (Skyscanner formatı)
            try:
                dep_date_obj = datetime.strptime(departure_date, "%Y-%m-%d")
                dep_date_formatted = dep_date_obj.strftime("%y%m%d")
            except ValueError as e:
                logger.error(f"❌ Geçersiz gidiş tarihi formatı: {departure_date}")
                result.error_message = f"Geçersiz tarih formatı: {departure_date}. YYYY-MM-DD bekleniyor."
                return result
            
            # URL oluştur
            if return_date:
                try:
                    ret_date_obj = datetime.strptime(return_date, "%Y-%m-%d")
                    ret_date_formatted = ret_date_obj.strftime("%y%m%d")
                    # Gidiş-Dönüş URL
                    search_url = f"https://www.skyscanner.com.tr/transport/flights/{origin.lower()}/{destination.lower()}/{dep_date_formatted}/{ret_date_formatted}/?adultsv2={passengers}&cabinclass=economy&childrenv2=&ref=home&rtn=1&preferdirects=false&outboundaltsen498able=false&inboundaltsenabled=false"
                except ValueError:
                    logger.error(f"❌ Geçersiz dönüş tarihi formatı: {return_date}")
                    result.error_message = f"Geçersiz dönüş tarihi: {return_date}"
                    return result
            else:
                # Tek yön URL
                search_url = f"https://www.skyscanner.com.tr/transport/flights/{origin.lower()}/{destination.lower()}/{dep_date_formatted}/?adultsv2={passengers}&cabinclass=economy&childrenv2=&ref=home&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false"
            
            logger.info(f"🌐 URL: {search_url}")
            
            # ============== TARAYICI BAŞLAT ==============
            browser = await self._initialize_browser()
            page = await self._create_stealth_page(browser)
            
            # ============== SAYFAYA GİT ==============
            logger.info("📡 Skyscanner sayfası yükleniyor...")
            
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
                logger.info("✅ Sayfa yüklendi (DOM ready)")
            except PlaywrightTimeout:
                logger.error("❌ Sayfa yükleme zaman aşımı (45s)")
                result.error_message = "Skyscanner sayfası yüklenemedi - zaman aşımı"
                return result
            
            # ============== İNSANSI DAVRANIŞ ==============
            scroller = HumanScroller(page)
            
            # Sayfanın tam yüklenmesi için bekle
            await asyncio.sleep(3)
            logger.info("⏳ Sayfa stabilize ediliyor...")
            
            # İnsansı kaydırma yap
            await scroller.simulate_reading(duration=1.5)
            await scroller.scroll_down_slowly(distance=400, steps=4)
            
            # Fiyatların yüklenmesi için ek bekleme
            await asyncio.sleep(5)
            logger.info("⏳ Fiyat verileri bekleniyor...")
            
            # ============== "EN UCUZ" FİYAT ÇEKME ==============
            # Skyscanner CSS Selectors (güncel)
            price_selectors = [
                # Ana fiyat seçicileri
                "[data-testid='price']",
                "[class*='Price_mainPriceContainer']",
                "[class*='BpkText_bpk-text--lg']",
                "[class*='price']",
                ".EcoTicketWrapper_priceWithPromo__",
                ".BpkText_bpk-text--lg__",
                # Alternatif seçiciler
                "span[class*='price']",
                "div[class*='Price']",
                "[data-e2e='price']",
                # En ucuz seçenekler
                "[class*='cheapest']",
                "[class*='Cheapest']",
                "[data-testid='result-item-price']",
            ]
            
            prices_found = []
            
            for selector in price_selectors:
                try:
                    # Selector'ı ara
                    elements = await page.query_selector_all(selector)
                    
                    if elements:
                        logger.info(f"📍 Selector bulundu: {selector} ({len(elements)} element)")
                        
                        for elem in elements[:10]:  # İlk 10 elementi kontrol et
                            try:
                                price_text = await elem.text_content()
                                if price_text:
                                    price = self._extract_price(price_text)
                                    if price and price > 50:  # Minimum 50 TL filtresi
                                        prices_found.append(price)
                                        logger.debug(f"   💰 Fiyat bulundu: {price} TL")
                            except Exception as e:
                                logger.debug(f"   Element okuma hatası: {e}")
                                continue
                                
                except Exception as e:
                    logger.debug(f"Selector hatası ({selector}): {e}")
                    continue
            
            # ============== REGEX İLE YEDEK FİYAT ARAMA ==============
            if not prices_found:
                logger.info("🔄 CSS selector ile fiyat bulunamadı, regex deneniyor...")
                
                page_content = await page.content()
                
                # Türk Lirası fiyat pattern'leri
                patterns = [
                    r'(\d{1,3}(?:\.\d{3})*)\s*(?:TL|₺|TRY)',  # 1.234 TL
                    r'₺\s*(\d{1,3}(?:\.\d{3})*)',             # ₺1.234
                    r'"price":\s*(\d+)',                       # JSON price
                    r'(\d{3,6})\s*TL',                         # 1234 TL
                ]
                
                for pattern in patterns:
                    matches = re.findall(pattern, page_content)
                    for match in matches:
                        price = self._extract_price(match)
                        if price and 100 < price < 100000:  # Mantıklı fiyat aralığı
                            prices_found.append(price)
                
                if prices_found:
                    logger.info(f"✅ Regex ile {len(prices_found)} fiyat bulundu")
            
            # ============== SONUÇLARI İŞLE ==============
            if prices_found:
                # Duplikasyonları kaldır ve sırala
                unique_prices = sorted(list(set(prices_found)))
                
                logger.info(f"🎯 Toplam {len(unique_prices)} benzersiz fiyat bulundu")
                
                for price in unique_prices[:5]:  # En ucuz 5 fiyat
                    flight = FlightResult(
                        price=price,
                        currency="TRY",
                        provider="skyscanner",
                        success=True
                    )
                    result.flights.append(flight)
                
                result.success = True
                result.lowest_price = unique_prices[0]
                
                logger.info("=" * 60)
                logger.info(f"✅ [SKYSCANNER] Tarama Başarılı!")
                logger.info(f"   💰 En Ucuz Fiyat: {result.lowest_price} TL")
                logger.info(f"   📊 Bulunan Seçenek: {len(result.flights)}")
                logger.info("=" * 60)
                
            else:
                # Fiyat bulunamadı - debug için screenshot al
                logger.warning("⚠️ Hiçbir fiyat bulunamadı!")
                
                # Sayfa durumunu logla
                page_title = await page.title()
                current_url = page.url
                logger.info(f"   📄 Sayfa Başlığı: {page_title}")
                logger.info(f"   🔗 Mevcut URL: {current_url}")
                
                # Bot algılama kontrolü
                if "captcha" in current_url.lower() or "bot" in page_title.lower():
                    result.error_message = "Skyscanner bot koruması devreye girdi - CAPTCHA gerekli"
                    logger.error("❌ CAPTCHA/Bot koruması tespit edildi!")
                else:
                    result.error_message = "Fiyat verisi sayfada bulunamadı"
                    logger.warning("⚠️ Sayfa yüklendi ama fiyat elementi bulunamadı")
                    
        except PlaywrightTimeout as e:
            error_msg = f"Skyscanner zaman aşımı: {str(e)}"
            logger.error(f"❌ {error_msg}")
            result.error_message = error_msg
            
        except Exception as e:
            error_msg = f"Skyscanner scraping hatası: {str(e)}"
            logger.error(f"❌ {error_msg}")
            logger.exception("Detaylı hata:")
            result.error_message = error_msg
            
        finally:
            # ============== CLEANUP ==============
            if browser:
                await browser.close()
                logger.info("🔌 Tarayıcı kapatıldı")
            if self._playwright:
                await self._playwright.stop()
                self._playwright = None
        
        return result
    
    # ============================================================================
    #               TRIVAGO SCRAPING IMPLEMENTATION
    # ============================================================================
    
    async def fetch_prices_trivago(
        self,
        destination: str,
        check_in: str,
        check_out: str,
        guests: int = 2,
        rooms: int = 1
    ) -> ScrapeResult:
        """
        Trivago'dan otel fiyatlarını çeker.
        
        Trivago URL Formatı:
        https://www.trivago.com.tr/tr/srl?search=...
        
        Otel verileri: İsim, Gecelik Fiyat, Görsel URL, Puan
        
        Args:
            destination: Şehir veya bölge adı (örn: "Antalya", "Istanbul")
            check_in: Giriş tarihi (YYYY-MM-DD)
            check_out: Çıkış tarihi (YYYY-MM-DD)
            guests: Misafir sayısı
            rooms: Oda sayısı
            
        Returns:
            ScrapeResult: En iyi 3 otel bilgisi
        """
        result = ScrapeResult(
            origin="",  # Hotels don't have origin
            destination=destination,
            date=f"{check_in} - {check_out}",
            provider="trivago"
        )
        
        browser: Optional[Browser] = None
        
        logger.info("=" * 60)
        logger.info(f"🏨 [TRIVAGO] Otel Taraması Başlatılıyor")
        logger.info(f"   📍 Şehir: {destination}")
        logger.info(f"   📅 Giriş: {check_in}")
        logger.info(f"   📅 Çıkış: {check_out}")
        logger.info(f"   👥 Misafir: {guests} | Oda: {rooms}")
        logger.info("=" * 60)
        
        try:
            # ============== TARİH DOĞRULAMA ==============
            try:
                check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
                check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
                
                if check_out_date <= check_in_date:
                    logger.error("❌ Çıkış tarihi giriş tarihinden önce olamaz!")
                    result.error_message = "Çıkış tarihi giriş tarihinden sonra olmalı"
                    return result
                    
                nights = (check_out_date - check_in_date).days
                logger.info(f"   🌙 Konaklama: {nights} gece")
                
            except ValueError as e:
                logger.error(f"❌ Geçersiz tarih formatı: {e}")
                result.error_message = "Geçersiz tarih formatı. YYYY-MM-DD bekleniyor."
                return result
            
            # ============== URL OLUŞTURMA ==============
            # Trivago search URL formatı
            # Şehir adını URL-encode et
            destination_encoded = destination.replace(" ", "+").replace("ı", "i").replace("İ", "I").replace("ş", "s").replace("Ş", "S").replace("ğ", "g").replace("Ğ", "G").replace("ü", "u").replace("Ü", "U").replace("ö", "o").replace("Ö", "O").replace("ç", "c").replace("Ç", "C")
            
            # Trivago tarih formatı: YYYY-MM-DD
            search_url = f"https://www.trivago.com.tr/tr/srl?search={destination_encoded}&dr={check_in}--{check_out}&rooms=1&adults={guests}&sortOrder=relevance"
            
            logger.info(f"🌐 URL: {search_url}")
            
            # ============== TARAYICI BAŞLAT ==============
            browser = await self._initialize_browser()
            page = await self._create_stealth_page(browser)
            
            # ============== SAYFAYA GİT ==============
            logger.info("📡 Trivago sayfası yükleniyor...")
            
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
                logger.info("✅ Sayfa yüklendi (DOM ready)")
            except PlaywrightTimeout:
                logger.error("❌ Sayfa yükleme zaman aşımı (45s)")
                result.error_message = "Trivago sayfası yüklenemedi - zaman aşımı"
                return result
            
            # ============== COOKIE POPUP KAPAT ==============
            try:
                cookie_selectors = [
                    "[data-testid='cookie-accept']",
                    "button[id*='accept']",
                    "button[class*='cookie']",
                    "[class*='CookieConsent'] button",
                    "#onetrust-accept-btn-handler"
                ]
                
                for selector in cookie_selectors:
                    try:
                        cookie_btn = await page.query_selector(selector)
                        if cookie_btn:
                            await cookie_btn.click()
                            logger.info("🍪 Cookie popup kapatıldı")
                            await asyncio.sleep(1)
                            break
                    except:
                        continue
            except Exception:
                pass  # Cookie popup yoksa devam et
            
            # ============== İNSANSI DAVRANIŞ ==============
            scroller = HumanScroller(page)
            
            # Sayfanın tam yüklenmesi için bekle
            await asyncio.sleep(4)
            logger.info("⏳ Sayfa stabilize ediliyor...")
            
            # İnsansı kaydırma yap
            await scroller.simulate_reading(duration=2.0)
            await scroller.scroll_down_slowly(distance=500, steps=5)
            
            # Otel kartlarının yüklenmesi için ek bekleme
            await asyncio.sleep(4)
            logger.info("⏳ Otel verileri bekleniyor...")
            
            # ============== OTEL KARTLARINI ÇEK ==============
            hotels_found = []
            
            # Trivago otel kartı seçicileri
            hotel_card_selectors = [
                "[data-testid='accommodation-card']",
                "[class*='AccommodationCard']",
                "[class*='HotelCard']",
                "article[itemtype*='Hotel']",
                "[class*='item-order']",
                "li[data-testid='search-item']",
            ]
            
            hotel_cards = []
            for selector in hotel_card_selectors:
                try:
                    cards = await page.query_selector_all(selector)
                    if cards and len(cards) > 0:
                        hotel_cards = cards
                        logger.info(f"📍 Otel kartları bulundu: {selector} ({len(cards)} adet)")
                        break
                except Exception:
                    continue
            
            if hotel_cards:
                # İlk 3 oteli işle
                for i, card in enumerate(hotel_cards[:3]):
                    try:
                        hotel_info = await self._extract_hotel_info(card, i + 1)
                        if hotel_info:
                            hotels_found.append(hotel_info)
                    except Exception as e:
                        logger.warning(f"⚠️ Otel #{i+1} bilgisi çekilemedi: {e}")
                        continue
            
            # ============== FALLBACK: REGEX İLE ARAMA ==============
            if not hotels_found:
                logger.info("🔄 Kart seçicileri ile bulunamadı, regex deneniyor...")
                
                page_content = await page.content()
                
                # Otel isimlerini bul
                name_patterns = [
                    r'"hotelName":\s*"([^"]+)"',
                    r'"name":\s*"([^"]+Hotel[^"]*)"',
                    r'class="[^"]*name[^"]*">([^<]+)</[^>]+>',
                ]
                
                # Fiyatları bul
                price_patterns = [
                    r'(\d{1,3}(?:\.\d{3})*)\s*(?:TL|₺)',
                    r'"price":\s*(\d+)',
                    r'"totalPrice":\s*(\d+)',
                ]
                
                hotel_names = []
                for pattern in name_patterns:
                    matches = re.findall(pattern, page_content)
                    hotel_names.extend(matches[:5])
                
                prices = []
                for pattern in price_patterns:
                    matches = re.findall(pattern, page_content)
                    for m in matches:
                        price = self._extract_price(m)
                        if price and 100 < price < 50000:
                            prices.append(price)
                
                # Eşleştir
                for i, name in enumerate(hotel_names[:3]):
                    price = prices[i] if i < len(prices) else None
                    if name and price:
                        hotel = HotelResult(
                            hotel_name=name,
                            price=price / nights if nights > 0 else price,  # Gecelik fiyat
                            currency="TRY",
                            provider="trivago",
                            success=True
                        )
                        hotels_found.append(hotel)
            
            # ============== SONUÇLARI İŞLE ==============
            if hotels_found:
                result.hotels = hotels_found
                result.success = True
                
                # En düşük gecelik fiyatı bul
                prices = [h.price for h in hotels_found if h.price]
                if prices:
                    result.lowest_price = min(prices)
                
                logger.info("=" * 60)
                logger.info(f"✅ [TRIVAGO] Tarama Başarılı!")
                logger.info(f"   🏨 Bulunan Otel: {len(hotels_found)}")
                
                for i, hotel in enumerate(hotels_found, 1):
                    logger.info(f"   #{i} {hotel.hotel_name}")
                    logger.info(f"      💰 Gecelik: {hotel.price} TL | ⭐ {hotel.rating or 'N/A'}")
                
                if result.lowest_price:
                    logger.info(f"   💰 En Ucuz Gecelik: {result.lowest_price} TL")
                logger.info("=" * 60)
                
            else:
                logger.warning("⚠️ Hiçbir otel bulunamadı!")
                
                # Sayfa durumunu logla
                page_title = await page.title()
                current_url = page.url
                logger.info(f"   📄 Sayfa Başlığı: {page_title}")
                logger.info(f"   🔗 Mevcut URL: {current_url}")
                
                # Bot algılama kontrolü
                if "captcha" in current_url.lower() or "verify" in current_url.lower():
                    result.error_message = "Trivago bot koruması devreye girdi"
                    logger.error("❌ CAPTCHA/Bot koruması tespit edildi!")
                else:
                    result.error_message = "Otel verisi sayfada bulunamadı"
                    logger.warning("⚠️ Sayfa yüklendi ama otel elementi bulunamadı")
                    
        except PlaywrightTimeout as e:
            error_msg = f"Trivago zaman aşımı: {str(e)}"
            logger.error(f"❌ {error_msg}")
            result.error_message = error_msg
            
        except Exception as e:
            error_msg = f"Trivago scraping hatası: {str(e)}"
            logger.error(f"❌ {error_msg}")
            logger.exception("Detaylı hata:")
            result.error_message = error_msg
            
        finally:
            # ============== CLEANUP ==============
            if browser:
                await browser.close()
                logger.info("🔌 Tarayıcı kapatıldı")
            if self._playwright:
                await self._playwright.stop()
                self._playwright = None
        
        return result
    
    async def _extract_hotel_info(self, card, index: int) -> Optional[HotelResult]:
        """
        Tek bir otel kartından bilgileri çeker.
        
        Returns:
            HotelResult: Otel bilgileri (isim, fiyat, görsel, puan)
        """
        hotel = HotelResult(provider="trivago")
        
        try:
            # ============== OTEL ADI ==============
            name_selectors = [
                "[data-testid='item-name']",
                "[class*='name']",
                "h3",
                "[itemprop='name']",
                "span[class*='Title']",
            ]
            
            for selector in name_selectors:
                try:
                    name_elem = await card.query_selector(selector)
                    if name_elem:
                        hotel.hotel_name = (await name_elem.text_content() or "").strip()
                        if hotel.hotel_name:
                            break
                except:
                    continue
            
            # ============== FİYAT ==============
            price_selectors = [
                "[data-testid='recommended-price']",
                "[class*='price']",
                "[class*='Price']",
                "span[class*='deal']",
            ]
            
            for selector in price_selectors:
                try:
                    price_elem = await card.query_selector(selector)
                    if price_elem:
                        price_text = await price_elem.text_content()
                        if price_text:
                            price = self._extract_price(price_text)
                            if price and price > 50:
                                hotel.price = price
                                hotel.currency = "TRY"
                                break
                except:
                    continue
            
            # ============== GÖRSEL URL ==============
            image_selectors = [
                "img[data-testid='image']",
                "img[class*='image']",
                "img[class*='Image']",
                "img[src*='http']",
                "picture img",
            ]
            
            for selector in image_selectors:
                try:
                    img_elem = await card.query_selector(selector)
                    if img_elem:
                        # src veya data-src'yi kontrol et
                        img_url = await img_elem.get_attribute("src")
                        if not img_url or "data:" in img_url:
                            img_url = await img_elem.get_attribute("data-src")
                        
                        if img_url and img_url.startswith("http"):
                            hotel.image_url = img_url
                            break
                except:
                    continue
            
            # ============== PUAN ==============
            rating_selectors = [
                "[data-testid='rating']",
                "[class*='rating']",
                "[class*='Rating']",
                "[class*='score']",
            ]
            
            for selector in rating_selectors:
                try:
                    rating_elem = await card.query_selector(selector)
                    if rating_elem:
                        rating_text = await rating_elem.text_content()
                        if rating_text:
                            # Puan çıkar (8.5, 9.2 gibi)
                            rating_match = re.search(r'(\d+[.,]\d+)', rating_text)
                            if rating_match:
                                rating_str = rating_match.group(1).replace(",", ".")
                                hotel.rating = float(rating_str)
                                break
                except:
                    continue
            
            # Geçerli otel mi kontrol et
            if hotel.hotel_name and hotel.price:
                hotel.success = True
                logger.debug(f"   ✅ Otel #{index}: {hotel.hotel_name} - {hotel.price} TL")
                return hotel
            else:
                logger.debug(f"   ⚠️ Otel #{index}: Eksik bilgi (name={hotel.hotel_name}, price={hotel.price})")
                return None
                
        except Exception as e:
            logger.debug(f"   ❌ Otel #{index} parse hatası: {e}")
            return None
        
        return result
    
    async def fetch_prices(
        self,
        provider: str,
        **kwargs
    ) -> ScrapeResult:
        """
        Genel fiyat çekme fonksiyonu - provider'a göre yönlendirir.
        
        Args:
            provider: "skyscanner", "trivago", "enuygun", "pegasus", "thy"
            **kwargs: Provider'a özel parametreler
            
        Returns:
            ScrapeResult: Fiyat sonuçları
        """
        provider = provider.lower()
        
        logger.info(f"🚀 fetch_prices çağrıldı: provider={provider}")
        
        if provider == "skyscanner":
            return await self.fetch_prices_skyscanner(
                origin=kwargs.get("origin", "IST"),
                destination=kwargs.get("destination", ""),
                departure_date=kwargs.get("departure_date", ""),
                return_date=kwargs.get("return_date"),
                passengers=kwargs.get("passengers", 1)
            )
        elif provider == "trivago":
            return await self.fetch_prices_trivago(
                destination=kwargs.get("destination", ""),
                check_in=kwargs.get("check_in", ""),
                check_out=kwargs.get("check_out", ""),
                guests=kwargs.get("guests", 2),
                rooms=kwargs.get("rooms", 1)
            )
        elif provider in ["enuygun", "pegasus", "thy"]:
            return await self.fetch_price(
                origin=kwargs.get("origin", "IST"),
                destination=kwargs.get("destination", ""),
                travel_date=kwargs.get("departure_date"),
                provider=provider
            )
        else:
            result = ScrapeResult(
                origin=kwargs.get("origin", ""),
                destination=kwargs.get("destination", ""),
                date=kwargs.get("departure_date", ""),
                provider=provider
            )
            result.error_message = f"Bilinmeyen provider: {provider}"
            return result

    async def close(self) -> None:
        """Cleanup method to close any open browser instances."""
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None


# ============== Singleton Pattern ==============

_scraper_instance: Optional[PriceScraper] = None


def get_scraper() -> PriceScraper:
    """Returns a singleton scraper instance."""
    global _scraper_instance
    if _scraper_instance is None:
        _scraper_instance = PriceScraper()
    return _scraper_instance


async def fetch_price(
    origin: str, 
    destination: str, 
    travel_date: str = None,
    provider: str = "enuygun"
) -> ScrapeResult:
    """
    Convenience function to fetch price using the singleton scraper.
    """
    scraper = get_scraper()
    return await scraper.fetch_price(origin, destination, travel_date, provider)


async def fetch_best_deal(
    origin: str,
    destination: str,
    travel_date: str = None,
    budget: float = None
) -> Dict[str, Any]:
    """
    Convenience function for smart deal finding.
    """
    scraper = get_scraper()
    return await scraper.fetch_best_deal(origin, destination, travel_date, budget)


# ============================================================================
#               BACKGROUND TASK: WISHLIST SCRAPE PROCESSOR
# ============================================================================

async def process_wishlist_scrape(
    wishlist_id: str,
    origin: str,
    destination: str,
    travel_date: str = None,
    return_date: str = None,
    budget: float = None,
    guests: int = 1,
    trip_type: str = "bireysel"
):
    """
    Arka planda çalışarak wishlist için zengin trip_details verisi oluşturur ve DB'ye kaydeder.

    Akış:
      1. fetch_smart_package → Skyscanner (uçuş) + Trivago (otel x3)
      2. FlightLeg + HotelOption + BudgetSummary nesneleri inşa et
      3. trip_details objesi oluştur
      4. MongoDB'deki ilgili plan dokümanına 'trip_details' olarak kaydet
    """
    from database import DatabaseManager, COLLECTIONS
    from bson import ObjectId

    # IATA kodu → şehir adı tablosu
    IATA_CITIES: Dict[str, str] = {
        "IST": "Istanbul", "SAW": "Istanbul", "ESB": "Ankara", "ADB": "Izmir",
        "AYT": "Antalya", "DLM": "Dalaman", "BJV": "Bodrum", "SZF": "Samsun",
        "TZX": "Trabzon", "VAN": "Van", "ERZ": "Erzurum",
        "CDG": "Paris", "ORY": "Paris", "LHR": "London", "LGW": "London",
        "FCO": "Rome", "BCN": "Barcelona", "AMS": "Amsterdam",
        "FRA": "Frankfurt", "VIE": "Vienna", "MUC": "Munich", "ZRH": "Zurich",
        "DXB": "Dubai", "DOH": "Doha", "AUH": "Abu Dhabi",
        "SIN": "Singapore", "BKK": "Bangkok", "KUL": "Kuala Lumpur",
        "JFK": "New York", "LAX": "Los Angeles", "MIA": "Miami", "ORD": "Chicago",
        "TLV": "Tel Aviv", "CAI": "Cairo", "DUB": "Dublin", "CPH": "Copenhagen",
    }

    AIRLINE_LOGO_CODES: Dict[str, str] = {
        "turkish airlines": "TK", "thy": "TK",
        "pegasus": "PC", "pegasus airlines": "PC",
        "sunexpress": "XQ",
        "lufthansa": "LH",
        "air france": "AF",
        "klm": "KL",
        "british airways": "BA",
        "emirates": "EK",
        "qatar airways": "QR",
        "flydubai": "FZ",
        "wizz air": "W6",
        "ryanair": "FR",
        "easyjet": "U2",
    }

    def city_of(code: str) -> str:
        return IATA_CITIES.get(code.upper(), code.upper())

    def logo_url(airline: str) -> Optional[str]:
        code = AIRLINE_LOGO_CODES.get(airline.lower().strip())
        if code:
            return f"https://content.airhex.com/content/logos/airlines_{code}_35_35_t.png"
        return None

    logger.info("=" * 60)
    logger.info(f"🚀 [TRIP DETAIL SCRAPE] Başladı: {wishlist_id}")
    logger.info(f"   ✈️  {origin} → {destination}")
    logger.info(f"   📅 Gidiş: {travel_date} | Dönüş: {return_date}")
    logger.info(f"   👥 Misafir: {guests} | 💰 Bütçe: {budget} TRY")
    logger.info("=" * 60)

    # ── Onaylanmış planlar için scraping'i atla ───────────────────────────
    try:
        current_plan = await DatabaseManager.find_one(COLLECTIONS["wishlists"], {"_id": ObjectId(wishlist_id)})
        if current_plan and current_plan.get("status") == "confirmed":
            logger.info(f"⛔ [SCRAPE SKIP] Plan onaylandı, scraping atlanıyor: {wishlist_id}")
            return
    except Exception as _skip_err:
        logger.warning(f"⚠️ Plan durumu kontrol edilemedi: {_skip_err}")

    try:
        # ── Gece sayısı ──────────────────────────────────────────────────
        nights = 4  # makul varsayılan
        if travel_date and return_date:
            try:
                dep = datetime.strptime(travel_date, "%Y-%m-%d")
                ret = datetime.strptime(return_date, "%Y-%m-%d")
                nights = max((ret - dep).days, 1)
            except ValueError:
                pass
        logger.info(f"🌙 Konaklama: {nights} gece")

        # ── Akıllı paket çek (Skyscanner + Trivago) ──────────────────────
        scraper = get_scraper()
        dep_date = travel_date or datetime.utcnow().strftime("%Y-%m-%d")
        ret_date = return_date or dep_date

        package = await scraper.fetch_smart_package(
            origin=origin,
            destination=destination,
            departure_date=dep_date,
            return_date=ret_date,
            guests=guests,
            budget=budget,
        )

        # ── Gidiş uçuşu ──────────────────────────────────────────────────
        outbound: Optional[Dict[str, Any]] = None
        flight_cost = 0.0

        best_flight = package.get("flight")
        if best_flight:
            airline_name = getattr(best_flight, "airline", None) or "Unknown Airline"
            dep_time = getattr(best_flight, "departure_time", None) or "08:30"
            arr_time = getattr(best_flight, "arrival_time", None) or "11:00"
            dur = getattr(best_flight, "duration", None) or f"{max(nights // 2, 1)}s 30dk"
            stops_val = getattr(best_flight, "stops", 0) or 0
            outbound = {
                "departure_code": origin.upper(),
                "arrival_code": destination.upper(),
                "departure_city": city_of(origin),
                "arrival_city": city_of(destination),
                "departure_time": dep_time,
                "arrival_time": arr_time,
                "duration": dur,
                "stops": stops_val,
                "airline": airline_name,
                "airline_logo_url": logo_url(airline_name),
                "flight_number": None,
                "price": best_flight.price or 0,
                "currency": getattr(best_flight, "currency", "TRY"),
                "cabin_class": "economy",
            }
            flight_cost = best_flight.price or 0
            logger.info(f"✈️  Gidiş uçuşu: {airline_name} {dep_time}→{arr_time} @ {flight_cost} TRY")

        # ── Dönüş uçuşu (tahminî ─ aynı havayolu, ters rota) ────────────
        return_flight_data: Optional[Dict[str, Any]] = None
        if outbound and return_date:
            return_flight_data = {
                **outbound,
                "departure_code": destination.upper(),
                "arrival_code": origin.upper(),
                "departure_city": city_of(destination),
                "arrival_city": city_of(origin),
                "departure_time": "15:00",
                "arrival_time": "19:30",
                "duration": outbound.get("duration") or "3s 30dk",
            }
            logger.info(f"✈️  Dönüş uçuşu: {destination} → {origin} 15:00→18:30")

        # ── Otel alternatifleri (en fazla 3) ─────────────────────────────
        hotel_options: List[Dict[str, Any]] = []
        hotel_cost = 0.0

        raw_hotels: list = package.get("hotel_options", [])
        if not raw_hotels:
            single = package.get("hotel")
            if single:
                raw_hotels = [single]

        for i, h in enumerate(raw_hotels[:3]):
            per_night = h.price or 0
            total = round(per_night * nights, 2)
            option: Dict[str, Any] = {
                "hotel_name": h.hotel_name or f"Otel #{i + 1}",
                "stars": h.stars or 3,
                "rating": h.rating,
                "image_url": h.image_url,
                "address": h.location if hasattr(h, "location") else None,
                "price_per_night": per_night,
                "total_price": total,
                "currency": h.currency or "TRY",
                "nights": nights,
                "room_type": "Standard Oda",
                "amenities": [],
                "provider": h.provider or "trivago",
                "is_recommended": (i == 0),  # en iyi puan/fiyat skoru
            }
            hotel_options.append(option)
            logger.info(f"🏨 Otel #{i + 1}: {option['hotel_name']} | {per_night} TRY/gece → {total} TRY")

        if hotel_options:
            hotel_cost = hotel_options[0]["total_price"]

        # ── Bütçe özeti ───────────────────────────────────────────────────
        total_cost = round(flight_cost + hotel_cost, 2)
        budget_rec = scraper.get_budget_recommendation(total_cost, budget)

        diff = budget_rec.get("difference")
        is_ok = budget_rec.get("is_within_budget", True)
        budget_summary: Dict[str, Any] = {
            "target_budget": budget,
            "flight_cost": flight_cost,
            "hotel_cost": hotel_cost,
            "total_cost": total_cost,
            "currency": "TRY",
            "label": budget_rec.get("label", "en-iyi-teklif"),
            "label_text": budget_rec.get("label_text", "En İyi Teklif"),
            "label_icon": budget_rec.get("label_icon", "🎯"),
            "savings": round(abs(diff), 2) if diff is not None and is_ok and diff else None,
            "overage": round(abs(diff), 2) if diff is not None and not is_ok and diff else None,
            "usage_percent": budget_rec.get("usage_percent"),
        }
        logger.info(f"💰 Bütçe: {budget_summary['label_icon']} {budget_summary['label_text']} | Toplam: {total_cost} TRY")

        # ── trip_details objesi ───────────────────────────────────────────
        trip_details: Dict[str, Any] = {
            "trip_type": trip_type,
            "outbound_flight": outbound,
            "return_flight": return_flight_data,
            "hotel_options": hotel_options,
            "selected_hotel_index": 0,
            "budget_summary": budget_summary,
            "nights": nights,
            "ai_day_plans": [],
            "scraped_at": datetime.utcnow(),
            "scrape_provider": "trivago+skyscanner",
        }

        # ── Destinasyon görseli ───────────────────────────────────────────
        image_url: Optional[str] = None
        try:
            from image_service import fetch_destination_image
            image_url = await fetch_destination_image(destination)
        except Exception:
            pass

        # ── Backward-compat itinerary_items ──────────────────────────────
        itinerary_items: list = []
        if outbound:
            itinerary_items.append({
                "item_type": "flight",
                "provider": outbound["airline"],
                "title": f"{origin} → {destination}",
                "price": flight_cost,
                "currency": "TRY",
                "is_selected": True,
                "flight_details": {
                    "airline": outbound["airline"],
                    "departure_airport": origin,
                    "arrival_airport": destination,
                    "departure_time": outbound["departure_time"],
                    "arrival_time": outbound["arrival_time"],
                    "duration": outbound.get("duration"),
                    "price": flight_cost,
                    "currency": "TRY",
                },
            })
        if hotel_options:
            best_h = hotel_options[0]
            itinerary_items.append({
                "item_type": "hotel",
                "provider": best_h["provider"],
                "title": best_h["hotel_name"],
                "price": best_h["total_price"],
                "currency": "TRY",
                "is_selected": True,
                "hotel_details": {
                    "hotel_name": best_h["hotel_name"],
                    "stars": best_h["stars"],
                    "rating": best_h.get("rating"),
                    "price_per_night": best_h["price_per_night"],
                    "total_price": best_h["total_price"],
                    "currency": "TRY",
                    "check_in": travel_date or "",
                    "check_out": return_date or "",
                },
            })

        # ── MongoDB güncelle ──────────────────────────────────────────────
        update_data: Dict[str, Any] = {
            "updated_at": datetime.utcnow(),
            "last_scraped_at": datetime.utcnow(),
            "status": "tracking",
            "trip_details": trip_details,
            "itinerary_items": itinerary_items,
            "current_price": total_cost if total_cost > 0 else None,
            "notes": package.get("message", "Tarama tamamlandı"),
        }
        if image_url:
            update_data["image_url"] = image_url

        await DatabaseManager.update_one(
            COLLECTIONS["wishlists"],
            {"_id": ObjectId(wishlist_id)},
            {"$set": update_data},
        )

        logger.info("=" * 60)
        logger.info(f"✅ [TRIP DETAIL] DB'ye kaydedildi: {wishlist_id}")
        logger.info(f"   🏨 {len(hotel_options)} otel seçeneği | ✈️  Uçuş: {'var' if outbound else 'yok'}")
        logger.info(f"   💰 {total_cost} TRY | {budget_summary['label_icon']} {budget_summary['label_text']}")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"❌ Trip detail scrape hatası ({wishlist_id}): {e}")
        logger.exception("Detaylı hata:")
        try:
            await DatabaseManager.update_one(
                COLLECTIONS["wishlists"],
                {"_id": ObjectId(wishlist_id)},
                {"$set": {
                    "status": "error",
                    "notes": f"Trip detail tarama hatası: {str(e)}",
                    "updated_at": datetime.utcnow(),
                }},
            )
        except Exception as db_err:
            logger.error(f"❌ DB hata güncelleme başarısız: {db_err}")
