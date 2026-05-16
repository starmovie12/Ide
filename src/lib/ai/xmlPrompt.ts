/**
 * XML System Prompt Builder — v6 Phase 5
 * §1.2: Blueprint context is injected into every agent call.
 *       Blueprint is NEVER sent in full — only the selected context
 *       (~5-15KB) from blueprint/selector.ts.
 */

import type { BlueprintSelection } from '@/lib/blueprint/types';

export interface AgentPromptConfig {
  name: string;
  role: string;
  systemPrompt: string;
  brainNotes?: string;
  fileContents?: Record<string, string>;
  activeFile?: string;
  routeOutputTo?: string | null;
  isReviewer?: boolean;
  /** §1.2 blueprint context — injected from selectContextForPrompt() */
  blueprintContext?: BlueprintSelection | null;
}

/**
 * Build an XML-structured system prompt for an agent.
 * Format inspired by Anthropic's best practices for complex instructions.
 * §1.2: blueprintContext is included as <repo_context> when provided.
 */
export function buildXMLPrompt(config: AgentPromptConfig): string {
  const sections: string[] = [];

  sections.push(`<agent_identity>
  <name>${escapeXml(config.name)}</name>
  <role>${escapeXml(config.role)}</role>
</agent_identity>`);

  sections.push(`<instructions>
${escapeXml(config.systemPrompt)}
</instructions>`);

  sections.push(`<output_format>
  <rule>Always use Aider-style SEARCH/REPLACE blocks for code changes.</rule>
  <rule>Never rewrite complete files. Only output changed sections.</rule>
  <rule>Format:
<<<<<<< SEARCH
[exact original code]
=======
[new replacement code]
>>>>>>> REPLACE
  </rule>
  <rule>One block per logical change.</rule>
  <rule>Include file path before each block: // file: path/to/file.ext</rule>
</output_format>`);

  if (config.isReviewer) {
    sections.push(`<reviewer_protocol>
  <rule>Begin response with PASS (all checks pass) or FAIL (any check fails).</rule>
  <rule>On FAIL: Issue: [specific problem — file + line] · Suggestion: [exact fix in 1-2 sentences].</rule>
  <rule>Never PASS a diff that hallucinates SEARCH context (SEARCH must exist in file).</rule>
  <rule>Never PASS a full-file rewrite when surgical edits suffice (§1.3 matrix).</rule>
</reviewer_protocol>`);
  }

  if (config.routeOutputTo) {
    sections.push(`<routing>
  <next_agent>${escapeXml(config.routeOutputTo)}</next_agent>
  <instruction>After completing your task, your output will be forwarded to ${escapeXml(config.routeOutputTo)}.</instruction>
</routing>`);
  }

  if (config.brainNotes) {
    sections.push(`<brain_notes>
${escapeXml(config.brainNotes)}
</brain_notes>`);
  }

  // §1.2 Blueprint context injection — the "secret sauce"
  // Never send the full blueprint. Only the selected subset (~5-15KB).
  if (config.blueprintContext) {
    const ctx = config.blueprintContext;
    sections.push(formatBlueprintSection(ctx));
  }

  if (config.fileContents && Object.keys(config.fileContents).length > 0) {
    const fileSection = Object.entries(config.fileContents)
      .map(
        ([path, content]) =>
          `  <file path="${escapeXml(path)}">\n    <![CDATA[\n${content}\n    ]]>\n  </file>`
      )
      .join('\n');

    sections.push(`<project_files>
${fileSection}
</project_files>`);
  }

  if (config.activeFile) {
    sections.push(`<active_file>${escapeXml(config.activeFile)}</active_file>`);
  }

  return sections.join('\n\n');
}

/**
 * Format BlueprintSelection into an XML <repo_context> block.
 * §1.2: Includes file tree, relevant file summaries, symbols, conventions, and rules.
 * Target: ~5-15KB of compressed context, not megabytes of raw code.
 */
function formatBlueprintSection(ctx: BlueprintSelection): string {
  const lines: string[] = ['<repo_context>'];

  // Full file tree (compact — no content, just structure)
  if (ctx.fullFileTreeSummary) {
    lines.push('  <file_tree>');
    lines.push(`    ${ctx.fullFileTreeSummary.replace(/\n/g, '\n    ')}`);
    lines.push('  </file_tree>');
  }

  // Project conventions — framework, styling, routing etc.
  if (ctx.conventions) {
    const c = ctx.conventions;
    lines.push('  <conventions>');
    lines.push(`    framework=${c.framework} · styling=${c.styling} · routing=${c.routing}`);
    lines.push(`    state=${c.stateManagement} · tests=${c.testingFramework} · typescript=${c.typescript}`);
    lines.push('  </conventions>');
  }

  // Project rules — derived by Phase D of builder
  if (ctx.rules && ctx.rules.length > 0) {
    lines.push('  <project_rules>');
    for (const rule of ctx.rules) {
      lines.push(`    - ${rule}`);
    }
    lines.push('  </project_rules>');
  }

  // Relevant file summaries — top 10-25 files scored for this prompt
  if (ctx.files && ctx.files.length > 0) {
    lines.push('  <relevant_files>');
    for (const f of ctx.files.slice(0, 25)) {
      const summary = ctx.relevantSummaries[f.path] ?? f.summary;
      lines.push(`    <file path="${escapeXml(f.path)}" lines="${f.lines}" role="${f.role}">`);
      if (summary) lines.push(`      ${escapeXml(summary)}`);
      if (f.exports.length > 0) {
        lines.push(`      exports: ${f.exports.slice(0, 10).join(', ')}`);
      }
      lines.push('    </file>');
    }
    lines.push('  </relevant_files>');
  }

  // Relevant symbols — where each symbol is defined and used
  const symbols = Object.entries(ctx.relevantSymbols ?? {}).slice(0, 20);
  if (symbols.length > 0) {
    lines.push('  <relevant_symbols>');
    for (const [name, entry] of symbols) {
      const usageCount = entry.usedIn.length;
      lines.push(
        `    ${escapeXml(name)}: defined in ${escapeXml(entry.definedIn)} · used in ${usageCount} file(s)`
      );
    }
    lines.push('  </relevant_symbols>');
  }

  lines.push('</repo_context>');
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Quick builder for the continuation/auto-resume prompt */
export function buildContinuationPrompt(partialOutput: string): string {
  return `<continuation_request>
  <instruction>Your previous response was cut off due to token limits. Continue EXACTLY from where you stopped. Do not repeat any content. Do not add preamble. Start immediately from the next character.</instruction>
  <partial_output>
${partialOutput.slice(-500)}
  </partial_output>
</continuation_request>`;
}
