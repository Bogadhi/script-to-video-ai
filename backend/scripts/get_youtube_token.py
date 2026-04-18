"""
YouTube OAuth2 Token Helper Script
Run this ONCE to get a refresh token for the YouTube Data API.

Usage:
  1. Copy your Google OAuth2 client_id and client_secret from Google Cloud Console
  2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your shell
  3. Run: python scripts/get_youtube_token.py
  4. Copy the printed refresh_token into your .env file
"""

import os
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

def main():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables first.")
        return

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0)

    print("\n" + "="*60)
    print("SUCCESS! Add this to your .env file:")
    print("="*60)
    print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
    print("="*60)

if __name__ == "__main__":
    main()
