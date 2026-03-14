"""Uvicorn launcher with UTF-8 output encoding fix for Windows."""
import sys
import os

# Fix Windows console encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import uvicorn
uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="warning")
