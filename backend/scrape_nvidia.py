import time
import re
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
from selenium.webdriver.chrome.options import Options

def extract():
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920x1080")
    
    driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)
    
    urls = [
        "https://build.nvidia.com/nvidia/magpie-tts-multilingual",
        "https://build.nvidia.com/nvidia/tts"
    ]
    
    for url in urls:
        print(f"\n--- Scraping {url} ---")
        driver.get(url)
        time.sleep(5)  # Wait for React logic to load Code blocks
        
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # NVIDIA typically puts example payloads in `<pre>` or `<code>` blocks
        code_blocks = soup.find_all('code')
        for block in code_blocks:
            text = block.get_text()
            # If it's a python request block or json payload block
            if 'payload' in text or 'input' in text or '"text"' in text or 'requests.post' in text:
                print("================ CODE BLOCK ================")
                print(text.strip())
                print("============================================")
    
    driver.quit()

if __name__ == "__main__":
    try:
        extract()
    except Exception as e:
        print(f"Failed to scrape: {e}")
