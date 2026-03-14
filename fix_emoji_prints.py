import re

# Fix database.py
db_path = r"c:\Users\metin\OneDrive\Masaüstü\OKUL\PLANİGO\database.py"
with open(db_path, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace('print(f"✅ MongoDB Atlas bağlantısı başarılı: {DB_NAME}")',
              'print("[OK] MongoDB Atlas baglantisi basarili: " + str(DB_NAME))')
c = c.replace('print(f"❌ MongoDB bağlantı hatası: {e}")',
              'print("[ERR] MongoDB baglanti hatasi: " + str(e))')
with open(db_path, "w", encoding="utf-8") as f:
    f.write(c)
print("database.py: OK")

# Fix main.py lifespan prints
main_path = r"c:\Users\metin\OneDrive\Masaüstü\OKUL\PLANİGO\main.py"
with open(main_path, "r", encoding="utf-8") as f:
    m = f.read()

replacements = [
    ('print("✅ MongoDB bağlantısı kuruldu — canlı veri kullanılıyor.")',
     'print("[OK] MongoDB baglantisi kuruldu - canli veri kullaniliyor.")'),
    ('print(f"⚠️  MongoDB bağlanamadı ({type(e).__name__}) — mock veri ile devam ediliyor.")',
     'print("[WARN] MongoDB baglanamadi (" + type(e).__name__ + ") - mock veri ile devam ediliyor.")'),
    ('print("\\n🚀 SITA Smart Planner — Discover v2 aktif!")',
     'print("\\n[START] SITA Smart Planner - Discover v2 aktif")'),
]
for old, new in replacements:
    if old in m:
        m = m.replace(old, new, 1)
        print(f"Replaced: {old[:50]}")

# Also replace any remaining emoji in print statements
m = m.encode('ascii', errors='replace').decode('ascii')

with open(main_path, "w", encoding="utf-8") as f:
    f.write(m)
print("main.py: OK")
