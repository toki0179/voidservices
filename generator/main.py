from dotenv import load_dotenv
import random
load_dotenv()
from accounts_db import init_accounts_db, insert_account
proxy = f"http://toki0179datacenter-{random.randint(1,100)}:bossandy12@p.webshare.io:80/"
# proxy = None

import os
import time
import string
import re
import logging
from playwright.sync_api import Playwright, sync_playwright
from playwright_stealth import Stealth
from ollamafreeapi import OllamaFreeAPI
from PIL import Image
import pytesseract
import tiktoken


# Ensure generator directory exists
GENERATOR_DIR = os.path.join(os.getcwd(), 'generator')
os.makedirs(GENERATOR_DIR, exist_ok=True)

def random_string(length: int) -> str:
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for _ in range(length))

def human_delay(min_sec: float = 0.3, max_sec: float = 0.8) -> None:
    time.sleep(random.uniform(min_sec, max_sec))

def human_move_and_click(page, element, offset: int = 5) -> None:
    try:
        count = 0
        try:
            count = element.count() if hasattr(element, 'count') else 1
        except Exception:
            count = 1
        if count == 0:
            print(f"LOG: [human_move_and_click] No elements found")
            return
        element.wait_for(state="visible", timeout=5000)
        box = element.bounding_box()
        if box:
            end_x = box['x'] + random.uniform(offset, box['width'] - offset)
            end_y = box['y'] + random.uniform(offset, box['height'] - offset)
            # Use built-in steps for human-like movement instead of manual jitter
            steps = random.randint(8, 18)
            page.mouse.move(end_x, end_y, steps=steps)
            human_delay(0.1, 0.35)
            page.mouse.click(end_x, end_y)
        else:
            element.click()
    except Exception as e:
        print(f"LOG: [human_move_and_click] Fallback click due to: {e}")
        try:
            element.click()
        except Exception as e2:
            print(f"LOG: [human_move_and_click] Click also failed: {e2}")

def human_type(page, locator, text, delay_range: tuple = (0.05, 0.2)) -> None:
    human_move_and_click(page, locator)
    human_delay(random.uniform(0.08, 0.35), random.uniform(0.18, 0.45))
    page.keyboard.press("Control+A")
    human_delay(random.uniform(0.03, 0.13), random.uniform(0.08, 0.18))
    page.keyboard.press("Delete")
    human_delay(random.uniform(0.09, 0.22), random.uniform(0.15, 0.33))
    for ch in text:
        page.keyboard.type(ch, delay=random.uniform(0.04, 0.28))
        human_delay(random.uniform(0.01, 0.12), random.uniform(0.03, 0.18))

def select_dropdown_with_arrows(page, dropdown_text: str, down_presses: int) -> None:
    dropdown = page.get_by_text(dropdown_text)
    human_move_and_click(page, dropdown)
    human_delay(0.3, 0.6)
    for _ in range(down_presses):
        page.keyboard.press("ArrowDown")
        human_delay(0.03, 0.08)
    human_delay(0.2, 0.4)
    page.keyboard.press("Enter")
    human_delay(0.2, 0.5)

def extract_answer_from_response(raw_response: str) -> str:
    """Extract clean answer - just take the last word/number from the response."""
    if not raw_response:
        return ""
    # Remove common prefixes like "Answer:" or "answer"
    cleaned = re.sub(r'(?i)^answer\s*:\s*', '', raw_response.strip())
    # Split by whitespace and take the last token (most likely the answer)
    tokens = cleaned.split()
    if not tokens:
        return ""
    last_token = tokens[-1]
    # Remove trailing punctuation
    last_token = last_token.rstrip('.,!?;:')
    return last_token

def count_tokens(prompt):
    # Use tiktoken if available, fallback to length
    try:
        enc = tiktoken.encoding_for_model("gpt-3.5-turbo")
        return len(enc.encode(prompt))
    except Exception:
        return len(prompt.split())

_preferred_server = {}
MODEL_PARAMS = {
    # Add model-specific params here if needed
}

def solve_captcha_with_ollama(client, model_name, extracted_text):
    available_models = client.list_models()
    answer = None
    last_error = None
    print("LOG:Solving captcha")

    # Try the user-specified model_name first, then others if it fails
    models_to_try = [model_name] + [m for m in available_models if m != model_name]

    for model in models_to_try:
        params = MODEL_PARAMS.get(model, {})
        servers = client.get_model_servers(model)
        if not servers:
            continue
        preferred_url = _preferred_server.get(model)
        # Prioritize servers in Germany/Europe
        def is_eu_server(server):
            url = server.get('url', '').lower()
            # Add more region keywords as needed
            return any(region in url for region in ['de', 'germany', 'frankfurt', 'eu', 'europe'])
        # Sort: preferred_url first, then EU servers, then others
        servers.sort(key=lambda server: (
            preferred_url and server.get('url') != preferred_url,
            not is_eu_server(server)
        ))
        import random as _random
        _random.shuffle(servers[1:])  # Shuffle only after the first (preferred/EU) server
        # Build prompt: instruct model to output ONLY the answer
        full_prompt = (
            "You are solving a captcha. Output ONLY the answer, with no explanation, no punctuation, and no extra text. "
            "If the answer is a number, output only the number. If it is a word, output only the word. Do not say anything else.\n"
            f"Captcha: {extracted_text.strip()}"
        )

        for server in servers:
            url = server.get('url')
            if not url:
                continue
            try:
                from ollama import Client as OllamaClient
                client_ollama = OllamaClient(host=url, timeout=15)
                request = client.generate_api_request(model=model, prompt=full_prompt, **params)
                request['stream'] = False
                response = client_ollama.generate(**request)
                text = getattr(response, 'response', None)
                if not text and isinstance(response, dict):
                    text = response.get('response')
                if text:
                    _preferred_server[model] = url
                    answer = text.strip()
                    print(f"LOG:Model {model} succeeded with server {url}")
                    break
                last_error = RuntimeError('Empty response body from upstream server')
            except Exception as server_error:
                last_error = server_error
        if answer:
            break
    if not answer:
        return "I couldn't solve the captcha."
    return extract_answer_from_response(answer)

def solve_captcha_loop(page, client, model_name, username):
    """Handle captcha solving including potential reopen/reload of iframe."""
    max_attempts = 50
    attempt = 0

    try:
        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
        time.sleep(1)
    except Exception:
        print("LOG:About button not found, continuing")

    try:
        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
        print("LOG: Clicked Accessibility Challenge button to enable accessibility mode (forced).")
        time.sleep(1)
    except Exception:
        print("LOG: Accessibility Challenge button not found or not clickable after Menu button.")


    while attempt < max_attempts:
        attempt += 1
        print(f"LOG: Captcha solving attempt {attempt}")

        # Wait for iframe to be present and accessible
        try:
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=10000)
        except Exception:
            print("LOG: [solve_captcha_loop] Captcha iframe not found, skipping attempt.")
            continue

        # Take screenshot and OCR
        captcha_filename = f"captcha_{username}_{attempt}.png"
        captcha_path = os.path.join(GENERATOR_DIR, captcha_filename)
        try:
            page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").screenshot(path=captcha_path)
        except Exception as e:
            print(f"LOG: Failed to capture captcha text: {e}")
            time.sleep(2)
            continue

        compressed_filename = f"captcha_{username}_{attempt}_compressed.jpg"
        compressed_path = os.path.join(GENERATOR_DIR, compressed_filename)
        with Image.open(captcha_path) as img:
            rgb_img = img.convert("RGB")
            rgb_img.save(compressed_path, format="JPEG", quality=60)
        os.remove(captcha_path)

        extracted_text = pytesseract.image_to_string(Image.open(compressed_path))
        print(f"LOG: OCR extracted text: {extracted_text.strip()}")

        answer = solve_captcha_with_ollama(client, model_name, extracted_text.strip())
        print(f"LOG: Answer: {answer}")

        # Fill and submit
        try:
            captcha_input = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("textbox")
            human_type(page, captcha_input, answer)

            content_frame = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame
            try:
                next_btn = content_frame.locator('role=button')
                if next_btn.count() > 0 and next_btn.first.is_visible():
                    human_move_and_click(page, next_btn.first)
                    time.sleep(2)
                else:
                    raise Exception('No button')
            except Exception:
                submit_btn = content_frame.get_by_role("button", name="Submit")
                human_move_and_click(page, submit_btn)
                time.sleep(2)

            human_delay(1.0, 2.0)

            # Check if iframe disappears (captcha solved)
            try:
                page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=5000)
                print("LOG: Iframe still present, may need another round")
                # Check if text-text element is still visible, if not, we need to press the accessibility button
                try:
                    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").wait_for(state="visible", timeout=3000)
                except Exception:
                    print("LOG: Text element not visible, trying to click accessibility button again")
                    try:
                        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
                        time.sleep(1)
                        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
                        print("LOG: Clicked Accessibility Challenge button again.")
                        time.sleep(1)
                    except Exception:
                        print("LOG: Accessibility Challenge button not found on second attempt.")
            except Exception:
                print("LOG: Iframe disappeared - captcha solved")
                return True

        except Exception as e:
            print(f"LOG: Error during captcha interaction: {e}")
            time.sleep(2)
            continue

    print("LOG: Max attempts reached, captcha not solved")
    return False

def run(playwright: Playwright) -> None:
    client = OllamaFreeAPI()
    logging.basicConfig(level=logging.INFO)

    print(f"LOG:Launching browser")
    launch_args = {}
    proxy_url = proxy
    proxy_username = None
    proxy_password = None
    if proxy_url and '@' in proxy_url:
        m = re.match(r'http[s]?://([^:]+):([^@]+)@([^/]+)', proxy_url)
        if m:
            proxy_username, proxy_password, proxy_host = m.groups()
            launch_args['proxy'] = { 'server': f'http://{proxy_host}' }
        else:
            launch_args['proxy'] = { 'server': proxy_url.split('@')[-1] }
    elif proxy_url:
        launch_args['proxy'] = { 'server': proxy_url }
    if 'proxy' in launch_args:
        proxy_info = launch_args['proxy']['server']
        if proxy_username and proxy_password:
            print(f"LOG:Using proxy with auth: {proxy_username}:****@{proxy_info}")
        else:
            print(f"LOG:Using proxy without auth: {proxy_info}")
    browser = playwright.chromium.launch(headless=True, **launch_args)
    print("LOG:Creating browser context")
    
    # Randomize user agent and viewport
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    ]
    user_agent = random.choice(user_agents)
    viewport = {
        "width": random.randint(1200, 1920),
        "height": random.randint(700, 1080)
    }
    context_args = {
        "user_agent": user_agent,
        "viewport": viewport,
        "locale": random.choice(["en-US", "en-GB", "en-CA"]),
        "timezone_id": random.choice(["America/New_York", "Europe/Berlin", "Asia/Tokyo"]),
    }
    if proxy_username and proxy_password:
        context_args["http_credentials"] = {"username": proxy_username, "password": proxy_password}
    context = browser.new_context(**context_args)
    print(f"LOG:Using user agent: {user_agent}")
    print(f"LOG:Using viewport: {viewport}")
    print(f"LOG:Using locale: {context_args['locale']}, timezone: {context_args['timezone_id']}")
    
    # Add extra stealth: random navigator properties
    page = context.new_page()
    Stealth().apply_stealth_sync(page)
    page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
        Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
        Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
    """)
    
    name = "voidservices"
    username = f"voidserv_{random_string(5)}"
    password = random_string(10)

    print("LOG:Opening new page and applying stealth")
    page = context.new_page()
    Stealth().apply_stealth_sync(page)

    print("LOG:Going to Discord register page")
    page.goto("https://discord.com/register")
    human_delay(1.0, 2.5)
    page.mouse.wheel(0, random.randint(50, 150))
    human_delay(0.5, 1.0)

    print("LOG:Ensuring first registration input is ready")
    page.wait_for_selector('input[name="email"]', timeout=10000)
    print("LOG:Filling registration form")
    email = f"{random_string(8)}@shady.gg"
    email_locator = page.get_by_role("textbox", name="Email")
    human_type(page, email_locator, email)

    display_locator = page.get_by_role("textbox", name="Display Name")
    human_type(page, display_locator, name)

    user_locator = page.get_by_role("textbox", name="Username")
    human_type(page, user_locator, username)

    pass_locator = page.get_by_role("textbox", name="Password")
    human_type(page, pass_locator, password)

    print("LOG:Selecting date of birth")
    select_dropdown_with_arrows(page, "Day, Day", 19)
    select_dropdown_with_arrows(page, "Month, Month", 0)
    select_dropdown_with_arrows(page, "Year, Year", 23)

    print("LOG:Clicking consent checkbox")
    checkbox = page.get_by_text("I have read and agree to")
    human_move_and_click(page, checkbox)
    human_delay(0.5, 1.0)

    print("LOG:Verifying registration fields")
    registration_fields = [
        (page.get_by_role("textbox", name="Email"), email),
        (page.get_by_role("textbox", name="Display Name"), name),
        (page.get_by_role("textbox", name="Username"), username),
        (page.get_by_role("textbox", name="Password"), password),
    ]
    for locator, value in registration_fields:
        try:
            current_value = locator.input_value()
            if not current_value.strip():
                print(f"LOG:Field empty, refilling")
                human_type(page, locator, value)
        except Exception as e:
            print(f"LOG:Error checking field: {e}")

    print("LOG:Clicking create account button")
    create_btn = page.get_by_role("button", name="Create Account")
    human_move_and_click(page, create_btn)

    print("LOG:Checking for rate limiting")
    try:
        page.wait_for_selector("text=/.*rate limited.*/i", timeout=5000)
        print("LOG:Rate limit message detected, exiting process")
        context.close()
        browser.close()
        return
    except Exception:
        print("LOG:No rate limit message detected, proceeding with captcha")

    # Initial captcha iframe load
    print("LOG:Waiting for hCaptcha to load")
    page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=15000)
    time.sleep(2)
    
    model_name = 'gpt-oss:20b'
    
    # Solve captcha, and if the iframe reappears after a solve, repeat the loop
    while True:
        solved = solve_captcha_loop(page, client, model_name, username)
        if not solved:
            print("LOG:Failed to solve captcha after multiple attempts")
            context.close()
            browser.close()
            return
        # Final check for any remaining submit button
        try:
            submit_btn = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="Submit")
            if submit_btn.is_visible():
                print("LOG:Submit button still visible, clicking again")
                human_move_and_click(page, submit_btn)
                human_delay(1.0, 2.0)
        except Exception:
            pass
        # After solving, check if the captcha iframe comes back
        try:
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=7000)
            print("LOG:Captcha iframe reappeared after solving, starting another captcha loop.")
            continue
        except Exception:
            print("LOG:Captcha iframe did not reappear after solving.")
            break

    print("LOG:Waiting for redirect")
    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    print("LOG:Account created successfully!")
    print(f"LOG:Username: {username}")
    print(f"LOG:Password: {password}")
    # Save account to database
    insert_account(email, password, username)

if __name__ == "__main__":
    init_accounts_db()
    try:
        with Stealth().use_sync(sync_playwright()) as playwright:
            run(playwright)
    except Exception as e:
        print(f"LOG: Process terminated: {type(e).__name__}: {e}")
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"LOG: {line}")
        raise
    else:
        print("LOG: Process finished normally.")