#!/usr/bin/env python3

import os
import asyncio
import sys
import logging
from concurrent.futures import ThreadPoolExecutor
from ollamafreeapi import OllamaFreeAPI
import discord

# Configuration from environment
TOKEN = os.getenv('DISCORD_TOKEN')
CHANNEL_ID = int(os.getenv('CHANNEL_ID', 0))
USER_ID = int(os.getenv('USER_ID', 0))
LLM_MODEL = os.getenv('LLM_MODEL', 'neural-chat')

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('selfbot')

# Model to parameter mapping (optimized for humanlike + resource efficiency)
MODEL_PARAMS = {
    'neural-chat': {'temperature': 0.7, 'top_p': 0.9},
    'zephyr': {'temperature': 0.75, 'top_p': 0.9},
    'mistral': {'temperature': 0.7, 'top_p': 0.95},
    'openhermes': {'temperature': 0.8, 'top_p': 0.9},
    'dolphin-mixtral': {'temperature': 0.75, 'top_p': 0.9},
}

class SelfCordBot(discord.Client):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.target_channel_id = CHANNEL_ID
        self.message_context = []
        self.max_context_messages = 5
        self.llm_client = OllamaFreeAPI()
        self.running = True
        # ThreadPoolExecutor for concurrent message processing
        self.executor = ThreadPoolExecutor(max_workers=4)
        
    async def on_ready(self):
        logger.info(f'Selfbot logged in as {self.user}')
        logger.info(f'Monitoring channel {self.target_channel_id}')
        logger.info(f'Using model: {LLM_MODEL}')
        
    async def on_message(self, message):
        # Ignore messages from self
        if self.user and message.author == self.user:
            return
            
        # Only respond in the target channel
        if message.channel.id != self.target_channel_id:
            return
            
        # Ignore bot messages
        if message.author.bot:
            return
        
        if not self.running:
            return
        
        try:
            await self._handle_message(message)
        except Exception as e:
            logger.error(f'Error handling message: {e}')
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
        return await loop.run_in_executor(
            self.executor,
            self._get_llm_response_sync,
            prompt,
            context
        )
    
    def _get_llm_response_sync(self, prompt, context):
        """Get response from LLM via OllamaFreeAPI (blocking)."""
        try:
            params = MODEL_PARAMS.get(LLM_MODEL, {})
            
            full_prompt = f"{context}\n\n{prompt}" if context else prompt
            
            # Use OllamaFreeAPI for automatic server selection
            response = self.llm_client.chat(
                model_name=LLM_MODEL,
                prompt=full_prompt,
                **params
            )
            return response.strip() if response else "No response from LLM"
        except Exception as e:
            logger.error(f'LLM API error: {e}')
            return f"I couldn't generate a response right now."
    
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
    if not TOKEN or not CHANNEL_ID:
        logger.error('Error: Missing DISCORD_TOKEN or CHANNEL_ID')
        sys.exit(1)
    
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
