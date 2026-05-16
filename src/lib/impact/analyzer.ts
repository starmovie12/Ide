import type { DiffBlock } from '@/lib/diff/parser';
import type { RepoBlueprint } from '@/lib/blueprint/types';

export interface AffectedFile {
  path: string;
  reason:
    | 'imports-removed-symbol'
    | 'uses-changed-signature'
    | 'uses-changed-component-props'
    | 'uses-changed-type'
    | 'breaks-test';
  detectedSymbol: string;
  occurrences: { line: number; snippet: string }[];
}

export interface ImpactAnalysis {
  primaryFiles: string[];
  affectedFiles: AffectedFile[];
  riskScore: 'low' | 'medium' | 'high';
}

function extractRemovedExports(block: DiffBlock): string[] {
  if (!block.searchContent) return [];
  const removed: string[] = [];
  const lines = block.searchContent.split('\n');
  const replaceLines = block.replaceContent.split('\n');

  const exportRe = /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/;

  for (const line of lines) {
    const match = line.match(exportRe);
    if (match) {
      const sym = match[1];
      const stillPresent = replaceLines.some((r) => r.includes(`export`) && r.includes(sym));
      if (!stillPresent) {
        removed.push(sym);
      }
    }
  }

  return removed;
}

function extractChangedComponentProps(block: DiffBlock): string[] {
  if (!block.searchContent) return [];
  const changed: string[] = [];
  const interfaceMatch = block.searchContent.match(/interface\s+(\w+Props)/);
  const replaceMatch = block.replaceContent.match(/interface\s+(\w+Props)/);

  if (interfaceMatch) {
    const name = interfaceMatch[1];
    if (replaceMatch && replaceMatch[1] === name) {
      if (block.searchContent !== block.replaceContent) {
        changed.push(name.replace('Props', ''));
      }
    }
  }

  return changed;
}

export function analyzeImpact(
  diffs: DiffBlock[],
  blueprint: RepoBlueprint
): ImpactAnalysis {
  const primaryFiles = diffs.map((d) => d.filePath).filter((p) => p !== 'unknown');
  const affectedMap = new Map<string, AffectedFile>();

  for (const block of diffs) {
    const removedSymbols = extractRemovedExports(block);
    const changedProps = extractChangedComponentProps(block);

    for (const sym of removedSymbols) {
      const entry = blueprint.symbols[sym];
      if (!entry) continue;

      for (const use of entry.usedIn) {
        if (primaryFiles.includes(use.file)) continue;

        const key = `${use.file}::${sym}`;
        if (!affectedMap.has(key)) {
          affectedMap.set(key, {
            path: use.file,
            reason: 'imports-removed-symbol',
            detectedSymbol: sym,
            occurrences: [{ line: use.line, snippet: `Uses ${sym}` }],
          });
        }
      }
    }

    for (const componentName of changedProps) {
      const entry = blueprint.symbols[componentName];
      if (!entry) continue;

      for (const use of entry.usedIn) {
        if (primaryFiles.includes(use.file)) continue;

        const key = `${use.file}::${componentName}::props`;
        if (!affectedMap.has(key)) {
          affectedMap.set(key, {
            path: use.file,
            reason: 'uses-changed-component-props',
            detectedSymbol: componentName,
            occurrences: [{ line: use.line, snippet: `Uses <${componentName} />` }],
          });
        }
      }
    }
  }

  const affectedFiles = Array.from(affectedMap.values());
  const riskScore: ImpactAnalysis['riskScore'] =
    affectedFiles.length === 0 ? 'low' : affectedFiles.length < 4 ? 'medium' : 'high';

  return { primaryFiles, affectedFiles, riskScore };
}

export function formatImpactSummary(analysis: ImpactAnalysis): string {
  if (analysis.affectedFiles.length === 0) return '';

  const lines = [`⚠️ Impact: ${analysis.affectedFiles.length} affected file(s)`];
  for (const af of analysis.affectedFiles) {
    lines.push(`  • ${af.path} — ${af.reason.replace(/-/g, ' ')} (${af.detectedSymbol})`);
  }
  return lines.join('\n');
}
