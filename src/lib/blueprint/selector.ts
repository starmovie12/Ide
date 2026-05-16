import type { RepoBlueprint, BlueprintFile, BlueprintSelection } from './types';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s/_.-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function score(query: Set<string>, target: string): number {
  const targetTokens = tokenize(target);
  let hits = 0;
  for (const q of query) {
    if (targetTokens.has(q)) hits++;
  }
  return hits;
}

export function selectRelevantContext(
  blueprint: RepoBlueprint,
  userPrompt: string,
  maxFiles = 12
): BlueprintSelection {
  const queryTokens = tokenize(userPrompt);

  const scoredFiles: Array<{ file: BlueprintFile; score: number }> = blueprint.files.map((file) => {
    const pathScore = score(queryTokens, file.path) * 2;
    const summaryScore = score(queryTokens, file.summary);
    const exportScore = score(queryTokens, file.exports.join(' '));
    return { file, score: pathScore + summaryScore + exportScore };
  });

  scoredFiles.sort((a, b) => b.score - a.score);
  const topFiles = scoredFiles.slice(0, maxFiles).map((sf) => sf.file);

  const directDeps = new Set<string>();
  for (const file of topFiles) {
    const deps = blueprint.graph.imports[file.path] ?? [];
    for (const dep of deps) {
      const resolved = blueprint.files.find(
        (f) => f.path.includes(dep.replace('./', '').replace('../', ''))
      );
      if (resolved) directDeps.add(resolved.path);
    }
  }

  const allRelevantPaths = new Set([...topFiles.map((f) => f.path), ...directDeps]);
  const allFiles = blueprint.files.filter((f) => allRelevantPaths.has(f.path));

  const relevantSummaries: Record<string, string> = {};
  for (const f of allFiles) {
    if (blueprint.summaries[f.path]) {
      relevantSummaries[f.path] = blueprint.summaries[f.path];
    }
  }

  const mentionedSymbols = new Set<string>();
  for (const sym of Object.keys(blueprint.symbols)) {
    const queryLower = userPrompt.toLowerCase();
    if (queryLower.includes(sym.toLowerCase())) {
      mentionedSymbols.add(sym);
    }
  }

  const relevantSymbols: typeof blueprint.symbols = {};
  for (const sym of mentionedSymbols) {
    if (blueprint.symbols[sym]) {
      relevantSymbols[sym] = blueprint.symbols[sym];
    }
  }

  return {
    files: allFiles,
    relevantSummaries,
    relevantSymbols,
    rules: blueprint.rules,
    conventions: blueprint.conventions,
  };
}

export function formatBlueprintContext(selection: BlueprintSelection): string {
  const lines: string[] = ['<repo_blueprint>'];

  lines.push('<conventions>');
  lines.push(`Framework: ${selection.conventions.framework}`);
  lines.push(`Styling: ${selection.conventions.styling}`);
  lines.push(`TypeScript: ${selection.conventions.typescript}`);
  lines.push(`Routing: ${selection.conventions.routing}`);
  lines.push(`State: ${selection.conventions.stateManagement}`);
  lines.push('</conventions>');

  if (selection.rules.length > 0) {
    lines.push('<project_rules>');
    for (const rule of selection.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push('</project_rules>');
  }

  if (Object.keys(selection.relevantSummaries).length > 0) {
    lines.push('<relevant_files>');
    for (const [path, summary] of Object.entries(selection.relevantSummaries)) {
      const file = selection.files.find((f) => f.path === path);
      lines.push(`${path} (${file?.lines ?? '?'} lines, ${file?.role ?? 'other'}): ${summary}`);
    }
    lines.push('</relevant_files>');
  }

  if (Object.keys(selection.relevantSymbols).length > 0) {
    lines.push('<symbol_index>');
    for (const [sym, entry] of Object.entries(selection.relevantSymbols)) {
      const usedIn = entry.usedIn.map((u) => u.file).join(', ');
      lines.push(`${sym}: defined in ${entry.definedIn}, used in: ${usedIn || 'none'}`);
    }
    lines.push('</symbol_index>');
  }

  lines.push('</repo_blueprint>');
  return lines.join('\n');
}
