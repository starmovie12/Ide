/**
 * XML System Prompt Builder — Anthropic-standard format
 * Builds structured system prompts for Gemini agents.
 */

export interface AgentPromptConfig {
  name: string;
  role: string;
  systemPrompt: string;
  brainNotes?: string;
  fileContents?: Record<string, string>;
  activeFile?: string;
  routeOutputTo?: string | null;
  isReviewer?: boolean;
}

/**
 * Build an XML-structured system prompt for an agent.
 * Format inspired by Anthropic's best practices for complex instructions.
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
  <rule>Begin response with ✅ if code is approved or ❌ if issues found.</rule>
  <rule>List specific issues with file and line references.</rule>
  <rule>If ❌, send back to Coder agent with detailed fix instructions.</rule>
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

  if (config.fileContents && Object.keys(config.fileContents).length > 0) {
    const fileSection = Object.entries(config.fileContents)
      .map(([path, content]) => `  <file path="${escapeXml(path)}">\n    <![CDATA[\n${content}\n    ]]>\n  </file>`)
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
