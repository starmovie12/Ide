import { streamGemini, type GeminiConfig } from './gemini';
import type { GeminiMessage } from './gemini';

export interface AutoResumeOptions {
  config: GeminiConfig;
  messages: GeminiMessage[];
  onChunk: (text: string) => void;
  onFinish: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

const MAX_RESUMES = 3;
const ANCHOR_CHARS = 300;

export async function streamWithAutoResume(opts: AutoResumeOptions): Promise<void> {
  const { config, messages, onChunk, onFinish, onError, signal } = opts;

  let combinedText = '';
  let resumeAttempt = 0;
  let currentMessages = [...messages];

  while (resumeAttempt <= MAX_RESUMES) {
    if (signal?.aborted) return;

    let finishReason = 'STOP';
    let segmentText = '';
    let hadError = false;

    try {
      const stream = streamGemini(config, currentMessages);

      for await (const chunk of stream) {
        if (signal?.aborted) return;

        if (chunk.text) {
          segmentText += chunk.text;
          combinedText += chunk.text;
          onChunk(chunk.text);
        }

        if (chunk.done) {
          break;
        }
      }
    } catch (err) {
      hadError = true;
      onError(err instanceof Error ? err.message : 'Stream error');
      return;
    }

    if (!hadError && finishReason !== 'MAX_TOKENS') {
      break;
    }

    resumeAttempt += 1;

    if (resumeAttempt > MAX_RESUMES) {
      onError('Max auto-resume attempts reached. Response may be truncated.');
      break;
    }

    const tail = combinedText.slice(-ANCHOR_CHARS);
    currentMessages = [
      ...messages,
      {
        role: 'model' as const,
        parts: [{ text: `[continuing from previous truncated output, last ${ANCHOR_CHARS} chars below]\n${tail}` }],
      },
      {
        role: 'user' as const,
        parts: [{ text: 'Continue EXACTLY from where you stopped. Do NOT repeat the anchor lines above. Just continue.' }],
      },
    ];
  }

  onFinish();
}
