from dotenv import load_dotenv
load_dotenv()
from accounts_db import init_accounts_db, insert_account
proxy = 'http://toki0179-rotate:bossandy12@p.webshare.io:80/'

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

def count_tokens(text):
    try:
        enc = tiktoken.get_encoding('cl100k_base')
        return len(enc.encode(text))
    except ImportError:
        print("[WARN] tiktoken not installed, using word count as a rough estimate.")
        return len(text.split())

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

def run(playwright: Playwright) -> None:
    OLLAMA_HOST = "http://78.46.88.140:11434/"
    client = OllamaClient(host=OLLAMA_HOST)
    logger = logging.getLogger('generator')
    logging.basicConfig(level=logging.INFO)
    MODEL_PARAMS = {
        'llama3.2:3b': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'deepseek-r1:latest': {'temperature': 0.6, 'top_p': 0.9, 'num_predict': 64},
        'gpt-oss:20b': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'mistral:latest': {'temperature': 0.7, 'top_p': 0.95, 'num_predict': 64},
        'mistral-nemo:custom': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'bakllava:latest': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'smollm2:135m': {'temperature': 0.8, 'top_p': 0.9, 'num_predict': 48},
    }

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
    browser = playwright.chromium.launch(headless=False, **launch_args)
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
    checkbox = page.locator(".consentBox_d332d2 > .checkboxOption__714a9 > .checkboxIndicator__714a9 > .checkStroke__714a9")
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

    print("LOG:Waiting for hCaptcha to load")
    page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=15000)
    time.sleep(2)
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
    time.sleep(1)
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
    time.sleep(1)

    print("LOG:Taking captcha screenshot and running OCR")
    captcha_filename = f"captcha_{username}.png"
    captcha_path = os.path.join(GENERATOR_DIR, captcha_filename)
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").screenshot(path=captcha_path)

    compressed_filename = f"captcha_{username}_compressed.jpg"
    compressed_path = os.path.join(GENERATOR_DIR, compressed_filename)
    with Image.open(captcha_path) as img:
        rgb_img = img.convert("RGB")
        rgb_img.save(compressed_path, format="JPEG", quality=60)
    os.remove(captcha_path)

    extracted_text = pytesseract.image_to_string(Image.open(compressed_path))
    print(f"LOG:OCR extracted text: {extracted_text.strip()}")

    model_name = 'deepseek-r1:1.5b'
    params = MODEL_PARAMS.get(model_name, {})
    print(f"LOG:Solving captcha")
    full_prompt = (
        "You are solving a puzzle. Do not provide reasoning, one word answer only. No 'The answer is' or 'Sure', just the answer. With no explanation or reasoning.\n"
        f"Captcha: {extracted_text.strip()}"
    )
    try:
        response = client.generate(model=model_name, prompt=full_prompt, **params)
        answer = response.get('response') if isinstance(response, dict) else getattr(response, 'response', None)
        if answer:
            answer = answer.strip()
            print(f"LOG:succeeded with answer: {answer}")
        else:
            answer = "I couldn't generate an answer right now."
    except Exception as e:
        print(f"LOG:Server error: {e}")
        answer = "I couldn't generate an answer right now."
    print(f"LOG:Final answer: {answer}")

    print("LOG:Starting captcha solve loop")
    while True:
        captcha_input = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("textbox")
        print("LOG:Filling captcha input")
        human_type(page, captcha_input, answer)
        print("LOG:Submitting captcha")
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
        print("LOG:Checking for next captcha page")
        try:
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=5000)
            print("LOG:Next captcha page detected")
            next_captcha_path = os.path.join(GENERATOR_DIR, f"captcha_{username}_next.png")
            page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").screenshot(path=next_captcha_path)
            compressed_next = os.path.join(GENERATOR_DIR, f"captcha_{username}_next_compressed.jpg")
            with Image.open(next_captcha_path) as img:
                rgb_img = img.convert("RGB")
                rgb_img.save(compressed_next, format="JPEG", quality=60)
            os.remove(next_captcha_path)
            extracted_text = pytesseract.image_to_string(Image.open(compressed_next))
            print(f"LOG:OCR extracted text (next): {extracted_text.strip()}")
            full_prompt = f"You are solving a captcha. Output ONLY the full answer.\nCaptcha: {extracted_text.strip()}"
            try:
                response = client.generate(model=model_name, prompt=full_prompt, **params)
                answer = response.get('response') if isinstance(response, dict) else getattr(response, 'response', None)
                if answer:
                    answer = answer.strip()
            except Exception as e:
                print(f"LOG:Ollama error: {e}")
                answer = "I couldn't generate a response right now."
            print(f"LOG:New answer: {answer}")
            continue
        except Exception:
            print("LOG:Captcha complete")
            break

    print("LOG:Checking for rate limiting")
    if page.locator("text=You are being rate limited").is_visible():
        print("LOG:Rate limit detected")
        page.wait_for_timeout(60000)
        context.close()
        browser.close()
        return

    print("LOG:Waiting for redirect")
    # Save final screenshot
    screenshot_filename = f"final_{username}.png"
    screenshot_path = os.path.join(GENERATOR_DIR, screenshot_filename)
    page.screenshot(path=screenshot_path, full_page=True)
    # Log relative path (from project root)
    rel_path = os.path.join('generator', screenshot_filename)
    print(f"LOG:Screenshot saved to {rel_path}")

    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    print("LOG:Account created successfully!")
    print(f"LOG:Username: {username}")
    print(f"LOG:Password: {password}")
    try:
        insert_account(email, password, username)
        print(f"LOG:Account inserted into accounts.db")
    except Exception as e:
        print(f"LOG:Failed to insert account: {e}")
    context.close()
    browser.close()

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