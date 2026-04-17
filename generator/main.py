from seleniumbase import Driver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from colorama import Fore, Style, init
from fake_useragent import UserAgent
from pystyle import *
import requests
import time
import random
import string
import re
import os
from datetime import datetime
from selenium.common.exceptions import TimeoutException
import tls_client
import sys
import json

# SeleniumBase import - this replaces undetected_chromedriver
try:
    from seleniumbase import Driver
    SB_IMPORT_ERROR = None
except ImportError as error:
    Driver = None
    SB_IMPORT_ERROR = error

def write_credentials_to_file(username, email, password, token):
    """Write credentials to a file that the bot can read and send."""
    output_dir = 'data/generated'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'{output_dir}/credentials_{timestamp_str}.txt'

    try:
        with open(filename, 'a', encoding='utf-8') as f:
            f.write(f'Username: {username}\n')
            f.write(f'Email: {email}\n')
            f.write(f'Password: {password}\n')
            f.write(f'Token: {token}\n')
            f.write('-' * 50 + '\n')
        return filename
    except Exception as e:
        print(f'{Fore.RED}Failed to write credentials: {str(e)}{Style.RESET_ALL}')
        return None

def resolve_number_input():
    raw_value = None

    if len(os.sys.argv) > 1:
        raw_value = os.sys.argv[1]
    elif os.getenv('GEN_NUMBER'):
        raw_value = os.getenv('GEN_NUMBER')

    if raw_value is None:
        raise ValueError('Missing required number input.')

    return float(raw_value)

def account_ratelimit():
    """Fetches rate limit using account creation data."""
    try:
        m = format(''.join(random.choice(string.digits) for _ in range(6)))
        email = format(''.join(random.choice(string.ascii_lowercase) for _ in range(9)))+m
        mail = "{}@gmail.com".format(''.join(random.choice(string.ascii_lowercase) for _ in range(11)))
        nam = "ultimate"
        client = tls_client.Session(client_identifier='chrome_110')
        client.headers = {
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "en-US,en;q=0.5",
                "Content-Type": "application/json",
                "DNT": "1",
                "Host": "discord.com",
                "Origin": "https://discord.com",
                "Referer": 'https://discord.com/register',
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "Sec-GPC": "1",
                "TE": "trailers",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
                "X-Debug-Options": "bugReporterEnabled",
                "X-Discord-Locale": "en-US",
                "X-Discord-Timezone": "Asia/Calcutta",
                "X-Super-Properties": 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIEZyYW1lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImdyLUFSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS80LjAgKGNvbXBhdGlibGU7IE1TSUUgOC4wOyBXaW5kb3dzIE5UIDYuMTsgVHJpZGVudC80LjA7IEdUQjcuNDsgY2hyb21lZnJhbWUvMjQuMC4xMzEyLjU3OyBTTENDMjsgLk5FVCBDTFIgMi4wLjUwNzI3OyAuTkVUIENMUiAzLjUuMzA3Mjk7IC5ORVQgQ0xSIDMuMC4zMDcyOTsgLk5FVDQuMEM7IEluZm9QYXRoLjM7IE1TLVJUQyBMTSA4OyBCUkkvMikiLCJicm93c2VyX3ZlcnNpb24iOiIyNC4wLjEzMTIiLCJvc192ZXJzaW9uIjoiNyIsInJlZmVycmVyIjoiaHR0cHM6Ly93d3cueW91dHViZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6Ind3dy55b3V0dWJlLmNvbSIsInNlYXJjaF9lbmdpbmUiOiJhc2suY29tIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjE0ODQ3OSwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=',
            }
        data = {
                'email': mail,
                'password': 'ultimate12$$',
                'date_of_birth': "2000-09-20",
                'username': email,
                'consent': True,
                'captcha_service': 'hcaptcha',
                'global_name': nam,
                'captcha_key': None,
                'invite': None,
                'promotional_email_opt_in': False,
                'gift_code_sku_id': None
            }
        req = client.post(f'https://discord.com/api/v9/auth/register', json=data)
        if 'The resource is being rate limited' in req.text:
                limit = req.json()['retry_after']
                return limit
        else:
                return 1
    except Exception as e:
        print(f'{Fore.RED} Error fetching rate limit: {str(e)}')
        return 1

init(autoreset=True)
# Clear screen in a cross-platform way
if os.name == 'nt':
    os.system("cls")
    os.system("title Ultimate EV GEN V1 By Anomus.LY_")
else:
    os.system("clear")

def random_sleep(base=2, variation=3):
    time.sleep(base + random.uniform(0, variation))

def timestamp():
    return f"{Fore.LIGHTBLACK_EX}[{datetime.now().strftime('%H:%M:%S %d-%m-%Y')}]"

def print_templog(temp_email):
    print(f"{timestamp()} {Fore.BLUE}Using tempmail{Style.RESET_ALL}: {Fore.GREEN}{temp_email}{Style.RESET_ALL}")

def generate_yopmail_email():
    username = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    email = f"{username}@gmail.com"
    return username, email

def generate_random_string(length=12):
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for i in range(length))

from seleniumbase import Driver

def init_seleniumbase_driver():
    """Initialize SeleniumBase driver with UC mode using valid arguments"""
    try:
        # Initialize the driver with UC (undetected) mode
        # Using only valid arguments from the SeleniumBase documentation
        driver = Driver(
            browser="chrome",          # Browser to use
            uc=True,                   # Enable undetected mode
            headless=False,            # Use Xvfb instead of headless
            no_sandbox=True,           # Required for Docker (still accepted)
            disable_gpu=True,          # Helps with rendering issues in Docker
            agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            incognito=False,
            guest_mode=False,
            disable_csp=None,          # Valid argument (None or boolean)
            chromium_arg="--disable-dev-shm-usage,--disable-features=ChromeWhatsNewUI,TranslateUI",  # Pass Chrome args
            binary_location="/usr/bin/google-chrome-stable"  # Explicit Chrome path
        )
        
        # Set window size after driver initialization (SeleniumBase doesn't have a 'window_size' parameter)
        driver.set_window_size(1920, 1080)
        
        print(f"{timestamp()} {Fore.GREEN}SeleniumBase driver initialized successfully{Style.RESET_ALL}")
        return driver
        
    except Exception as e:
        print(f"{timestamp()} {Fore.RED}Failed to initialize SeleniumBase driver: {str(e)[:200]}{Style.RESET_ALL}")
        return None

def main():
    init(autoreset=True)
    number_value = resolve_number_input()
    now = datetime.now().isoformat()

    if number_value < 0 or not number_value.is_integer():
        raise ValueError('GEN number input must be a non-negative whole number.')

    loop_count = int(number_value)
    generated_file = None

    if Driver is None:
        print(f"{Fore.RED}SeleniumBase is not available: {SB_IMPORT_ERROR}{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}Please install: pip install seleniumbase{Style.RESET_ALL}")
        return

    print(f"[{now}] Generator starting {loop_count} iterations")

    for index in range(loop_count):
        print(f"{Fore.CYAN}Loop {index + 1}/{loop_count}{Style.RESET_ALL}")
        
        username, email = generate_yopmail_email()
        print(f"{timestamp()} {Fore.BLUE}Using temporary email: {email}{Style.RESET_ALL}")
        if not email:
            print(f"{timestamp()} {Fore.RED}Failed to create temporary email.{Style.RESET_ALL}")
            continue
        print_templog(email)
        driver = None
        
        try:
            # Initialize SeleniumBase driver
            driver = init_seleniumbase_driver()
            if not driver:
                print(f"{timestamp()} {Fore.RED}Failed to initialize driver. Skipping iteration {index + 1}.{Style.RESET_ALL}")
                continue
            
            # Navigate to Discord registration
            driver.get("https://discord.com/register")
            
            # Wait for email field and fill form
            WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.NAME, "email")))
            driver.find_element(By.NAME, "email").send_keys(email)
            driver.find_element(By.NAME, "global_name").send_keys("Lunarxterm")
            username = generate_random_string()
            driver.find_element(By.NAME, "username").send_keys(username)
            password_value = email
            driver.find_element(By.NAME, "password").send_keys(password_value)
            
            print(f"{timestamp()} {Fore.YELLOW}Trying to set the date..{Style.RESET_ALL}")
            actions = ActionChains(driver)
            actions.send_keys(Keys.TAB)
            actions.pause(0.5)
            actions.send_keys("January")
            actions.send_keys(Keys.ENTER)
            actions.perform()
            
            for i in range(2):
                actions.pause(0.2)
                actions.send_keys(Keys.TAB)
                actions.pause(0.5)
                actions.send_keys("20")
                actions.send_keys(Keys.ENTER)
                actions.perform()
            
            for i in range(2):
                actions.pause(0.2)
                actions.send_keys(Keys.TAB)
                actions.pause(0.5)
                actions.send_keys("2000")
                actions.send_keys(Keys.ENTER)
                actions.perform()
            
            # Handle checkboxes
            try:
                locator = (By.XPATH, "//input[@type='checkbox']")
                checkboxes = WebDriverWait(driver, 10).until(
                    EC.presence_of_all_elements_located(locator)
                )
                
                print(f"{timestamp()} {Fore.BLUE}Got {Style.RESET_ALL}{Fore.GREEN}{len(checkboxes)}{Style.RESET_ALL}{Fore.BLUE} checkboxes. Clicking...{Style.RESET_ALL}")

                for checkbox in checkboxes:
                    if not checkbox.is_selected():
                        driver.execute_script("arguments[0].scrollIntoView(true);", checkbox)
                        time.sleep(0.5)
                        checkbox.click()
                        
                print(f"{timestamp()} {Fore.BLUE}Checkboxes handled.")

            except Exception as e:
                print(f"{timestamp()} {Fore.RED}Error handling checkboxes: {e}{Style.RESET_ALL}")

            # Submit form
            continue_button = WebDriverWait(driver, 20).until(EC.element_to_be_clickable((By.XPATH, '//button[@type="submit"]')))
            limit = account_ratelimit()
            if limit > 1:
                print(f'{timestamp()}{Fore.RED}[INFO] Ratelimited for {limit} seconds. Waiting...{Style.RESET_ALL}')
                time.sleep(limit)
            continue_button.click()

            print(f"{timestamp()} {Fore.BLUE}Form submitted. Waiting for CAPTCHA or redirect...{Style.RESET_ALL}")
            # log the captcha presence and provide link to solve it
            try:
                WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CLASS_NAME, "captcha-iframe")))
                print(f"{timestamp()} {Fore.YELLOW}CAPTCHA detected. Please solve it in the browser window.{Style.RESET_ALL}")
                # Provide captcha iframe link for easier access to solve, as user may not have access to the browser window
                captcha_iframe = driver.find_element(By.CLASS_NAME, "captcha-iframe")
                captcha_src = captcha_iframe.get_attribute("src")
                print(f"{timestamp()} {Fore.YELLOW}CAPTCHA URL: {captcha_src}{Style.RESET_ALL}")
                # Wait for user to solve the captcha and for the URL to change to the Discord channels page
                WebDriverWait(driver, 300).until(EC.url_contains("discord.com/channels/@me"))
                print(f"{timestamp()} {Fore.GREEN}CAPTCHA solved and redirected to Discord page!{Style.RESET_ALL}")
            except TimeoutException:
                # log current URL for debugging
                current_url = driver.current_url
                print(f"{timestamp()} {Fore.YELLOW}No CAPTCHA detected after waiting. Current URL: {current_url}{Style.RESET_ALL}")
                print(f"{timestamp()} {Fore.GREEN}No CAPTCHA detected, proceeding...{Style.RESET_ALL}")

            # Wait for redirect to Discord channels
            WebDriverWait(driver, 300).until(EC.url_contains("discord.com/channels/@me"))
            print(f"{timestamp()} {Fore.GREEN}Redirected to Discord page!{Style.RESET_ALL}")

            driver.quit()
            print(f"{timestamp()} {Fore.BLUE}Logging in to fetch token...{Style.RESET_ALL}")
            
            success = login_and_fetch_token(email, password_value)
            if success:
                print(f"{timestamp()} {Fore.GREEN}Process complete for iteration {index + 1}.{Style.RESET_ALL}")
                token = success if isinstance(success, str) else generate_random_string(64)
                generated_file = write_credentials_to_file(username, email, password_value, token)
            else:
                print(f"{timestamp()} {Fore.RED}Failed to fetch the token.{Style.RESET_ALL}")

        except Exception as e:
            print(f"{timestamp()} {Fore.RED}Error in iteration {index + 1}: {str(e)}{Style.RESET_ALL}")
            if driver:
                try:
                    driver.quit()
                except:
                    pass
            continue
        finally:
            if driver:
                try:
                    driver.quit()
                    print(f"{timestamp()} {Fore.GREEN}Driver closed.{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{timestamp()} {Fore.YELLOW}Driver cleanup: {e}{Style.RESET_ALL}")
    
    if generated_file:
        print(f"{Fore.GREEN}✅ Generation complete. Output file: {generated_file}{Style.RESET_ALL}")
        print(f"GENERATED_FILE:{generated_file}")
    else:
        print(f"{Fore.RED}❌ Generation completed but no credentials were saved.{Style.RESET_ALL}")

def login_and_fetch_token(email, password):
    data = {"login": email, "password": password, "undelete": "false"}
    headers = {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
    }
    try:
        r = requests.post("https://discord.com/api/v9/auth/login", json=data, headers=headers)
        
        if r.status_code == 200:
            token = r.json().get("token")
            if token:
                print(f"{timestamp()} {Fore.GREEN}Token fetched: {token}{Style.RESET_ALL}")
                with open("tokens.txt", "a") as f:
                    f.write(f"{token}\n")
                with open("evs.txt", "a") as f:
                    f.write(f"{email}:{password}:{token}\n")
                print(f"{timestamp()} {Fore.GREEN}Token Saved to evs.txt and tokens.txt{Style.RESET_ALL}")
                return token
        
        elif "captcha-required" in r.text:
            print(f"{timestamp()} {Fore.RED}Discord returned captcha, stopping retry.{Style.RESET_ALL}")
            return False
            
        else:
            print(f"{timestamp()} {Fore.RED}Failed to fetch token. Status Code: {r.status_code}")
            print(f"{timestamp()} {Fore.YELLOW}Response: {r.text}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"{timestamp()} {Fore.RED}A connection error occurred: {e}")
        return False
        
    return False

if __name__ == '__main__':
    main()