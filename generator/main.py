try:
	import undetected_chromedriver as uc
	UC_IMPORT_ERROR = None
except ModuleNotFoundError as error:
	uc = None
	UC_IMPORT_ERROR = error
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
from selenium.webdriver.common.proxy import Proxy, ProxyType
import tls_client
import base64


def resolve_number_input():
	raw_value = None

	if len(os.sys.argv) > 1:
		raw_value = os.sys.argv[1]
	elif os.getenv('GEN_NUMBER'):
		raw_value = os.getenv('GEN_NUMBER')

	if raw_value is None:
		raise ValueError('Missing required number input.')

	return float(raw_value)


def main():
	init(autoreset=True)
	number_value = resolve_number_input()
	now = datetime.utcnow().isoformat()

	if uc is None:
		print(f"{Fore.YELLOW}undetected_chromedriver unavailable: {UC_IMPORT_ERROR}{Style.RESET_ALL}")

	print(f"[{now}] Generator received number: {number_value}")


if __name__ == '__main__':
	main()
