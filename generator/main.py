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
    client = OllamaFreeAPI()
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    name = "voidservices"
    username = f"voidserv_{random_string(5)}"
    password = random_string(10)

    page = context.new_page()
    Stealth().apply_stealth_sync(page)

    page.goto("https://discord.com/register")
    human_delay(1.0, 2.5)
    page.mouse.wheel(0, random.randint(50, 150))
    human_delay(0.5, 1.0)

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

    # Date of Birth – using fixed arrow press counts
    select_dropdown_with_arrows(page, "Day, Day", 19)      # 1 -> 20 = 19 presses
    select_dropdown_with_arrows(page, "Month, Month", 0)   # January is first
    select_dropdown_with_arrows(page, "Year, Year", 23)    # 23 presses (as you specified)

    # Consent checkbox
    checkbox = page.locator(".consentBox_d332d2 > .checkboxOption__714a9 > .checkboxIndicator__714a9 > .checkStroke__714a9")
    human_move_and_click(page, checkbox)
    human_delay(0.5, 1.0)

    # Create Account button
    create_btn = page.get_by_role("button", name="Create Account")
    human_move_and_click(page, create_btn)

    # Wait for hCaptcha to load
    page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=15000)
    time.sleep(2)  # Extra wait to ensure captcha is fully interactive
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("button", name="About hCaptcha &").click()
    time.sleep(1)
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_text("Accessibility Challenge").click()
    time.sleep(1)

    # Screenshot captcha for manual solving
    path_name = f"captcha_{username}.png"
    page.locator("iframe[title=\"hCaptcha challenge\"]").screenshot(path=path_name)
    # Convert the image to base64 for API submission
    import base64
    with open(path_name, "rb") as img_file:
        img_base64 = base64.b64encode(img_file.read()).decode("utf-8")

    model_name = 'bakllava:latest'
    servers = client.get_model_servers(model_name)
    print(f"Available servers for {model_name}: {servers}")
    if not servers:
        print(f"No servers found for model {model_name}")
        context.close()
        browser.close()
        return
    # Use the first (fastest/closest) server
    server_url = servers[0]['url']
    prompt = f"Solve this puzzle and return the numerical answer only. Here is the captcha image in base64 format: {img_base64}"
    # Use stream_chat for streaming logs and final output
    print("Streaming response from Ollama API:")
    stream = client.stream_chat(prompt, model=model_name, temperature=0.7, num_predict=16)
    answer_chunks = []
    for chunk in stream:
        print(chunk, end='', flush=True)
        answer_chunks.append(chunk)
    answer = ''.join(answer_chunks)
    print(f"\nFinal answer: {answer}")
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("textbox", name="Please use only numbers in").click()
    page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame.get_by_role("textbox", name="Please use only numbers in").fill(answer.strip())
    # Handle rate limiting
    if page.locator("text=You are being rate limited").is_visible():
        print("Rate limit detected, waiting 60 seconds...")
        page.wait_for_timeout(60000)
        print("Rate limited – please run the script again manually.")
        context.close()
        browser.close()
        return

    # Wait for successful redirect
    page.wait_for_url("https://discord.com/channels/@me", timeout=60000)
    print("Account created successfully!")
    print(f"Username: {username}")
    print(f"Password: {password}")

    context.close()
    browser.close()

with Stealth().use_sync(sync_playwright()) as playwright:
    run(playwright)