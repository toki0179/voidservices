"""
hCaptcha Trainer – Fast but stable (no aggressive reloads)
- No humanisation.
- Uses deepseek-r1:7b.
- Retries Ollama failures.
- After success, clicks "New Challenge" instead of full page reload.
- Live logs each fixed Q&A.
"""

import time
import re
import os
import json
import http.client
from playwright.sync_api import sync_playwright
from PIL import Image
import pytesseract

MODEL_NAME = 'gemma3:4b'
HEADLESS = True
DEMO_URL = "https://accounts.hcaptcha.com/demo?sitekey=4c672d35-0701-42b2-88c3-78380b0db560"

TRAINING_DATA_DIR = os.path.join(os.getcwd(), 'training_data')
os.makedirs(TRAINING_DATA_DIR, exist_ok=True)

def store_training_batch(samples, model_name):
    if not samples:
        return
    filepath = os.path.join(TRAINING_DATA_DIR, 'captcha_samples.jsonl')
    timestamp = time.time()
    with open(filepath, 'a', encoding='utf-8') as f:
        for instruction, answer in samples:
            clean_answer = re.sub(r'[^a-zA-Z0-9]', '', answer)
            record = {
                "timestamp": timestamp,
                "model_name": model_name,
                "instruction": instruction,
                "answer": clean_answer,
                "success": True,
                "source": "hcaptcha_demo_fast"
            }
            f.write(json.dumps(record) + '\n')

# ----------------------------------------------------------------------
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

# ----------------------------------------------------------------------
def solve_with_ollama(instruction, retries=2):
    prompt = f"""Solve text puzzle. Output only the transformed word/number.
Examples:
"Change first 'a' to 'b' in banana" -> "bbnana"
"If the last letter is h change h to p in scottish." -> "scottisp"
"If last letter of dictionary is o, change it to a." -> "dictionary"
"replace only the first occurrence of n with t in michigan." -> "michigat"
"Replace last '1' with '2' in 621761" -> "621762"
"Replace first 'c' with 'z' in recently" -> "rezently"

Instruction: {instruction}
"""
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "temperature": 0.2,
        "num_predict": 32,
        "stream": False
    }
    for attempt in range(retries + 1):
        try:
            conn = http.client.HTTPConnection("localhost", 11434, timeout=15)
            conn.request("POST", "/api/generate", body=json.dumps(payload), headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            data = resp.read().decode()
            conn.close()
            if resp.status == 200:
                obj = json.loads(data)
                answer = obj.get('response', '').strip()
                if answer:
                    tokens = answer.split()
                    if tokens:
                        last = tokens[-1]
                        return re.sub(r'[^a-zA-Z0-9]', '', last)
            time.sleep(1)
        except:
            time.sleep(1)
    return ""

# ----------------------------------------------------------------------
def is_iframe_present(page):
    try:
        return page.locator("iframe[title=\"hCaptcha challenge\"]").count() > 0
    except:
        return False

def is_success(page):
    try:
        return page.get_by_text(re.compile(r"Success", re.I)).count() > 0
    except:
        return False

def enable_accessibility(page):
    try:
        frame = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame
        frame.get_by_role("button", name="About hCaptcha &").click()
        time.sleep(0.5)
        frame.get_by_text("Accessibility Challenge").click()
        time.sleep(0.5)
    except:
        pass

def click_new_challenge(page):
    """Instead of reloading the page, click the 'New Challenge' button on the demo."""
    try:
        page.locator("button:has-text('New Challenge')").click()
        time.sleep(1)
        return True
    except:
        return False

# ----------------------------------------------------------------------
def solve_one_session(page, session_id):
    pairs = []
    try:
        page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=10000)
    except:
        return False, []
    enable_accessibility(page)
    question_num = 0
    while True:
        if not is_iframe_present(page):
            return False, []
        if is_success(page):
            return True, pairs[-3:] if len(pairs) >= 3 else pairs
        try:
            frame = page.locator("iframe[title=\"hCaptcha challenge\"]").content_frame
            q = frame.locator(".text-text")
            q.wait_for(state="visible", timeout=6000)
        except:
            return False, []
        img_path = f"temp_{session_id}.png"
        q.screenshot(path=img_path)
        with Image.open(img_path) as img:
            img = img.convert("RGB")
            img.save(img_path, "JPEG", quality=60)
        raw = pytesseract.image_to_string(Image.open(img_path)).strip()
        os.remove(img_path)
        instr = fix_ocr_text(raw)          # ← converted question
        answer = solve_with_ollama(instr)
        if answer == "I couldn't solve the captcha.":
            return False, []
        question_num += 1
        # Live log: show the final fixed instruction and the answer
        print(f"[Session {session_id}, Q#{question_num}] Q (fixed): {instr}")
        print(f"                           A: {answer}")
        pairs.append((instr, answer))
        try:
            frame.get_by_role("textbox").fill(answer)
            btn = frame.locator(".button-submit.button")
            if btn.count() == 0:
                btn = frame.locator('button:visible')
            btn.first.click()
            time.sleep(0.8)
        except:
            return False, []
        for _ in range(6):
            if is_success(page):
                return True, pairs[-3:] if len(pairs) >= 3 else pairs
            if not is_iframe_present(page):
                return False, []
            time.sleep(0.5)

# ----------------------------------------------------------------------
def run():
    print("Fast hCaptcha Trainer (deepseek-r1:7b) – stable, no aggressive reloads\n")
    total = 0
    session = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = ctx.new_page()
        page.goto(DEMO_URL)
        time.sleep(1)

        while True:
            session += 1
            # Click the checkbox to start a new captcha challenge
            try:
                checkbox_frame = page.locator("iframe[title=\"Widget containing checkbox for hCaptcha security challenge\"]").content_frame
                checkbox = checkbox_frame.get_by_role("checkbox", name="'I am human', Select in order")
                checkbox.click()
                time.sleep(1)
            except Exception as e:
                print(f"[Session {session}] Checkbox click failed: {e}")
                # Try to recover by clicking "New Challenge" or reloading
                if not click_new_challenge(page):
                    page.reload()
                    time.sleep(2)
                continue
            # Wait for challenge iframe
            try:
                page.wait_for_selector("iframe[title=\"hCaptcha challenge\"]", timeout=15000)
            except:
                print(f"[Session {session}] Captcha iframe didn't appear – retrying...")
                continue
            # Solve the captcha (one full challenge, 3-5 questions)
            success, last3 = solve_one_session(page, str(session))
            if success and last3:
                store_training_batch(last3, MODEL_NAME)
                total += len(last3)
                print(f"\n[Session {session}] SUCCESS – stored {len(last3)} pair(s). Total stored: {total}\n")
                # Instead of reloading, click "New Challenge" to reset
                if not click_new_challenge(page):
                    page.reload()
                    time.sleep(2)
                # Also need to uncheck any leftover? The "New Challenge" button resets everything.
            else:
                print(f"\n[Session {session}] FAILED – reloading page to recover.\n")
                page.reload()
                time.sleep(2)
            time.sleep(1)

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nStopped. Data saved.")