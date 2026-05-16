/**
 * Convention Sniffer + Rule Extractor — Phase 5 §1.2 (Phase C + D)
 *
 * Two Flash calls per repo build:
 *   Phase C: sniffConventions()  — detects framework, styling, TS, routing, state mgr, etc.
 *   Phase D: extractRules()      — derives project-specific coding rules as string array
 *
 * Bug fix: was passing `maxTokens` (wrong field) — corrected to `maxOutputTokens`
 *          per GeminiConfig interface in gemini.ts.
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
      // BUG FIX: was `maxTokens` (silently ignored). GeminiConfig uses `maxOutputTokens`.
      { model: BLUEPRINT_MODEL, apiKey, temperature: 0.1, maxOutputTokens: 512 },
      [{ role: 'user', parts: [{ text: `${CONVENTION_PROMPT}\n\n${userContent}` }] }],
    );

    // Strip potential markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as RepoConventions;

    // Infer packageManager from lockfiles if model didn't detect it
    const pkgMgr = parsed.packageManager ?? inferPackageManager(input.packageJsonContent, input.folderStructure);

    // Provide safe defaults for any missing fields
    return {
      framework:        parsed.framework        ?? 'other',
      styling:          parsed.styling          ?? 'plain',
      typescript:       parsed.typescript       ?? false,
      routing:          parsed.routing          ?? 'none',
      stateManagement:  parsed.stateManagement  ?? 'none',
      testingFramework: parsed.testingFramework ?? 'none',
      packageManager:   pkgMgr,
      hasTypeScript:    parsed.hasTypeScript    ?? parsed.typescript ?? false,
      hasTests:         parsed.hasTests         ?? false,
    };
  } catch {
    // Graceful fallback — never block blueprint build on convention detection failure
    return buildFallbackConventions(input.packageJsonContent);
  }
}

/** Infer package manager from lockfile names in folder structure */
function inferPackageManager(
  pkgJson: string,
  folderStructure: string,
): RepoConventions['packageManager'] {
  if (folderStructure.includes('pnpm-lock') || pkgJson.includes('"pnpm"')) return 'pnpm';
  if (folderStructure.includes('yarn.lock')) return 'yarn';
  if (folderStructure.includes('bun.lockb')) return 'bun';
  return 'npm';
}

function buildFallbackConventions(packageJsonContent: string): RepoConventions {
  const hasTailwind = packageJsonContent.includes('tailwindcss');
  const hasTs = packageJsonContent.includes('"typescript"');
  const hasVitest = packageJsonContent.includes('vitest');
  const hasJest = packageJsonContent.includes('jest');
  return {
    framework:        packageJsonContent.includes('"next"') ? 'next'
                    : packageJsonContent.includes('"react"') ? 'react'
                    : packageJsonContent.includes('"vue"') ? 'vue'
                    : 'other',
    styling:          hasTailwind ? 'tailwind' : 'plain',
    typescript:       hasTs,
    routing:          packageJsonContent.includes('wouter') ? 'wouter'
                    : packageJsonContent.includes('react-router') ? 'react-router'
                    : 'none',
    stateManagement:  packageJsonContent.includes('zustand') ? 'zustand'
                    : packageJsonContent.includes('"redux"') ? 'redux'
                    : 'none',
    testingFramework: hasVitest ? 'vitest' : hasJest ? 'jest' : 'none',
    packageManager:   'npm',
    hasTypeScript:    hasTs,
    hasTests:         hasVitest || hasJest,
  };
}

// ─── Phase D: Rule Extractor ─────────────────────────────────────────────────

export interface RuleExtractorInput {
  conventions: RepoConventions;
  sampleFiles: Array<{ path: string; content: string }>;
}

const RULE_PROMPT = `You are analyzing a codebase's coding patterns to derive strict rules for an AI code editor.
List 6–10 CONCRETE, project-specific rules. Examples of good rules:
- "Use Tailwind classes exclusively — no inline styles or external CSS files"
- "Import paths must use the @/ alias, not relative ../../ paths"
- "All async functions must be wrapped in try/catch — no unhandled rejections"
- "Components always export a named export AND a default export"
- "Use Wouter Link component, never native <a> tags for internal navigation"

Be SPECIFIC to THIS project's patterns, not generic advice.
Return ONLY a JSON array of strings: ["rule 1", "rule 2", ...]`;

/**
 * Phase D: extract concrete project-specific rules from sample files.
 * Result cached alongside Phase C output.
 */
export async function extractRules(
  apiKey: string,
  input: RuleExtractorInput,
): Promise<string[]> {
  const conventionSummary = [
    `Framework: ${input.conventions.framework}`,
    `Styling: ${input.conventions.styling}`,
    `TypeScript: ${input.conventions.typescript}`,
    `Routing: ${input.conventions.routing}`,
    `State: ${input.conventions.stateManagement}`,
    `Tests: ${input.conventions.testingFramework}`,
  ].join(', ');

  const sampleContext = input.sampleFiles
    .slice(0, 4)
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 700)}`)
    .join('\n\n');

  const userContent = `${conventionSummary}\n\n${sampleContext}`;

  try {
    const raw = await callGemini(
      // BUG FIX: `maxOutputTokens`, not `maxTokens`
      { model: BLUEPRINT_MODEL, apiKey, temperature: 0.2, maxOutputTokens: 512 },
      [{ role: 'user', parts: [{ text: `${RULE_PROMPT}\n\n${userContent}` }] }],
    );

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as string[];
      if (Array.isArray(parsed) && parsed.every((r) => typeof r === 'string')) {
        return parsed.slice(0, 10);
      }
    }
  } catch {
    // Fallback below
  }

  // Generic fallback rules derived from conventions
  return buildFallbackRules(input.conventions);
}

function buildFallbackRules(c: RepoConventions): string[] {
  const rules: string[] = [];
  if (c.styling === 'tailwind') rules.push('Use Tailwind CSS classes exclusively — no inline styles');
  if (c.typescript) rules.push('All new files must be TypeScript — no .js or .jsx extensions');
  if (c.routing === 'wouter') rules.push('Use Wouter Link for navigation — never native <a> tags');
  if (c.stateManagement === 'zustand') rules.push('Global state goes in Zustand stores under src/lib/store/');
  if (c.framework === 'react' || c.framework === 'next') {
    rules.push('Components use named exports — avoid anonymous default exports');
    rules.push('Hooks must start with "use" and live under src/lib/hooks/ or src/hooks/');
  }
  rules.push('Use @/ path alias for all internal imports — no relative ../../ paths');
  if (c.testingFramework !== 'none') {
    rules.push(`Tests use ${c.testingFramework} — test files end in .test.ts or .spec.ts`);
  }
  return rules;
}
