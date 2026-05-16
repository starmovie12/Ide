/**
 * Blueprint Selector — Phase 5 §1.2
 *
 * Converts a user prompt + full RepoBlueprint into a compact BlueprintSelection
 * (~5-15KB) suitable for injection into an agent call.
 *
 * v6: added PRD-spec functions:
 *   selectContextForPrompt()  — matches §1.2 API exactly
 *   buildTreeSummary()        — compact ASCII tree, no content
 *   expandWithGraph()         — BFS expansion of top-N via dependency graph
 *   filterSymbolsToFiles()    — narrow SymbolIndex to a file set
 *   extractKeywords()         — simple tokeniser
 */

import type {
  RepoBlueprint,
  BlueprintFile,
  BlueprintSelection,
  SymbolIndex,
} from './types';

// ── Internal helpers ──────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s/_.-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function countMatches(target: string, query: Set<string>): number {
  const targetTokens = tokenize(target);
  let hits = 0;
  for (const q of query) {
    if (targetTokens.has(q)) hits++;
  }
  return hits;
}

function scoreFile(file: BlueprintFile, query: Set<string>): number {
  return (
    countMatches(file.path, query) * 3 +
    countMatches(file.summary, query) * 2 +
    countMatches(file.exports.join(' '), query) * 4
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Simple keyword tokeniser — used by Manager agent prompt injection.
 */
export function extractKeywords(text: string): Set<string> {
  return tokenize(text);
}

/**
 * BFS expansion: given a seed file set, add direct dependencies (depth=1 or 2).
 * §1.2: "Expand with direct dependents/dependencies of top files".
 */
export function expandWithGraph(
  seedPaths: string[],
  graph: RepoBlueprint['graph'],
  depth = 1
): string[] {
  const expanded = new Set<string>(seedPaths);

  let frontier = [...seedPaths];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const p of frontier) {
      const deps = graph.imports[p] ?? [];
      const usedBy = graph.importedBy[p] ?? [];
      for (const dep of [...deps, ...usedBy]) {
        if (!expanded.has(dep)) {
          expanded.add(dep);
          next.push(dep);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return Array.from(expanded);
}

/**
 * Narrow a full SymbolIndex to only symbols defined in or used by `filePaths`.
 */
export function filterSymbolsToFiles(
  symbols: SymbolIndex,
  filePaths: string[]
): SymbolIndex {
  const pathSet = new Set(filePaths);
  const filtered: SymbolIndex = {};

  for (const [sym, entry] of Object.entries(symbols)) {
    if (pathSet.has(entry.definedIn)) {
      filtered[sym] = entry;
      continue;
    }
    const relevantUses = entry.usedIn.filter((u) => pathSet.has(u.file));
    if (relevantUses.length > 0) {
      filtered[sym] = { ...entry, usedIn: relevantUses };
    }
  }

  return filtered;
}

/**
 * Build a compact ASCII file-tree summary.
 * No file content — just path structure + role + line count.
 * Sent with every agent call so the model knows the full repo shape.
 */
export function buildTreeSummary(blueprint: RepoBlueprint): string {
  const lines: string[] = [`# ${blueprint.repoOwner}/${blueprint.repoName} (${blueprint.files.length} files)\n`];

  // Group by top-level directory
  const groups: Record<string, BlueprintFile[]> = {};
  for (const file of blueprint.files) {
    const parts = file.path.split('/');
    const topDir = parts.length > 1 ? parts[0] : '.';
    if (!groups[topDir]) groups[topDir] = [];
    groups[topDir].push(file);
  }

  for (const [dir, files] of Object.entries(groups).sort()) {
    lines.push(`${dir}/`);
    for (const f of files.slice(0, 40)) {
      // cap per-dir to avoid token bloat
      const rel = f.path.replace(`${dir}/`, '');
      lines.push(`  ${rel} (${f.lines}L, ${f.role})`);
    }
    if (files.length > 40) {
      lines.push(`  … +${files.length - 40} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Main entry point — matches §1.2 selectContextForPrompt() API.
 *
 * Returns ~10-25 relevant files + filtered symbols + compact tree,
 * ready to be serialised and injected into an agent's context.
 */
export function selectContextForPrompt(
  prompt: string,
  blueprint: RepoBlueprint,
  maxFiles = 10
): BlueprintSelection {
  const keywords = extractKeywords(prompt);

  // Score + rank every file
  const scored = blueprint.files.map((f) => ({
    file: f,
    score: scoreFile(f, keywords),
  }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, maxFiles).map((s) => s.file);
  const topPaths = top.map((f) => f.path);

  // BFS-expand with depth=1 to catch direct imports/consumers
  const expandedPaths = expandWithGraph(topPaths, blueprint.graph, 1);

  // Resolve to BlueprintFile objects (some paths may be external deps — skip)
  const pathSet = new Set(expandedPaths);
  const allFiles = blueprint.files.filter((f) => pathSet.has(f.path));

  // Build relevant summaries
  const relevantSummaries: Record<string, string> = {};
  for (const f of allFiles) {
    if (blueprint.summaries[f.path]) {
      relevantSummaries[f.path] = blueprint.summaries[f.path];
    }
  }

  // Filter symbol index to only relevant files
  const relevantSymbols = filterSymbolsToFiles(blueprint.symbols, expandedPaths);

  // Also include symbols explicitly mentioned in the prompt
  for (const [sym, entry] of Object.entries(blueprint.symbols)) {
    if (!relevantSymbols[sym] && prompt.toLowerCase().includes(sym.toLowerCase())) {
      relevantSymbols[sym] = entry;
    }
  }

  return {
    files: allFiles,
    relevantSummaries,
    relevantSymbols,
    rules: blueprint.rules,
    conventions: blueprint.conventions,
    fullFileTreeSummary: buildTreeSummary(blueprint),
  };
}

/**
 * Legacy name kept for backward compat with stores/hooks built in Phase 4.
 */
export function selectRelevantContext(
  blueprint: RepoBlueprint,
  userPrompt: string,
  maxFiles = 12
): BlueprintSelection {
  return selectContextForPrompt(userPrompt, blueprint, maxFiles);
}

/**
 * Serialise a BlueprintSelection into an XML block for agent system prompts.
 * §1.2: "~5-15KB of compressed context per agent call".
 */
export function formatBlueprintContext(selection: BlueprintSelection): string {
  const lines: string[] = ['<repo_blueprint>'];

  lines.push('<file_tree>');
  lines.push(selection.fullFileTreeSummary);
  lines.push('</file_tree>');

  lines.push('<conventions>');
  lines.push(`Framework: ${selection.conventions.framework}`);
  lines.push(`Styling: ${selection.conventions.styling}`);
  lines.push(`TypeScript: ${selection.conventions.typescript}`);
  lines.push(`Routing: ${selection.conventions.routing}`);
  lines.push(`State: ${selection.conventions.stateManagement}`);
  lines.push(`Package manager: ${selection.conventions.packageManager}`);
  lines.push('</conventions>');

  if (selection.rules.length > 0) {
    lines.push('<project_rules>');
    for (const rule of selection.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push('</project_rules>');
  }

  const summaryEntries = Object.entries(selection.relevantSummaries);
  if (summaryEntries.length > 0) {
    lines.push('<relevant_files>');
    for (const [path, summary] of summaryEntries) {
      const file = selection.files.find((f) => f.path === path);
      lines.push(
        `${path} (${file?.lines ?? '?'}L, ${file?.role ?? 'other'}): ${summary}`
      );
    }
    lines.push('</relevant_files>');
  }

  const symbolEntries = Object.entries(selection.relevantSymbols);
  if (symbolEntries.length > 0) {
    lines.push('<symbol_index>');
    for (const [sym, entry] of symbolEntries) {
      const usedIn = entry.usedIn.map((u) => u.file).join(', ');
      lines.push(
        `${sym} (${entry.type}): defined in ${entry.definedIn}:${entry.definedAtLine}` +
          (usedIn ? `, used in: ${usedIn}` : '')
      );
    }
    lines.push('</symbol_index>');
  }

  lines.push('</repo_blueprint>');
  return lines.join('\n');
}
