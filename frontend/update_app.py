import os

file_path = r"c:\Users\metin\OneDrive\Masaüstü\OKUL\PLANİGO\frontend\app.js"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Wishlist Logic - refined target with correct newline
wishlist_target = """        if (!response.ok) throw new Error('Failed to fetch wishlists');

        const wishlists = await response.json();
        state.wishlists = wishlists; // Sync state"""

wishlist_replacement = """        let wishlists = [];
        
        if (response.ok) {
            wishlists = await response.json();
        }

        // MOCK DATA FALLBACK
        if (!wishlists || wishlists.length === 0) {
            wishlists = [
                { _id: 'mock1', destination: 'Paris, France', origin: 'Istanbul', target_price: 15000, currency: 'TRY', image_url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200&q=80' },
                { _id: 'mock2', destination: 'Kyoto, Japan', origin: 'Istanbul', target_price: 35000, currency: 'TRY', image_url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=200&q=80' },
                { _id: 'mock3', destination: 'New York, USA', origin: 'Istanbul', target_price: 45000, currency: 'TRY', image_url: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=200&q=80' }
            ];
        }

        state.wishlists = wishlists; // Sync state"""

# Try to find target with flexible whitespace if exact match fails
if wishlist_target not in content:
    # Try alternate spacing
    wishlist_target = wishlist_target.replace('\n\n', '\n        \n') 

new_content = content.replace(wishlist_target, wishlist_replacement)

# Verify replacements happened
if wishlist_target not in content:
    print("Warning: Wishlist target STILL not found!")
    # Debug print surround lines
    start_marker = "const response = await fetch(`${API_BASE}/wishlists`);"
    idx = content.find(start_marker)
    if idx != -1:
        print("Context in file:")
        print(repr(content[idx:idx+200]))
else:
    print("Success: Wishlist replacement prepared.")

if new_content != content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Saved changes to app.js")
else:
    print("No changes make.")
