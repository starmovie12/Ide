/**
 * Auto-resume streaming — v6
 * Bug #B3 — do NOT accumulate full output into history on resume.
 *            Only the last 300 chars (anchor tail) are appended as model context.
 * Bug #B4 — MAX_RESUMES = 3 with explicit error on exhaustion (no infinite loop).
 */

import { streamGemini, type GeminiConfig, type GeminiMessage } from './gemini';

export interface AutoResumeOptions {
  config: GeminiConfig;
  messages: GeminiMessage[];
  onChunk: (text: string) => void;
  onFinish: (result: { combinedText: string; totalResumes: number }) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

/** Maximum number of resume attempts before surfacing an error — Bug #B4 */
const MAX_RESUMES = 3;

/**
 * Number of chars from the END of accumulated output used as the resume anchor.
 * Bug #B3: only this tail is sent back to the model, not the full output.
 * This prevents the context from growing linearly across resumes.
 */
const ANCHOR_CHARS = 300;

export async function streamWithAutoResume(opts: AutoResumeOptions): Promise<void> {
  const { config, messages, onChunk, onFinish, onError, signal } = opts;

  let combinedText = '';
  let resumeAttempt = 0;
  /**
   * Bug #B3 fix: currentMessages starts from the ORIGINAL messages array
   * and is REBUILT on each resume (not accumulated).
   * The anchor is derived from combinedText at resume time.
   */
  let currentMessages: GeminiMessage[] = [...messages];

  while (resumeAttempt <= MAX_RESUMES) {
    if (signal?.aborted) return;

    let triggeredMaxTokens = false;

    try {
      const stream = streamGemini(config, currentMessages);

      for await (const chunk of stream) {
        if (signal?.aborted) return;

        if (chunk.text) {
          combinedText += chunk.text;
          onChunk(chunk.text);
        }

        if (chunk.done) {
          // finishReason forwarded from gemini.ts — check if truncated
          if (chunk.finishReason === 'MAX_TOKENS') {
            triggeredMaxTokens = true;
          }
          break;
        }
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Stream error');
      return;
    }

    // Clean finish — no resume needed
    if (!triggeredMaxTokens) {
      onFinish({ combinedText, totalResumes: resumeAttempt });
      return;
    }

    resumeAttempt += 1;

    // Bug #B4 — hard exit after MAX_RESUMES
    if (resumeAttempt > MAX_RESUMES) {
      onError(
        `Response truncated after ${MAX_RESUMES} resume attempts. ` +
          'The output may be incomplete. Try a more specific prompt or smaller scope.'
      );
      return;
    }

    // Bug #B3 fix: REBUILD messages from scratch.
    // Only the anchor tail is injected — not the full combinedText.
    const tail = combinedText.slice(-ANCHOR_CHARS);
    currentMessages = [
      ...messages,                              // original messages, not accumulated
      {
        role: 'model' as const,
        parts: [
          {
            text:
              `[continuing from previous truncated output — last ${ANCHOR_CHARS} chars below]\n` +
              tail,
          },
        ],
      },
      {
        role: 'user' as const,
        parts: [
          {
            text: 'Continue EXACTLY from where you stopped. Do NOT repeat the anchor lines above. Just continue.',
          },
        ],
      },
    ];
  }
}
