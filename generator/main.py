import random
def get_few_shot_examples(n=10):
    samples = []
    try:
        with open(os.path.join(TRAINING_DATA_DIR, 'captcha_samples.jsonl'), 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    obj = json.loads(line)
                    if obj.get('instruction') and obj.get('answer'):
                        samples.append((obj['instruction'], obj['answer']))
                except Exception:
                    continue
        if len(samples) > n:
            return random.sample(samples, n)
        return samples
    except Exception as e:
        print(f"WARN: Could not load few-shot examples: {e}")
        return []
COMMON_TWO_LETTER_WORDS = {'in', 'to', 'of', 'on', 'at', 'by', 'up', 'do', 'go', 'so', 'be', 'he', 'we', 'it', 'is', 'as', 'or', 'an', 'us', 'my', 'no', 'me', 'hi', 'ok', 'if'}
COMMON_THREE_LETTER_WORDS = {
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'has', 'had', 'her', 'his', 'was', 'all', 'any', 'can', 'may', 'see', 'use', 'get', 'its', 'now', 'how', 'why', 'yes', 'off', 'out', 'own', 'two', 'too', 'one', 'red', 'big', 'new', 'old', 'put', 'set', 'let', 'run', 'sit', 'pay', 'win', 'bin', 'din', 'fin', 'gin', 'pin', 'sin', 'tin', 'son', 'ton', 'don', 'con', 'bon', 'non', 'ion'
}

def fix_ocr_text(text: str) -> str:
    if not text:
        return text
    text = re.sub(r'\b(to)([a-z])(in)\b', r'\1 \2 \3', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(to+)(in|on|of)\b', r'\1 \2', text, flags=re.IGNORECASE)
    text = re.sub(r'\b([a-z])(to|of|in|on)\b', r'\1 \2', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(\d+)(in|to|of|on|at|by|up)\b', r'\1 \2', text, flags=re.IGNORECASE)
    text = text.lower().strip()
    tokens = text.split()
    corrected = []
    for token in tokens:
        if len(token) == 3 and token not in COMMON_THREE_LETTER_WORDS:
            first, rest = token[0], token[1:]
            if rest in COMMON_TWO_LETTER_WORDS:
                corrected.extend([first, rest])
                continue
        corrected.append(token)
    return ' '.join(corrected)
from dotenv import load_dotenv
import random
load_dotenv()
from accounts_db import init_accounts_db, insert_account, insert_account_with_token
model_name = 'gemma3:4b'
proxy = None
import os
import time
import string
import re
import logging
from playwright.sync_api import Playwright, sync_playwright
from playwright_stealth import Stealth
from PIL import Image
import pytesseract
import tiktoken
import requests
import json
import http.client

# For email verification
from imap_tools import MailBox, AND

# Ensure generator directory exists
GENERATOR_DIR = os.path.join(os.getcwd(), 'generator')
os.makedirs(GENERATOR_DIR, exist_ok=True)

# --- Training data directory and storage ---
TRAINING_DATA_DIR = os.path.join(os.getcwd(), 'training_data')
os.makedirs(TRAINING_DATA_DIR, exist_ok=True)

def store_training_batch(samples, model_name, username):
    """Append multiple (instruction, answer) pairs to a JSONL file."""
    filepath = os.path.join(TRAINING_DATA_DIR, 'captcha_samples.jsonl')
    timestamp = time.time()
    with open(filepath, 'a', encoding='utf-8') as f:
        for instruction, answer in samples:
            record = {
                "timestamp": timestamp,
                "model_name": model_name,
                "instruction": instruction,
                "answer": answer,
                "success": True
            }
            f.write(json.dumps(record) + '\n')
# ------------------------------------------

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
            return
        element.wait_for(state="visible", timeout=5000)
        box = element.bounding_box()
        if box:
            end_x = box['x'] + random.uniform(offset, box['width'] - offset)
            end_y = box['y'] + random.uniform(offset, box['height'] - offset)
            steps = random.randint(8, 18)
            page.mouse.move(end_x, end_y, steps=steps)
            human_delay(0.1, 0.35)
            page.mouse.click(end_x, end_y)
        else:
            element.click()
    except Exception:
        try:
            element.click()
        except Exception:
            pass

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

def solve_captcha_with_ollama(model_name, extracted_text):
    MODEL_PARAMS = {
        'llama3.2:3b': {'temperature': 0, 'top_p': 1, 'num_predict': 32},
        'qwen2.5:3b': {'temperature': 0.8, 'top_p': 0.9, 'num_predict': 48},
        # 'deepseek-r1:latest': {'temperature': 0.6, 'top_p': 0.9, 'num_predict': 64},
        'deepseek-r1:1.5b': {'temperature': 0.3, 'top_p': 0.9, 'num_predict': 32},
        'gpt-oss:20b': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'mistral:latest': {'temperature': 0.7, 'top_p': 0.95, 'num_predict': 64},
        'mistral-nemo:custom': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'bakllava:latest': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'smollm2:135m': {'temperature': 0.8, 'top_p': 0.9, 'num_predict': 48},
    }
    params = MODEL_PARAMS.get(model_name, {})
    # Add few-shot examples from training data
    few_shot = get_few_shot_examples(10)
    examples_str = ""
    for instr, ans in few_shot:
        examples_str += f"Instruction: {instr}\nOutput: {ans}\n\n"
    if examples_str:
        prompt = f"System: You solve text transformation puzzles. Given an instruction, output only the transformed word or number. You are extremely precise and accurate. No explanations.Make sure not to add extra text, if asked to replace a character, replace only the character(s) asked. No extra text. Sometimes no changes need to be made so read question carefully.\n\nNow solve:\nInstruction: {extracted_text}\n"
    else:
        prompt = f"System: You solve text transformation puzzles. Given an instruction, output only the transformed word or number. You are extremely precise and accurate. No explanations.Make sure not to add extra text, if asked to replace a character, replace only the character(s) asked. No extra text. Sometimes no changes need to be made so read question carefully.\n\nInstruction: {extracted_text}\n"
    payload = {
        "model": model_name,
        "prompt": prompt,
        **params
    }
    try:
        conn = http.client.HTTPConnection("78.46.88.140", 11434, timeout=60)
        headers = {"Content-Type": "application/json"}
        conn.request("POST", "/api/generate", body=json.dumps(payload), headers=headers)
        resp = conn.getresponse()
        data = resp.read().decode()
        status = resp.status
        conn.close()
        lines = [line for line in data.splitlines() if line.strip()]
        if not lines:
            print(f"DEBUG: Ollama empty response, status {status}, raw: {data}")
            return "I couldn't solve the captcha."
        # Collect all streamed responses
        responses = []
        for line in lines:
            try:
                obj = json.loads(line)
                if 'response' in obj:
                    responses.append(obj['response'])
            except Exception as e:
                print(f"DEBUG: Ollama JSON decode error: {e} for line: {line}")
        answer = ''.join(responses).strip()
        if answer:
            return extract_answer_from_response(answer)
        else:
            print(f"DEBUG: Ollama no answer, status {status}, raw: {data}")
            return "I couldn't solve the captcha."
    except Exception as e:
        print(f"DEBUG: Ollama HTTP error: {e}")
        return "I couldn't solve the captcha."

def solve_captcha_loop(page, model_name, username):
    """Handle captcha solving. Returns (success, list_of_pairs)."""
    max_attempts = 50
    attempt = 0
    fail_count = 0
    max_fail_count = 3
    all_pairs = []   # store (instruction, answer) from each complete round

    try:
        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
        time.sleep(1)
    except Exception:
        print("DEBUG:About button not found, continuing")

    try:
        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
        time.sleep(1)
    except Exception:
        print("DEBUG: Accessibility Challenge button not found or not clickable after Menu button.")

    while attempt < max_attempts:
        attempt += 1
        if attempt == 1:
            print(f"DEBUG:Solving captcha...")
        # Wait for iframe to be present and accessible
        print(f"LOG: Solving captcha, attempt {attempt}/{max_attempts}")
        try:
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=10000)
        except Exception:
            print("DEBUG: [solve_captcha_loop] Captcha iframe not found, skipping attempt.")
            continue

        # Take screenshot and OCR
        captcha_filename = f"captcha_{username}_{attempt}.png"
        captcha_path = os.path.join(GENERATOR_DIR, captcha_filename)
        try:
            page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").screenshot(path=captcha_path)
        except Exception as e:
            print(f"DEBUG: Failed to capture captcha text: {e}")
            time.sleep(2)
            continue

        compressed_filename = f"captcha_{username}_{attempt}_compressed.jpg"
        compressed_path = os.path.join(GENERATOR_DIR, compressed_filename)
        with Image.open(captcha_path) as img:
            rgb_img = img.convert("RGB")
            rgb_img.save(compressed_path, format="JPEG", quality=60)
        os.remove(captcha_path)

        extracted_text = pytesseract.image_to_string(Image.open(compressed_path))
        fixed_text = fix_ocr_text(extracted_text.strip())
        if attempt == 1:
            print(f"DEBUG: OCR extracted text: {extracted_text.strip()}")
            print(f"DEBUG: Fixed OCR text: {fixed_text}")

        answer = solve_captcha_with_ollama(model_name, fixed_text)
        if answer == "I couldn't solve the captcha.":
            fail_count += 1
            print(f"LOG: Ollama failed to solve captcha (fail count {fail_count})")
            if fail_count >= max_fail_count:
                print("LOG: Too many consecutive Ollama failures, aborting captcha solve loop.")
                return False, []
            time.sleep(2)
        else:
            fail_count = 0
            # Only store pairs that were successfully answered (not failure)
            all_pairs.append((extracted_text.strip(), answer))

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
                if attempt == 1:
                    print("DEBUG: Iframe still present, may need another round")
                # Check if text-text element is still visible, if not, we need to press the accessibility button
                try:
                    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").wait_for(state="visible", timeout=3000)
                except Exception:
                    print("DEBUG: Text element not visible, trying to click accessibility button again")
                    try:
                        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
                        time.sleep(1)
                        page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
                        print("DEBUG: Clicked Accessibility Challenge button again.")
                        time.sleep(1)
                    except Exception:
                        print("DEBUG: Accessibility Challenge button not found on second attempt.")
            except Exception:
                print("LOG:Captcha solved!")
                # Store the entire batch of pairs from this solving session
                store_training_batch(all_pairs, model_name, username)
                return True, all_pairs

        except Exception as e:
            print(f"DEBUG: Error during captcha interaction: {e}")
            time.sleep(2)
            continue

    print("LOG: Max attempts reached, captcha not solved")
    return False, []

def run(playwright: Playwright) -> None:
    logging.basicConfig(level=logging.INFO)

    print(f"LOG:Launching browser")
    proxyNum = random.randint(1,100)
    proxy = f"http://toki0179datacenter-{proxyNum}:bossandy12@p.webshare.io:80/"
    launch_args = {}
    proxy_url = proxy
    print(f"DEBUG:Using proxy URL: {proxy_url}")
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
            print(f"DEBUG:Using proxy with auth.")
        else:
            print(f"DEBUG:Using proxy without auth.")
    browser = playwright.chromium.launch(headless=False, **launch_args)
    print("DEBUG:Creating browser context")
    
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
    print(f"DEBUG:Using user agent: {user_agent}")
    print(f"DEBUG:Using viewport: {viewport}")
    print(f"DEBUG:Using locale: {context_args['locale']}, timezone: {context_args['timezone_id']}")
    
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

    print("LOG:Opening new page")
    page = context.new_page()
    Stealth().apply_stealth_sync(page)

    print("LOG:Going to Discord register page")
    page.goto("https://discord.com/register")
    human_delay(1.0, 2.5)
    page.mouse.wheel(0, random.randint(50, 150))
    human_delay(0.5, 1.0)

    print("DEBUG:Ensuring first registration input is ready")
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
            print(f"DEBUG:Error checking field: {e}")

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
    
    # Solve captcha, and if the iframe reappears after a solve, repeat the loop
    last_successful_pairs = []

    while True:
        solved, pairs = solve_captcha_loop(page, model_name, username)
        if not solved:
            print("LOG:Failed to solve captcha after multiple attempts")
            # Clean up captcha images before returning
            for fname in os.listdir(GENERATOR_DIR):
                if fname.startswith("captcha_") and (fname.endswith(".png") or fname.endswith("_compressed.jpg")):
                    try:
                        os.remove(os.path.join(GENERATOR_DIR, fname))
                    except Exception as e:
                        print(f"WARN: Could not delete {fname}: {e}")
            context.close()
            browser.close()
            return
        # Save last 3 pairs from this successful captcha solve
        if pairs:
            last_successful_pairs = pairs[-3:] if len(pairs) >= 3 else pairs
        # Final check for any remaining submit button
        try:
            submit_btn = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="Submit")
            if submit_btn.is_visible():
                print("DEBUG:Submit button still visible, clicking again")
                human_move_and_click(page, submit_btn)
                human_delay(1.0, 2.0)
        except Exception:
            pass
        # After solving, check if the captcha iframe comes back
        try:
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=7000)
            print("DEBUG:Captcha iframe reappeared after solving, starting another captcha loop.")
            continue
        except Exception:
            print("DEBUG:Captcha iframe did not reappear after solving.")
            break

    # Clean up captcha images after captcha loop (success)
    for fname in os.listdir(GENERATOR_DIR):
        if fname.startswith("captcha_") and (fname.endswith(".png") or fname.endswith("_compressed.jpg")):
            try:
                os.remove(os.path.join(GENERATOR_DIR, fname))
            except Exception as e:
                print(f"WARN: Could not delete {fname}: {e}")

    print("LOG:Waiting for redirect")
    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    time.sleep(5)
    # Get the token from local storage window.webpackChunkdiscord_app.push([[Symbol()],{},o=>{for(let e of Object.values(o.c))try{if(!e.exports||e.exports===window)continue;e.exports?.getToken&&(token=e.exports.getToken());for(let o in e.exports)e.exports?.[o]?.getToken&&"IntlMessagesProxy"!==e.exports[o][Symbol.toStringTag]&&(token=e.exports[o].getToken())}catch{}}]),window.webpackChunkdiscord_app.pop(),token;
    JS_SNIPPET = """
    let token;
        window.webpackChunkdiscord_app.push([[Symbol()],{},o=>{
            for(let e of Object.values(o.c)) try {
                if(!e.exports||e.exports===window) continue;
                e.exports?.getToken&&(token=e.exports.getToken());
                for(let o in e.exports) e.exports?.[o]?.getToken&&"IntlMessagesProxy"!==e.exports[o][Symbol.toStringTag]&&(token=e.exports[o].getToken())
            } catch {}
        }]);
        window.webpackChunkdiscord_app.pop();
        token;
    """
    token = page.evaluate(JS_SNIPPET)

    # Save account to database with token
    # try:
    #     from accounts_db import insert_account_with_token
    #     insert_account_with_token(email, password, username, token)
    #     print("LOG:Account with token saved to database.")
    # except Exception as e:
    #     print(f"WARN: Could not save account with token: {e}")

    print("LOG:Account created successfully!")
    print(f"LOG:Username: {username}")
    print(f"LOG:Password: {password}")
    print(f"LOG:Email: {email}")
    print(f"LOG:Token: {token}")


    # Email verification logic using mail.shady.gg and shady@shady.gg
    print("LOG:Checking for verification email...")
    verification_found = False
    try:
        with MailBox('mail.shady.gg').login('shady@shady.gg', '73,GaTeNt,{', 'INBOX') as mailbox:
            # Search for unread emails sent to the generated email
            for msg in mailbox.fetch(AND(to=email, seen=False)):
                print(f"Subject: {msg.subject}")
                print(f"Body: {msg.text}")
                # Add your verification logic here (e.g., extract link/code and visit it)
                # Find the verification link in the email body needs to include https://click.discord.com/ls/*
                verification_link = None
                for line in msg.text.splitlines():
                    if "https://click.discord.com/ls/" in line:
                        verification_link = line.strip()
                        # Make sure to remove "Verify Email: " prefix if present
                        verification_link = re.sub(r'(?i)^verify email:\s*', '', verification_link)
                        break
                if verification_link:
                    print(f"LOG:Found verification link: {verification_link}")
                    # Visit the link in the same browser context to complete verification
                    verification_page = context.new_page()
                    Stealth().apply_stealth_sync(verification_page)
                    verification_page.goto(verification_link)
                    # If text on the page says "Email Verified" or similar, we can consider it successful
                    try:
                        verification_page.wait_for_selector("text=/.*email verified.*/i", timeout=15000)
                        print("LOG:Email verification confirmed on page.")
                        # Click the continue button if it exists
                        try:
                            continue_btn = verification_page.get_by_role("button", name="Continue")
                            if continue_btn.is_visible():
                                human_move_and_click(verification_page, continue_btn)
                                human_delay(1.0, 2.0)
                        except Exception:
                            pass
                    except Exception:
                        print("LOG:Email verification failed.")

                    print("LOG:Email verification completed successfully!")
                    # Now join server using invite link post request https://discord.com/api/v9/invites/3ECu2YcDUH
                    try:
                        if token:
                            headers = {
                                "Authorization": token,
                                "Content-Type": "application/json",
                                "User-Agent": user_agent
                            }
                            join_url = "https://discord.com/api/v9/invites/3ECu2YcDUH"
                            import requests
                            response = requests.post(join_url, headers=headers, json={})
                            if response.status_code == 200:
                                print("LOG:Successfully joined server after verification.")
                            else:
                                print(f"LOG:Failed to join server, status: {response.status_code}, response: {response.text}")
                        else:
                            print("WARN: No token available to join server.")
                    except Exception as ex:
                        print(f"LOG:Failed to join server after verification: {ex}")
                verification_found = True
                break
        if not verification_found:
            print(f"LOG:No verification email found for {email}.")
        else:
            print(f"LOG:Verification email processed for {email}.")
    except Exception as e:
        print(f"ERROR: Email verification failed: {e}")


    # Save last 3 captcha samples only after successful login redirect
    if last_successful_pairs:
        print(f"LOG:Storing last {len(last_successful_pairs)} captcha samples after successful login redirect.")
        store_training_batch(last_successful_pairs, model_name, username)
    # Save account to database
    insert_account_with_token(email, password, username, token)

if __name__ == "__main__":
    init_accounts_db()
    try:
        with Stealth().use_sync(sync_playwright()) as playwright:
            run(playwright)
    except Exception as e:
        print(f"DEBUG: Process terminated: {type(e).__name__}: {e}")
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"DEBUG: {line}")
        raise
    else:
        print("LOG: Process finished normally.")