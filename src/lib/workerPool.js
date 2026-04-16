import { Worker } from 'worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_COUNT = Math.max(2, Math.floor(require('os').cpus().length / 2));
const workerPool = [];
const taskQueue = [];
let taskIdCounter = 0;

// Initialize worker pool
function initializeWorkerPool() {
  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(path.join(__dirname, 'renderWorker.js'));
    worker.on('message', handleWorkerMessage);
    worker.on('error', handleWorkerError);
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Render worker exited with code ${code}`);
      }
    });
    workerPool.push({ worker, busy: false });
  }
}

function handleWorkerMessage(message) {
  const { id, success, result, error } = message;
  const task = taskQueue.find((t) => t.id === id);

  if (task) {
    if (success) {
      task.resolve(result);
    } else {
      task.reject(new Error(error));
    }
    taskQueue.splice(taskQueue.indexOf(task), 1);
  }

  // Process next task in queue
  processNextTask();
}

function handleWorkerError(error) {
  console.error('Render worker error:', error);
}

function processNextTask() {
  if (taskQueue.length === 0) return;

  const availableWorker = workerPool.find((w) => !w.busy);
  if (!availableWorker) return;

  const task = taskQueue[0];
  availableWorker.busy = true;

  availableWorker.worker.postMessage({
    id: task.id,
    type: task.type,
    payload: task.payload,
  });
}

export async function renderImage(type, payload) {
  return new Promise((resolve, reject) => {
    const id = taskIdCounter++;
    const task = { id, type, payload, resolve, reject };

    taskQueue.push(task);
    processNextTask();

    // Timeout after 120 seconds
    const timeout = setTimeout(() => {
      const index = taskQueue.indexOf(task);
      if (index !== -1) {
        taskQueue.splice(index, 1);
      }
      reject(new Error('Render timeout (120s)'));
    }, 120000);

    task.resolve = (result) => {
      clearTimeout(timeout);
      resolve(result);
    };
    task.reject = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
  });
}

export function getWorkerPoolStats() {
  return {
    totalWorkers: workerPool.length,
    busyWorkers: workerPool.filter((w) => w.busy).length,
    queuedTasks: taskQueue.length,
  };
}

export function shutdownWorkerPool() {
  return Promise.all(
    workerPool.map(
      (w) =>
        new Promise((resolve) => {
          w.worker.terminate().then(resolve).catch(resolve);
        }),
    ),
  );
}

// Initialize on import
initializeWorkerPool();
