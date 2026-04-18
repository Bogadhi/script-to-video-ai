"""
Thin shim — delegates to api.py which is the single authoritative entry point.

Run directly:
    python main.py
Or via uvicorn (preferred):
    uvicorn api:app --reload --port 8000
"""

import os

if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv

    load_dotenv()

    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=True,
    )
