import { parentPort } from 'worker_threads';
import { renderNitroProofCard, renderParodyCard } from './renderParodyCard.js';

parentPort.on('message', async (data) => {
  try {
    const { type, payload, id } = data;
    let result;

    if (type === 'nitro') {
      result = await renderNitroProofCard(payload);
    } else if (type === 'parody') {
      result = await renderParodyCard(payload);
    } else {
      throw new Error(`Unknown render type: ${type}`);
    }

    parentPort.postMessage({
      id,
      success: true,
      result,
    });
  } catch (error) {
    parentPort.postMessage({
      id,
      success: false,
      error: error.message,
    });
  }
});
