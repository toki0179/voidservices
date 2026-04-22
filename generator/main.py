from dotenv import load_dotenv
load_dotenv()
from accounts_db import init_accounts_db, insert_account
proxy = 'http://toki0179-DE-rotate:bossandy12@p.webshare.io:80'
# proxy = None

import os
import random
import time
import string
import re
import logging
from playwright.sync_api import Playwright, sync_playwright
from playwright_stealth import Stealth
from ollama import Client as OllamaClient
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
            x = box['x'] + random.uniform(offset, box['width'] - offset)
            y = box['y'] + random.uniform(offset, box['height'] - offset)
            page.mouse.move(x, y)
            human_delay(0.1, 0.3)
            page.mouse.click(x, y)
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
    human_delay(0.1, 0.3)
    page.keyboard.press("Control+A")
    human_delay(0.05, 0.1)
    page.keyboard.press("Delete")
    human_delay(0.1, 0.2)
    for ch in text:
        page.keyboard.type(ch, delay=random.uniform(*delay_range))
        human_delay(0.02, 0.07)

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

def solve_captcha_with_ollama(client, model_name, extracted_text):
    prompt = f"""
    You are a precise assistant. Given an instruction like "Change only the first occurrence of X to Y in WORD", output the transformed word with EXACTLY the same letters except the specified change. Do not delete or shift any letters. Do not output anything else.
    Examples:
    - "Change only the first occurrence of i to x in shipping" -> shxpping
    - "Change only the first occurrence of a to b in banana" -> bbnaana
    - "Replace the second 'l' with 'p' in hello" -> heplo
    - "Change the last letter of hello to x" -> hellx
    Now follow exactly. Output only the answer.
    {extracted_text}
    """
    try:
        response = client.generate(model=model_name, prompt=prompt)
        if hasattr(response, 'response'):
            raw = response.response
        elif isinstance(response, dict):
            raw = response.get('response', '')
        else:
            raw = str(response)
        
        print(f"LOG: Raw Ollama response: {raw[:200]}")
        if raw:
            answer = extract_answer_from_response(raw)
            if answer:
                return answer
            else:
                return raw.strip()
        else:
            return "I couldn't generate an answer right now."
    except Exception as e:
        print(f"LOG: Ollama error: {e}")
        return "I couldn't generate an answer right now."

def solve_captcha_loop(page, client, model_name, username):
    """Handle captcha solving including potential reopen/reload of iframe."""
    max_attempts = 50
    attempt = 0
    
    while attempt < max_attempts:
        attempt += 1
        print(f"LOG: Captcha solving attempt {attempt}")

        # Wait for iframe to be present and accessible
        iframe_found = False
        for _ in range(10):  # Try for up to 10 seconds
            try:
                page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=1000)
                iframe_found = True
                break
            except Exception:
                print("LOG: [solve_captcha_loop] Captcha iframe not found, waiting...")
                # Attempt to click the submit registration button if present
                try:
                    submit_btn = page.get_by_role("button", name="Create Account")
                    if submit_btn.is_visible():
                        print("LOG: [solve_captcha_loop] Clicking Create Account button while waiting for captcha iframe...")
                        human_move_and_click(page, submit_btn)
                        human_delay(0.5, 1.0)
                except Exception:
                    pass
                time.sleep(1)
        if not iframe_found:
            print("LOG: [solve_captcha_loop] Captcha iframe did not appear after waiting, retrying...")
            continue

        # Always try to enable accessibility mode after iframe appears
        try:
            frame = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame
            acc_btn = frame.get_by_text("Accessibility Challenge")
            if acc_btn.is_visible():
                acc_btn.click(timeout=3000)
                print("LOG: Clicked Accessibility Challenge button to enable accessibility mode.")
                time.sleep(1)
            else:
                print("LOG: Accessibility Challenge button not visible, maybe already in accessibility mode.")
        except Exception:
            print("LOG: Accessibility Challenge button not found or not clickable, maybe already on captcha or in accessibility mode.")

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
                else:
                    raise Exception('No button')
            except Exception:
                submit_btn = content_frame.get_by_role("button", name="Submit")
                human_move_and_click(page, submit_btn)

            human_delay(1.0, 2.0)

            # Check if iframe disappears (captcha solved or closed)
            iframe_still_present = True
            try:
                page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=5000)
                print("LOG: Iframe still present, may need another round or iframe may have been reset")
            except Exception:
                print("LOG: Iframe disappeared - captcha solved or closed")
                return True

            # If iframe is still present, check if it was reset (closed and reopened)
            # Wait for a short period to see if iframe disappears and reappears
            for _ in range(5):
                if not page.locator("iframe[title=\"hCaptcha challenge\"]").is_visible():
                    print("LOG: Captcha iframe closed, waiting for it to reopen...")
                    # Wait for iframe to reappear
                    for _ in range(10):
                        try:
                            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=1000)
                            print("LOG: Captcha iframe reopened, continuing...")
                            break
                        except Exception:
                            time.sleep(1)
                    break
                time.sleep(1)

        except Exception as e:
            print(f"LOG: Error during captcha interaction: {e}")
            time.sleep(2)
            continue

    print("LOG: Max attempts reached, captcha not solved")
    return False

def run(playwright: Playwright) -> None:
    OLLAMA_HOST = "http://78.46.88.140:11434/"
    client = OllamaClient(host=OLLAMA_HOST)
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
    if proxy_username and proxy_password:
        context = browser.new_context(http_credentials={"username": proxy_username, "password": proxy_password})
    else:
        context = browser.new_context()
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
    try:
        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
        time.sleep(1)
    except Exception:
        print("LOG:About button not found, continuing")
    
    model_name = 'gemma2:2b'
    
    # Solve captcha with retry on close/reopen
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

    print("LOG:Waiting for redirect")
    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    print("LOG:Account created successfully!")
    print(f"LOG:Username: {username}")
    print(f"LOG:Password: {password}")

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