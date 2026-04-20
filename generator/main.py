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
from ollama import Client as OllamaClient

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
    # Use your own hosted Ollama server
    OLLAMA_HOST = "http://78.46.88.140:11434/"
    client = OllamaClient(host=OLLAMA_HOST)
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

    print("LOG:Ensuring first registration input is ready")
    page.wait_for_selector('input[name="email"]', timeout=10000)
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


    print("LOG:Verifying registration fields before continuing")
    # Check and fill any empty registration fields (ignore DOB and checkbox)
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
                print(f"LOG:Field empty, refilling: {locator}")
                human_type(page, locator, value)
        except Exception as e:
            print(f"LOG:Error checking field {locator}: {e}")

    print("LOG:Clicking create account button")
    # Create Account button
    create_btn = page.get_by_role("button", name="Create Account")
    human_move_and_click(page, create_btn)

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
    # Screenshot in the iframe by class=text-text make sure this isnt css class area to avoid extra elements and get a cleaner image for OCR
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").screenshot(path=path_name)
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
    # Use a specific model (e.g., 'mistral:latest')
    model_name = 'phi3.5:latest'
    params = MODEL_PARAMS.get(model_name, {})
    print(f"LOG:Solving captcha with LLM model: {model_name}")
    # Build prompt: instruct model to output ONLY the answer
    full_prompt = (
        "You are solving a puzzle. DO NOT REPEAT THE QUESTION. Output ONLY the full answer, with no explanation, no punctuation, and no extra text. "
        "If the answer is a number or a sequence of numbers, output the entire number or sequence exactly as shown in the captcha. If it is a word or phrase, output the entire word or phrase. Do not say anything else.\n"
        f"Captcha: {extracted_text.strip()}"
    )
    token_count = count_tokens(full_prompt)
    print(f"LOG:Prompt token estimate: {token_count}")
    try:
        response = client.generate(model=model_name, prompt=full_prompt, **params)
        answer = response.get('response') if isinstance(response, dict) else getattr(response, 'response', None)
        if answer:
            answer = answer.strip()
            print(f"LOG:Model {model_name} succeeded with answer: {answer}")
        else:
            print("LOG:No answer returned from model.")
            answer = "I couldn't generate a response right now."
    except Exception as e:
        print(f"LOG:Ollama server error: {e}")
        answer = "I couldn't generate a response right now."
    print(f"LOG:Final answer: {answer}")
    # Loop to handle multi-page captchas
    print("LOG:Starting captcha solve loop (multi-page support)")
    while True:
        captcha_input = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("textbox")
        print("LOG:Filling captcha input")
        human_type(page, captcha_input, answer)
        print("LOG:Submitting captcha (Next/Submit button)")
        content_frame = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame
        next_btn = None
        try:
            next_btn = content_frame.locator('role=button')
            if next_btn.count() > 0 and next_btn.first.is_visible():
                human_move_and_click(page, next_btn.first)
            else:
                raise Exception('No Next Challenge button visible')
        except Exception:
            submit_btn = content_frame.get_by_role("button", name="Submit")
            human_move_and_click(page, submit_btn)
        print("LOG:Waiting after captcha submit")
        human_delay(1.0, 2.0)
        print("LOG:Checking for next captcha page or completion")
        try:
            page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=5000)
            print("LOG:Taking screenshot and running OCR for next captcha page")
            path_name = f"captcha_{username}_next.png"
            page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.locator(".text-text").screenshot(path=path_name)
            with Image.open(path_name) as img:
                rgb_img = img.convert("RGB")
                rgb_img.save(compressed_path, format="JPEG", quality=60)
            try:
                os.remove(path_name)
            except Exception as e:
                logger.warning(f"Could not delete {path_name}: {e}")
            extracted_text = pytesseract.image_to_string(Image.open(compressed_path))
            print(f"LOG:OCR extracted text (next): {extracted_text.strip()}")
            # Re-run LLM solve with direct OllamaClient
            full_prompt = (
                "You are solving a captcha. Output ONLY the full answer, with no explanation, no punctuation, and no extra text. "
                "If the answer is a number or a sequence of numbers, output the entire number or sequence exactly as shown in the captcha. If it is a word or phrase, output the entire word or phrase. Do not say anything else.\n"
                f"Captcha: {extracted_text.strip()}"
            )
            token_count = count_tokens(full_prompt)
            print(f"LOG:Prompt token estimate: {token_count}")
            try:
                response = client.generate(model=model_name, prompt=full_prompt, **params)
                answer = response.get('response') if isinstance(response, dict) else getattr(response, 'response', None)
                if answer:
                    answer = answer.strip()
                    print(f"LOG:Model {model_name} succeeded with answer: {answer}")
                else:
                    print("LOG:No answer returned from model.")
                    answer = "I couldn't generate a response right now."
            except Exception as e:
                print(f"LOG:Ollama server error: {e}")
                answer = "I couldn't generate a response right now."
            print(f"LOG:Final answer: {answer}")
            print("LOG:Continuing to next captcha page")
            continue  # Loop again for next captcha page
        except Exception:
            print("LOG:Captcha challenge complete or iframe gone")
            break

    # Wait for successful redirect
    print("LOG:Waiting for successful redirect after registration")
    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    print("LOG:Account created successfully!")
    print(f"LOG:Username: {username}")
    print(f"LOG:Password: {password}")
    # Generate a file with the credentials overwriting an old one if it exists, and creating one if it doesnt, in the format "username:password", the name should a randomly generated string 5 characters long txt, and the file should be saved in generated/
    credentials_filename = f"generated/{random_string(8)}.txt"
    try:
        with open(credentials_filename, "w") as f:
            f.write(f"{username}:{email}:{password}")
        print(f"LOG:Credentials saved to {credentials_filename}")
    except Exception as e:
        print(f"LOG:Failed to append credentials: {e}")
    print("LOG:Closing browser and context")
    context.close()
    browser.close()

# ------------------------------------------------------------
# Main execution with comprehensive error logging on process exit
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        with Stealth().use_sync(sync_playwright()) as playwright:
            run(playwright)
    except Exception as e:
        # Print the error in the required "LOG: {error logs}" format
        print(f"LOG: Process terminated due to an exception: {type(e).__name__}: {e}")
        # Optionally print traceback for debugging (still in LOG format)
        import traceback
        print("LOG: Full traceback:")
        for line in traceback.format_exc().splitlines():
            print(f"LOG: {line}")
        # Re-raise if you want the script to exit with non-zero code
        raise
    else:
        print("LOG: Process finished normally.")