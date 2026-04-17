#!/usr/bin/env python3

import os
import asyncio
import sys
import logging
import json
import random
from importlib.metadata import PackageNotFoundError, version
from concurrent.futures import ThreadPoolExecutor
from ollamafreeapi import OllamaFreeAPI
from ollama import Client as OllamaClient
import discord

# Configuration from environment
TOKEN = os.getenv('DISCORD_TOKEN')
CHANNEL_ID = int(os.getenv('CHANNEL_ID', 0))
USER_ID = int(os.getenv('USER_ID', 0))
LLM_MODEL = os.getenv('LLM_MODEL', 'mistral:latest')
BASE_PROMPT = (os.getenv('BASE_PROMPT', '') or '').strip()
LLM_TIMEOUT_SECONDS = float(os.getenv('LLM_TIMEOUT_SECONDS', '30'))
MAX_CONTEXT_CHARS = int(os.getenv('MAX_CONTEXT_CHARS', '1200'))
LISTEN_TO_DMS = (os.getenv('LISTEN_TO_DMS', 'true').strip().lower() not in ('false', '0', 'no', 'off'))
FORCE_PROMPT = (
    'Keep every reply to a normal Discord message length: concise, direct, and usually under 3 short sentences. '
    'Avoid bullet lists, long explanations, and essay-style responses unless the user explicitly asks for detail.'
)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('selfbot')
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)


def verify_discord_py_self():
    """Ensure the selfbot runtime is using discord.py-self distribution."""
    try:
        discord_self_version = version('discord.py-self')
        logger.info(f'Using discord.py-self {discord_self_version}')
    except PackageNotFoundError:
        logger.error('discord.py-self is not installed. Install it in selfbot/requirements.txt.')
        sys.exit(1)

# Model to parameter mapping (optimized for humanlike + resource efficiency)
MODEL_PARAMS = {
    'llama3.2:3b': {'temperature': 0.7, 'top_p': 0.9},
    'deepseek-r1:latest': {'temperature': 0.6, 'top_p': 0.9},
    'gpt-oss:20b': {'temperature': 0.7, 'top_p': 0.9},
    'mistral:latest': {'temperature': 0.7, 'top_p': 0.95},
    'mistral-nemo:custom': {'temperature': 0.7, 'top_p': 0.9},
    'bakllava:latest': {'temperature': 0.7, 'top_p': 0.9},
    'smollm2:135m': {'temperature': 0.8, 'top_p': 0.9},
}

CAPTCHA_KEYWORDS = (
    'captcha',
    'hcaptcha',
    'recaptcha',
    'verification required',
    'solve the captcha',
)

class SelfCordBot(discord.Client):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.target_channel_id = CHANNEL_ID
        self.message_context = []
        self.max_context_messages = 5
        self.llm_client = OllamaFreeAPI()
        self._available_models = None
        self._preferred_server = {}
        self.running = True
        # ThreadPoolExecutor for concurrent message processing
        self.executor = ThreadPoolExecutor(max_workers=4)
        
    async def on_ready(self):
        logger.info(f'Selfbot logged in as {self.user}')
        if self.target_channel_id:
            logger.info(f'Monitoring channel {self.target_channel_id} and DMs')
        else:
            logger.info('Monitoring DMs only')
        logger.info(f'Using model: {LLM_MODEL}')
        
    async def on_message(self, message):
        # Ignore messages from self
        if self.user and message.author == self.user:
            return

        is_dm = isinstance(message.channel, discord.DMChannel) or message.guild is None

        if is_dm and not LISTEN_TO_DMS:
            return

        # Respond in DMs, or in configured guild channel when provided.
        if not is_dm and self.target_channel_id and message.channel.id != self.target_channel_id:
            return
        if not is_dm and not self.target_channel_id:
            return
            
        # Ignore bot messages
        if message.author.bot:
            return

        if self._contains_captcha_signal(message.content):
            self._emit_captcha_event('incoming-message', {
                'author': message.author.name,
                'content': message.content,
                'channel_id': getattr(message.channel, 'id', None),
                'is_dm': message.guild is None,
            })
        
        if not self.running:
            return
        
        try:
            await self._handle_message(message)
        except Exception as e:
            logger.error(f'Error handling message: {e}')
            if self._contains_captcha_signal(str(e)):
                self._emit_captcha_event('message-handler-error', {
                    'error': str(e),
                    'channel_id': getattr(message.channel, 'id', None),
                })
            try:
                await message.reply(f'Error: {str(e)[:100]}')
            except:
                pass
    
    async def _handle_message(self, message):
        # Add message to context
        self.message_context.append({
            'author': message.author.name,
            'content': message.content
        })
        
        # Keep only recent messages
        if len(self.message_context) > self.max_context_messages:
            self.message_context.pop(0)
        
        # Build context for LLM
        context = '\n'.join([
            f"{msg['author']}: {msg['content']}"
            for msg in self.message_context[:-1]  # All except the current message
        ])
        if len(context) > MAX_CONTEXT_CHARS:
            context = context[-MAX_CONTEXT_CHARS:]
        
        # Show typing indicator
        async with message.channel.typing():
            response = await self._get_llm_response(message.content, context)
        
        # Send response
        if response:
            # Split long responses into chunks
            for chunk in self._chunk_text(response, 1900):
                try:
                    await message.reply(chunk)
                except Exception as e:
                    logger.error(f'Failed to send reply: {e}')
    
    async def _get_llm_response(self, prompt, context):
        """Get response from LLM via OllamaFreeAPI (async wrapper)."""
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(
                    self.executor,
                    self._get_llm_response_sync,
                    prompt,
                    context,
                ),
                timeout=LLM_TIMEOUT_SECONDS + 5,
            )
        except TimeoutError:
            logger.error(f'LLM request timed out after {LLM_TIMEOUT_SECONDS + 5:.0f}s')
            self._reset_executor()
            return "I couldn't generate a response in time. Please try again."

    def _reset_executor(self):
        """Reset the worker pool when a blocking request gets stuck."""
        old_executor = self.executor
        self.executor = ThreadPoolExecutor(max_workers=4)
        old_executor.shutdown(wait=False, cancel_futures=True)
    
    def _get_available_models(self, refresh=False):
        if refresh or self._available_models is None:
            try:
                # Some upstream JSON sources can contain duplicate names.
                self._available_models = list(dict.fromkeys(self.llm_client.list_models()))
            except Exception as e:
                logger.error(f'Failed to fetch available models: {e}')
                self._available_models = []
        return self._available_models

    def _resolve_model_name(self, requested_model):
        available_models = self._get_available_models()
        if not available_models:
            return requested_model

        # Try exact match first.
        if requested_model in available_models:
            return requested_model

        # Fallback: strip the tag and try base/family matches.
        base = requested_model.split(':', 1)[0]
        if base in available_models:
            return base

        tagged_candidates = [name for name in available_models if name.startswith(f'{base}:')]
        if tagged_candidates:
            return tagged_candidates[0]

        return requested_model

    def _get_llm_response_sync(self, prompt, context):
        """Get response from OllamaFreeAPI (blocking)."""
        try:
            params = MODEL_PARAMS.get(LLM_MODEL, {})

            sections = []
            sections.append(f"Forced instructions:\n{FORCE_PROMPT}")
            if BASE_PROMPT:
                sections.append(f"System instructions:\n{BASE_PROMPT}")
            if context:
                sections.append(f"Conversation:\n{context}")
            sections.append(f"User:\n{prompt}")
            full_prompt = "\n\n".join(sections)
            resolved_model = self._resolve_model_name(LLM_MODEL)
            servers = self.llm_client.get_model_servers(resolved_model)
            if not servers:
                raise RuntimeError(f"No servers available for model '{resolved_model}'")

            random.shuffle(servers)
            preferred_url = self._preferred_server.get(resolved_model)
            if preferred_url:
                servers.sort(key=lambda server: server.get('url') != preferred_url)

            request = self.llm_client.generate_api_request(resolved_model, full_prompt, **params)
            request['stream'] = False

            last_error = None
            for server in servers:
                url = server.get('url')
                if not url:
                    continue
                try:
                    client = OllamaClient(host=url, timeout=LLM_TIMEOUT_SECONDS)
                    response = client.generate(**request)
                    text = getattr(response, 'response', None)
                    if not text and isinstance(response, dict):
                        text = response.get('response')
                    if text:
                        self._preferred_server[resolved_model] = url
                        return text.strip()
                    last_error = RuntimeError('Empty response body from upstream server')
                except Exception as server_error:
                    last_error = server_error

            raise RuntimeError(f"All servers failed for model '{resolved_model}'. Last error: {last_error}")
        except Exception as e:
            logger.error(f'LLM API error: {e}')
            if 'No servers available for model' in str(e):
                # Refresh model list once in case upstream catalog changed.
                self._get_available_models(refresh=True)
            if self._contains_captcha_signal(str(e)):
                self._emit_captcha_event('llm-api-error', {
                    'error': str(e),
                    'prompt_excerpt': (prompt or '')[:300],
                })
            return f"I couldn't generate a response right now."

    @staticmethod
    def _contains_captcha_signal(text):
        if not text:
            return False
        lowered = text.lower()
        return any(keyword in lowered for keyword in CAPTCHA_KEYWORDS)

    def _emit_captcha_event(self, source, details):
        payload = {
            'event': 'captcha_detected',
            'source': source,
            'user_id': USER_ID,
            'channel_id': self.target_channel_id,
            'details': details,
        }
        # Structured stderr marker consumed by the Node.js manager for DM forwarding.
        sys.stderr.write(f"CAPTCHA_EVENT::{json.dumps(payload, ensure_ascii=True)}\n")
        sys.stderr.flush()
    
    async def shutdown(self):
        """Graceful shutdown with logging."""
        logger.info('Shutting down selfbot...')
        self.running = False
        
        # Shutdown thread pool
        self.executor.shutdown(wait=True)
        
        await self.close()
    
    @staticmethod
    def _chunk_text(text, max_length=1900):
        """Split text into chunks for Discord."""
        if len(text) <= max_length:
            return [text]
        
        chunks = []
        current_chunk = ''
        
        for paragraph in text.split('\n'):
            if len(current_chunk) + len(paragraph) + 1 > max_length:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = paragraph
            else:
                current_chunk += ('\n' if current_chunk else '') + paragraph
        
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks

async def main():
    if not TOKEN:
        logger.error('Error: Missing DISCORD_TOKEN')
        sys.exit(1)

    verify_discord_py_self()
    
    logger.info(f'Starting selfbot for user {USER_ID}')
    logger.info(f'Using model: {LLM_MODEL}')
    
    bot = SelfCordBot()
    
    try:
        await bot.start(TOKEN)
    except KeyboardInterrupt:
        logger.info('Received interrupt signal')
        await bot.shutdown()
    except Exception as e:
        logger.error(f'Failed to start: {e}')
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
