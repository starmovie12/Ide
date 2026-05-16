/**
 * Convention Sniffer + Rule Extractor — Phase 5 §1.2 (Phase C + D)
 *
 * Two Flash calls per repo build:
 *   Phase C: sniffConventions()  — detects framework, styling, TS, routing, state mgr, etc.
 *   Phase D: extractRules()      — derives project-specific coding rules as string array
 */

import { callGemini } from '@/lib/ai/gemini';
import { BLUEPRINT_MODEL } from '@/lib/ai/constants';
import type { RepoConventions } from './types';

// ─── Phase C: Convention Sniffer ─────────────────────────────────────────────

export interface ConventionSnifferInput {
  packageJsonContent: string;
  sampleFiles: Array<{ path: string; content: string }>;
  folderStructure: string;
}

const CONVENTION_PROMPT = `You are a code-analysis assistant. Given the package.json, folder structure, and sample source files below, extract the project's technical conventions.

Respond ONLY with valid JSON matching this exact shape (no prose, no fences):
{
  "framework": "react" | "next" | "vue" | "svelte" | "plain" | "other",
  "styling": "tailwind" | "css-modules" | "styled-components" | "emotion" | "plain",
  "typescript": true | false,
  "routing": "wouter" | "next-app" | "next-pages" | "react-router" | "svelte-kit" | "none",
  "stateManagement": "zustand" | "redux" | "context" | "jotai" | "none",
  "testingFramework": "vitest" | "jest" | "playwright" | "none",
  "packageManager": "pnpm" | "npm" | "yarn" | "bun",
  "hasTypeScript": true | false,
  "hasTests": true | false
}`;

/**
 * Phase C: detect project conventions from package.json + sample files.
 * Result is cached by package.json content hash in the blueprint builder.
 */
export async function sniffConventions(
  apiKey: string,
  input: ConventionSnifferInput,
): Promise<RepoConventions> {
  const userContent = [
    `## package.json\n\`\`\`json\n${input.packageJsonContent.slice(0, 3000)}\n\`\`\``,
    `## Folder structure\n\`\`\`\n${input.folderStructure.slice(0, 2000)}\n\`\`\``,
    ...input.sampleFiles.slice(0, 5).map(
      (f) => `## ${f.path}\n\`\`\`\n${f.content.slice(0, 1000)}\n\`\`\``,
    ),
  ].join('\n\n');

  try {
    const raw = await callGemini(
      { model: BLUEPRINT_MODEL, apiKey, temperature: 0.1, maxTokens: 512 },
      [{ role: 'user', parts: [{ text: `${CONVENTION_PROMPT}\n\n${userContent}` }] }],
    );

    // Strip potential markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as RepoConventions;

    // Provide safe defaults for any missing fields
    return {
      framework:        parsed.framework        ?? 'other',
      styling:          parsed.styling          ?? 'plain',
      typescript:       parsed.typescript       ?? false,
      routing:          parsed.routing          ?? 'none',
      stateManagement:  parsed.stateManagement  ?? 'none',
      testingFramework: parsed.testingFramework ?? 'none',
      packageManager:   parsed.packageManager   ?? 'npm',
      hasTypeScript:    parsed.hasTypeScript    ?? false,
      hasTests:         parsed.hasTests         ?? false,
    };
  } catch {
    // Graceful fallback — never block blueprint build on convention detection failure
    return {
      framework:        'other',
      styling:          'plain',
      typescript:       false,
      routing:          'none',
      stateManagement:  'none',
      testingFramework: 'none',
      packageManager:   'npm',
      hasTypeScript:    false,
      hasTests:         false,
    };
  }
}

// ─── Phase D: Rule Extractor ──────────────────────────────────────────────────

export interface RuleExtractorInput {
  conventions: RepoConventions;
  sampleFiles: Array<{ path: string; content: string }>;
}

const RULES_PROMPT = `You are a senior code reviewer analysing a codebase to discover its implicit coding rules.
Given the detected conventions and sample source files, produce a JSON array of 5-15 short rule strings.
Each rule should be a concrete, actionable statement that a code-generation AI should follow.

Examples of good rules:
- "Use @/ import alias, never relative paths from src/"
- "All buttons use the <Button variant='...'> component from ui/button"
- "Zustand stores live in src/lib/store/, never in components"
- "No console.log — use the logger from src/lib/utils/logger"
- "React Query for server state, Zustand for UI-only state"

Respond ONLY with a valid JSON array of strings. No prose. No fences.`;

/**
 * Phase D: extract project-specific coding rules.
 * These are injected into every Coder agent call.
 */
export async function extractProjectRules(
  apiKey: string,
  input: RuleExtractorInput,
): Promise<string[]> {
  const conventionSummary = JSON.stringify(input.conventions, null, 2);
  const sampleContent = input.sampleFiles
    .slice(0, 5)
    .map((f) => `## ${f.path}\n\`\`\`\n${f.content.slice(0, 1200)}\n\`\`\``)
    .join('\n\n');

  try {
    const raw = await callGemini(
      { model: BLUEPRINT_MODEL, apiKey, temperature: 0.2, maxTokens: 512 },
      [
        {
          role: 'user',
          parts: [
            {
              text: `${RULES_PROMPT}\n\n## Detected conventions\n\`\`\`json\n${conventionSummary}\n\`\`\`\n\n${sampleContent}`,
            },
          ],
        },
      ],
    );

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as string[];
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === 'string') : [];
  } catch {
    return [];
  }
}
