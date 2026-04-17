#!/usr/bin/env python3

import os
import asyncio
import sys
import logging
import json
from importlib.metadata import PackageNotFoundError, version
from concurrent.futures import ThreadPoolExecutor
from ollama import Client as OllamaClient
import discord

# Configuration from environment
TOKEN = os.getenv('DISCORD_TOKEN')
CHANNEL_ID = int(os.getenv('CHANNEL_ID', 0))
USER_ID = int(os.getenv('USER_ID', 0))
LLM_MODEL = os.getenv('LLM_MODEL', 'mistral:latest')
OLLAMA_HOST = os.getenv('OLLAMA_HOST', 'http://127.0.0.1:11434')
LLM_TIMEOUT_SECONDS = float(os.getenv('LLM_TIMEOUT_SECONDS', '30'))

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
        self.ollama_client = OllamaClient(host=OLLAMA_HOST, timeout=LLM_TIMEOUT_SECONDS)
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
    
    def _get_llm_response_sync(self, prompt, context):
        """Get response from a configured Ollama host (blocking)."""
        try:
            params = MODEL_PARAMS.get(LLM_MODEL, {})

            full_prompt = f"{context}\n\n{prompt}" if context else prompt
            response = self.ollama_client.generate(
                model=LLM_MODEL,
                prompt=full_prompt,
                options=params,
                stream=False,
            )

            text = getattr(response, 'response', None)
            if not text and isinstance(response, dict):
                text = response.get('response')
            if not text:
                raise RuntimeError('Empty response body from Ollama')
            return text.strip()
        except Exception as e:
            logger.error(f'LLM API error: {e}')
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
