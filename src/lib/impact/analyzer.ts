/**
 * Cross-File Impact Engine — Phase 5 §1.4
 *
 * Analyses a set of Coder diffs against the repo blueprint to find
 * files outside the primary change set that will break.
 *
 * v6 additions:
 *   - extractChangedSignatures() — detects function signature changes
 *   - test-file detection (breaks-test reason)
 *   - dedup merges multiple reasons for the same file
 *   - formatImpactSummary() with orchestrator-ready copy
 */

import type { SearchReplaceBlock } from '@/lib/diff/parser';
import type { RepoBlueprint } from '@/lib/blueprint/types';

export interface AffectedFile {
  path: string;
  reasons: AffectedReason[];
}

export type AffectedReason = {
  type:
    | 'imports-removed-symbol'
    | 'uses-changed-signature'
    | 'uses-changed-component-props'
    | 'uses-changed-type'
    | 'breaks-test';
  detectedSymbol: string;
  occurrences: { line: number; snippet: string }[];
};

export interface ImpactAnalysis {
  primaryFiles: string[];
  affectedFiles: AffectedFile[];
  riskScore: 'low' | 'medium' | 'high';
}

// ── Extractors ────────────────────────────────────────────────────────────────

const EXPORT_RE =
  /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/;

/**
 * Symbols that appear in SEARCH but NOT in REPLACE (i.e. removed exports).
 */
function extractRemovedExports(block: SearchReplaceBlock): string[] {
  if (!block.search) return [];
  const removed: string[] = [];
  const replaceLines = block.replace.split('\n');

  for (const line of block.search.split('\n')) {
    const match = line.match(EXPORT_RE);
    if (!match) continue;
    const sym = match[1];
    const stillPresent = replaceLines.some(
      (r) => r.includes('export') && r.includes(sym)
    );
    if (!stillPresent) removed.push(sym);
  }

  return removed;
}

/**
 * Props interfaces whose shape changed between SEARCH and REPLACE.
 * Returns component names (without 'Props' suffix).
 */
function extractChangedComponentProps(block: SearchReplaceBlock): string[] {
  if (!block.search) return [];
  const changed: string[] = [];

  const searchMatch = block.search.match(/interface\s+(\w+Props)/);
  const replaceMatch = block.replace.match(/interface\s+(\w+Props)/);

  if (searchMatch && replaceMatch && searchMatch[1] === replaceMatch[1]) {
    if (block.search !== block.replace) {
      changed.push(searchMatch[1].replace('Props', ''));
    }
  }

  return changed;
}

/**
 * Function signatures that changed (parameter list or return type).
 * Heuristic: exported function present in both SEARCH and REPLACE with different signature.
 */
function extractChangedSignatures(block: SearchReplaceBlock): string[] {
  if (!block.search || !block.replace) return [];
  const changed: string[] = [];

  // Match: export function name(params): returnType
  const fnRe = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;

  const searchFns: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(block.search)) !== null) {
    searchFns[m[1]] = m[2]; // name → param list
  }

  fnRe.lastIndex = 0;
  while ((m = fnRe.exec(block.replace)) !== null) {
    const name = m[1];
    const newParams = m[2];
    if (name in searchFns && searchFns[name] !== newParams) {
      changed.push(name);
    }
  }

  return changed;
}

/**
 * Types / interfaces that changed in shape.
 */
function extractChangedTypes(block: SearchReplaceBlock): string[] {
  if (!block.search || !block.replace) return [];
  const changed: string[] = [];

  const typeRe = /export\s+(?:type|interface)\s+(\w+)/g;
  const searchTypes = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = typeRe.exec(block.search)) !== null) searchTypes.add(m[1]);

  typeRe.lastIndex = 0;
  while ((m = typeRe.exec(block.replace)) !== null) {
    const name = m[1];
    if (searchTypes.has(name) && block.search !== block.replace) {
      changed.push(name);
    }
  }

  return changed;
}

/** Returns true if path looks like a test file */
function isTestFile(path: string): boolean {
  return (
    path.includes('.test.') ||
    path.includes('.spec.') ||
    path.includes('__tests__') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.spec.ts')
  );
}

// ── Core analyser ─────────────────────────────────────────────────────────────

/**
 * Analyse diffs against the blueprint and return every file outside
 * primaryFiles that will be broken by the proposed changes.
 *
 * §1.4 pipeline:
 *   Coder emits diffs
 *   → orchestrator calls analyzeImpact()
 *   → for each affected file → queue follow-up Coder call
 *   → accumulate ALL diffs → present as ONE atomic change set
 */
export function analyzeImpact(
  diffs: SearchReplaceBlock[],
  blueprint: RepoBlueprint
): ImpactAnalysis {
  const primaryFiles = new Set(
    diffs.map((d) => d.filePath).filter((p) => p !== 'unknown')
  );

  // Map<affected-path, Map<reason-key, AffectedReason>>
  const affectedMap = new Map<string, Map<string, AffectedReason>>();

  function addAffected(
    path: string,
    reason: AffectedReason
  ): void {
    if (primaryFiles.has(path)) return; // skip primary files
    if (!affectedMap.has(path)) affectedMap.set(path, new Map());
    const key = `${reason.type}::${reason.detectedSymbol}`;
    if (!affectedMap.get(path)!.has(key)) {
      affectedMap.get(path)!.set(key, reason);
    }
  }

  for (const block of diffs) {
    // 1. Removed exports
    for (const sym of extractRemovedExports(block)) {
      const entry = blueprint.symbols[sym];
      if (!entry) continue;
      for (const use of entry.usedIn) {
        addAffected(use.file, {
          type: 'imports-removed-symbol',
          detectedSymbol: sym,
          occurrences: [{ line: use.line, snippet: `Uses ${sym}` }],
        });
        // Test files that import removed symbols also break
        if (isTestFile(use.file)) {
          addAffected(use.file, {
            type: 'breaks-test',
            detectedSymbol: sym,
            occurrences: [{ line: use.line, snippet: `Test imports ${sym}` }],
          });
        }
      }
    }

    // 2. Changed component props
    for (const componentName of extractChangedComponentProps(block)) {
      const entry = blueprint.symbols[componentName];
      if (!entry) continue;
      for (const use of entry.usedIn) {
        addAffected(use.file, {
          type: 'uses-changed-component-props',
          detectedSymbol: componentName,
          occurrences: [{ line: use.line, snippet: `Uses <${componentName} />` }],
        });
      }
    }

    // 3. Changed function signatures
    for (const fnName of extractChangedSignatures(block)) {
      const entry = blueprint.symbols[fnName];
      if (!entry) continue;
      for (const use of entry.usedIn) {
        addAffected(use.file, {
          type: 'uses-changed-signature',
          detectedSymbol: fnName,
          occurrences: [{ line: use.line, snippet: `Calls ${fnName}()` }],
        });
      }
    }

    // 4. Changed types/interfaces
    for (const typeName of extractChangedTypes(block)) {
      const entry = blueprint.symbols[typeName];
      if (!entry) continue;
      for (const use of entry.usedIn) {
        addAffected(use.file, {
          type: 'uses-changed-type',
          detectedSymbol: typeName,
          occurrences: [{ line: use.line, snippet: `Uses type ${typeName}` }],
        });
      }
    }
  }

  // Flatten to array
  const affectedFiles: AffectedFile[] = Array.from(affectedMap.entries()).map(
    ([path, reasonMap]) => ({
      path,
      reasons: Array.from(reasonMap.values()),
    })
  );

  const riskScore: ImpactAnalysis['riskScore'] =
    affectedFiles.length === 0
      ? 'low'
      : affectedFiles.length < 4
      ? 'medium'
      : 'high';

  return {
    primaryFiles: Array.from(primaryFiles),
    affectedFiles,
    riskScore,
  };
}

/**
 * Human-readable summary for the chat card (§1.4 user-facing copy).
 * Empty string when no impact.
 */
export function formatImpactSummary(analysis: ImpactAnalysis): string {
  if (analysis.affectedFiles.length === 0) return '';

  const lines = [
    `⚠️ Cross-file impact: ${analysis.affectedFiles.length} file(s) need follow-up`,
  ];

  for (const af of analysis.affectedFiles) {
    const reasonSummary = af.reasons
      .map((r) => `${r.type.replace(/-/g, ' ')} (${r.detectedSymbol})`)
      .join('; ');
    lines.push(`  • ${af.path} — ${reasonSummary}`);
  }

  return lines.join('\n');
}

/**
 * Build the orchestrator prompt injection for each affected file.
 * Orchestrator calls this once per affectedFile to construct the follow-up Coder call.
 */
export function buildFollowUpPrompt(
  affected: AffectedFile,
  originalUserPrompt: string
): string {
  const reasons = affected.reasons
    .map((r) => `- ${r.type.replace(/-/g, ' ')}: ${r.detectedSymbol}`)
    .join('\n');

  return (
    `The primary change for "${originalUserPrompt}" affects ${affected.path}.\n` +
    `Reasons:\n${reasons}\n\n` +
    `Fix ${affected.path} to be consistent with the primary changes. ` +
    `Use the same surgical SEARCH/REPLACE format. ` +
    `Only touch lines that break due to the above reasons — no unrelated refactoring.`
  );
}
