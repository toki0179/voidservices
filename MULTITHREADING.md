# Multi-Threading Architecture

## Overview
The bot now uses multi-threading to handle concurrent operations without blocking the main event loop.

## Main Bot (Node.js)

### Worker Pool for Card Rendering
- **File**: `src/lib/workerPool.js`
- **Worker Count**: CPU cores / 2 (min 2, max 8)
- **Purpose**: Render card images in parallel without blocking command handling
- **How it works**:
  1. Initializes a pool of Worker threads on startup
  2. Each `/boost` command queues a render task
  3. Available workers pick tasks from the queue
  4. Rendering happens concurrently in separate threads
  5. Results are returned to the main thread

### Benefits
- Multiple `/boost` commands can be processed simultaneously
- No blocking of other commands or event handling
- Automatic queuing if all workers are busy
- 120-second timeout per render task
- Graceful pool shutdown on bot exit

### Usage in Commands
```javascript
import { renderImage } from '../lib/workerPool.js';

const image = await renderImage('nitro', payload);
```

## Selfbot (Python)

### ThreadPoolExecutor for Message Processing
- **File**: `selfbot/bot.py`
- **Worker Count**: 4 worker threads
- **Purpose**: Process incoming Discord messages concurrently
- **How it works**:
  1. Bot initializes ThreadPoolExecutor on startup
  2. Each incoming message is processed in a worker thread
  3. LLM API calls (blocking) run in the thread pool
  4. Responses are sent back from the main asyncio loop
  5. Pool is gracefully shutdown on exit

### Benefits
- Multiple messages can be processed in parallel
- LLM API calls don't block the Discord event loop
- Typing indicators, message sending remain responsive
- Automatic context management per message
- Clean shutdown with proper thread termination

### Architecture
```
Message Received → on_message (async) 
    ↓
Queue to ThreadPoolExecutor
    ↓
_handle_message_sync (blocking)
    ↓
_get_llm_response_sync (blocking LLM call)
    ↓
Response sent back to asyncio loop → send to Discord
```

## Performance Implications

### Before Multi-Threading
- Card rendering could block other commands
- Multiple selfbots could queue up message processing

### After Multi-Threading
- Up to 4 card renders simultaneously (main bot)
- Up to 4 message responses simultaneously (each selfbot)
- No blocking between render tasks or message handling
- Better resource utilization across CPU cores

## Configuration

### Main Bot Worker Count
Edit `src/lib/workerPool.js` line with WORKER_COUNT:
```javascript
const WORKER_COUNT = Math.max(2, Math.floor(require('os').cpus().length / 2));
```

### Selfbot Worker Count
Edit `selfbot/bot.py` line with executor initialization:
```python
self.executor = ThreadPoolExecutor(max_workers=4)
```

## Monitoring

### Worker Pool Stats
```javascript
import { getWorkerPoolStats } from './lib/workerPool.js';

const stats = getWorkerPoolStats();
// { totalWorkers: 4, busyWorkers: 2, queuedTasks: 1 }
```

## Thread Safety

- **Node.js**: Worker threads are isolated with message passing
- **Python**: Thread-safe OllamaFreeAPI client, asyncio loop coordination
- **Context**: Message context is thread-safe due to GIL in Python
- **Discord API**: All Discord API calls happen in the main asyncio loop

## Shutdown Behavior

### Main Bot
- Queue is flushed (waits for active tasks)
- All worker threads terminated
- Timeout: 30 seconds

### Selfbot
- ThreadPoolExecutor shutdown with `wait=True`
- All pending tasks complete before close
- Creator receives shutdown DM
