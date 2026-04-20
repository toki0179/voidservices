from dotenv import load_dotenv
load_dotenv()
def count_tokens(text):
    try:
        import tiktoken
        enc = tiktoken.get_encoding('cl100k_base')
        return len(enc.encode(text))
    except ImportError:
        print("[WARN] tiktoken not installed, using word count as a rough estimate. Token count may be much higher, especially for base64 data.")
        return len(text.split())
import random
import time
import string
from playwright.sync_api import Playwright, sync_playwright
from playwright_stealth import Stealth
from ollamafreeapi import OllamaFreeAPI

def random_string(length: int) -> str:
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for _ in range(length))

def human_delay(min_sec: float = 0.3, max_sec: float = 0.8) -> None:
    time.sleep(random.uniform(min_sec, max_sec))

def human_move_and_click(page, element, offset: int = 5) -> None:
    box = element.bounding_box()
    if box:
        x = box['x'] + random.uniform(offset, box['width'] - offset)
        y = box['y'] + random.uniform(offset, box['height'] - offset)
        page.mouse.move(x, y)
        human_delay(0.1, 0.3)
        page.mouse.click(x, y)
    else:
        element.click()

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
    """Open dropdown, press ArrowDown a specific number of times, then press Enter."""
    dropdown = page.get_by_text(dropdown_text)
    human_move_and_click(page, dropdown)
    human_delay(0.3, 0.6)
    for _ in range(down_presses):
        page.keyboard.press("ArrowDown")
        human_delay(0.03, 0.08)  # small delay between presses
    human_delay(0.2, 0.4)
    page.keyboard.press("Enter")
    human_delay(0.2, 0.5)

def run(playwright: Playwright) -> None:
    import logging
    client = OllamaFreeAPI()
    logger = logging.getLogger('generator')
    logging.basicConfig(level=logging.INFO)
    # Model to parameter mapping (copied from selfbot)
    MODEL_PARAMS = {
        'llama3.2:3b': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'deepseek-r1:latest': {'temperature': 0.6, 'top_p': 0.9, 'num_predict': 64},
        'gpt-oss:20b': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'mistral:latest': {'temperature': 0.7, 'top_p': 0.95, 'num_predict': 64},
        'mistral-nemo:custom': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'bakllava:latest': {'temperature': 0.7, 'top_p': 0.9, 'num_predict': 64},
        'smollm2:135m': {'temperature': 0.8, 'top_p': 0.9, 'num_predict': 48},
    }
    FORCE_PROMPT = (
        'Keep every reply to a normal Discord message length: concise, direct, and usually under 3 short sentences. '
        'Avoid bullet lists, long explanations, and essay-style responses unless the user explicitly asks for detail.'
    )
    BASE_PROMPT = ''  # Optionally load from env if desired
    _preferred_server = {}
    print("LOG:Launching browser")
    browser = playwright.chromium.launch(headless=False)
    print("LOG:Creating browser context")
    context = browser.new_context()
    name = "voidservices"
    username = f"voidserv_{random_string(5)}"
    password = random_string(10)

    print("LOG:Opening new page and applying stealth")
    page = context.new_page()
    Stealth().apply_stealth_sync(page)

    print("LOG:Going to Discord register page")
    page.goto("https://discord.com/register")
    print("LOG:Waiting after page load")
    human_delay(1.0, 2.5)
    page.mouse.wheel(0, random.randint(50, 150))
    human_delay(0.5, 1.0)

    print("LOG:Filling registration form")
    # Email
    email = f"{random_string(8)}@shady.gg"
    email_locator = page.get_by_role("textbox", name="Email")
    human_type(page, email_locator, email)

    # Display Name
    display_locator = page.get_by_role("textbox", name="Display Name")
    human_type(page, display_locator, name)

    # Username
    user_locator = page.get_by_role("textbox", name="Username")
    human_type(page, user_locator, username)

    # Password
    pass_locator = page.get_by_role("textbox", name="Password")
    human_type(page, pass_locator, password)

    print("LOG:Selecting date of birth")
    # Date of Birth – using fixed arrow press counts
    select_dropdown_with_arrows(page, "Day, Day", 19)      # 1 -> 20 = 19 presses
    select_dropdown_with_arrows(page, "Month, Month", 0)   # January is first
    select_dropdown_with_arrows(page, "Year, Year", 23)    # 23 presses (as you specified)

    print("LOG:Clicking consent checkbox")
    # Consent checkbox
    checkbox = page.locator(".consentBox_d332d2 > .checkboxOption__714a9 > .checkboxIndicator__714a9 > .checkStroke__714a9")
    human_move_and_click(page, checkbox)
    human_delay(0.5, 1.0)

    print("LOG:Clicking create account button")
    # Create Account button
    create_btn = page.get_by_role("button", name="Create Account")
    human_move_and_click(page, create_btn)

    print("LOG:Waiting for hCaptcha to load")
    # Wait for hCaptcha to load
    page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=15000)
    time.sleep(2)  # Extra wait to ensure captcha is fully interactive
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
    time.sleep(1)
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
    time.sleep(1)

    print("LOG:Taking captcha screenshot and running OCR")
    # Screenshot captcha for manual solving
    import os
    path_name = f"captcha_{username}.png"
    page.locator("iframe[title=\"hCaptcha challenge\"]").screenshot(path=path_name)
    # Compress the image before base64 encoding
    from PIL import Image
    import base64
    import io
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = os.environ.get('TESSERACT_CMD', '/usr/bin/tesseract')
    compressed_path = f"captcha_{username}_compressed.jpg"
    with Image.open(path_name) as img:
        rgb_img = img.convert("RGB")
        rgb_img.save(compressed_path, format="JPEG", quality=60)
    # Delete the original screenshot after compressing
    try:
        os.remove(path_name)
    except Exception as e:
        logger.warning(f"Could not delete {path_name}: {e}")

    # OCR extraction
    extracted_text = pytesseract.image_to_string(Image.open(compressed_path))
    print(f"LOG:OCR extracted text: {extracted_text.strip()}")

    # Get all available models and try each in order until one succeeds
    available_models = client.list_models()
    print(f"LOG:Available models: {available_models}")
    answer = None
    last_error = None
    print("LOG:Solving captcha with LLM")
    for model_name in available_models:
        params = MODEL_PARAMS.get(model_name, {})
        servers = client.get_model_servers(model_name)
        print(f"LOG:Trying model: {model_name} with servers: {servers}")
        if not servers:
            logger.warning(f"No servers found for model {model_name}, skipping.")
            continue
        preferred_url = _preferred_server.get(model_name)
        if preferred_url:
            servers.sort(key=lambda server: server.get('url') != preferred_url)
        import random as _random
        _random.shuffle(servers)
        # Build prompt: instruct model to output ONLY the answer
        full_prompt = (
            "You are solving a captcha. Output ONLY the answer, with no explanation, no punctuation, and no extra text. "
            "If the answer is a number, output only the number. If it is a word, output only the word. Do not say anything else.\n"
            f"Captcha: {extracted_text.strip()}"
        )
        token_count = count_tokens(full_prompt)
        print(f"LOG:Prompt token estimate: {token_count}")
        for server in servers:
            url = server.get('url')
            if not url:
                continue
            try:
                from ollama import Client as OllamaClient
                client_ollama = OllamaClient(host=url, timeout=15)
                request = client.generate_api_request(model=model_name, prompt=full_prompt, **params)
                request['stream'] = False
                response = client_ollama.generate(**request)
                text = getattr(response, 'response', None)
                if not text and isinstance(response, dict):
                    text = response.get('response')
                if text:
                    _preferred_server[model_name] = url
                    answer = text.strip()
                    print(f"LOG:Model {model_name} succeeded with server {url}")
                    break
                last_error = RuntimeError('Empty response body from upstream server')
            except Exception as server_error:
                last_error = server_error
                print(f"LOG:Server {url} for model {model_name} failed: {server_error}")
        if answer:
            break
    if not answer:
        print(f"LOG:All models and servers failed. Last error: {last_error}")
        answer = "I couldn't generate a response right now."
    print(f"LOG:Final answer: {answer}")
    # Loop to handle multi-page captchas
    print("LOG:Starting captcha solve loop (multi-page support)")
    while True:
        captcha_input = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("textbox")
        print("LOG:Filling captcha input")
        human_type(page, captcha_input, answer)
        # Submit captcha using a button that works for all pages
        # Try to find a 'Next Challenge, page X of' button, fallback to 'Submit' if not found
        print("LOG:Submitting captcha (Next/Submit button)")
        content_frame = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame
        next_btn = None
        try:
            # Use regex to match any 'Next Challenge, page X of' button
            next_btn = content_frame.locator('role=button')
            if next_btn.count() > 0 and next_btn.first.is_visible():
                human_move_and_click(page, next_btn.first)
            else:
                raise Exception('No Next Challenge button visible')
        except Exception:
            # Fallback to 'Submit' button
            submit_btn = content_frame.get_by_role("button", name="Submit")
            human_move_and_click(page, submit_btn)
        print("LOG:Waiting after captcha submit")
        human_delay(1.0, 2.0)
        # Check for another captcha page
        print("LOG:Checking for next captcha page or completion")
        try:
            # Wait for either a new captcha or the challenge to disappear
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=5000)
            # If still present, re-screenshot, OCR, and solve again
            print("LOG:Taking screenshot and running OCR for next captcha page")
            path_name = f"captcha_{username}_next.png"
            page.locator("iframe[title=\"hCaptcha challenge\"]").screenshot(path=path_name)
            with Image.open(path_name) as img:
                rgb_img = img.convert("RGB")
                rgb_img.save(compressed_path, format="JPEG", quality=60)
            # Delete the screenshot after compressing
            try:
                os.remove(path_name)
            except Exception as e:
                logger.warning(f"Could not delete {path_name}: {e}")
            extracted_text = pytesseract.image_to_string(Image.open(compressed_path))
            print(f"LOG:OCR extracted text (next): {extracted_text.strip()}")
            # Re-run LLM solve
            answer = None
            last_error = None
            for model_name in available_models:
                params = MODEL_PARAMS.get(model_name, {})
                servers = client.get_model_servers(model_name)
                print(f"LOG:Trying model: {model_name} with servers: {servers}")
                if not servers:
                    logger.warning(f"No servers found for model {model_name}, skipping.")
                    continue
                preferred_url = _preferred_server.get(model_name)
                if preferred_url:
                    servers.sort(key=lambda server: server.get('url') != preferred_url)
                import random as _random
                _random.shuffle(servers)
                # Build prompt: instruct model to output ONLY the answer
                full_prompt = (
                    "You are solving a captcha. Output ONLY the answer, with no explanation, no punctuation, and no extra text. "
                    "If the answer is a number, output only the number. If it is a word, output only the word. Do not say anything else.\n"
                    f"Captcha: {extracted_text.strip()}"
                )
                token_count = count_tokens(full_prompt)
                print(f"LOG:Prompt token estimate: {token_count}")
                for server in servers:
                    url = server.get('url')
                    if not url:
                        continue
                    try:
                        from ollama import Client as OllamaClient
                        client_ollama = OllamaClient(host=url, timeout=15)
                        request = client.generate_api_request(model=model_name, prompt=full_prompt, **params)
                        request['stream'] = False
                        response = client_ollama.generate(**request)
                        text = getattr(response, 'response', None)
                        if not text and isinstance(response, dict):
                            text = response.get('response')
                        if text:
                            _preferred_server[model_name] = url
                            answer = text.strip()
                            print(f"LOG:Model {model_name} succeeded with server {url}")
                            break
                        last_error = RuntimeError('Empty response body from upstream server')
                    except Exception as server_error:
                        last_error = server_error
                        print(f"LOG:Server {url} for model {model_name} failed: {server_error}")
                if answer:
                    break
            if not answer:
                print(f"LOG:All models and servers failed. Last error: {last_error}")
                answer = "I couldn't generate a response right now."
            print(f"LOG:Final answer: {answer}")
            print("LOG:Continuing to next captcha page")
            continue  # Loop again for next captcha page
        except Exception:
            print("LOG:Captcha challenge complete or iframe gone")
            # If iframe is gone, captcha is done
            break

    # Handle rate limiting
    print("LOG:Checking for rate limiting")
    if page.locator("text=You are being rate limited").is_visible():
        print("LOG:Rate limit detected, waiting 60 seconds...")
        page.wait_for_timeout(60000)
        print("LOG:Rate limited – please run the script again manually.")
        print("LOG:Closing browser due to rate limit")
        context.close()
        browser.close()
        return

    # Wait for successful redirect
    print("LOG:Waiting for successful redirect after registration")
    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    print("LOG:Account created successfully!")
    print(f"LOG:Username: {username}")
    print(f"LOG:Password: {password}")
    # Append credentials to a file for parent process to send at the end
    try:
        with open("generated/credentials_log.txt", "a") as f:
            f.write(f"Username: {username}\nPassword: {password}\n\n")
        print("LOG:Appended credentials to generated/credentials_log.txt")
    except Exception as e:
        print(f"LOG:Failed to append credentials: {e}")
    print("LOG:Closing browser and context")
    context.close()
    browser.close()

with Stealth().use_sync(sync_playwright()) as playwright:
    run(playwright)