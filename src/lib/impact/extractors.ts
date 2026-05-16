/**
 * Impact Extractor Helpers — Phase 5 §1.4
 *
 * Regex-based extractors that parse a SearchReplaceBlock diff to determine
 * what exports were removed, renamed, or had their signatures changed.
 *
 * Phase 6 upgrade path: replace regexes with web-tree-sitter for full AST accuracy.
 */

import type { SearchReplaceBlock } from '@/lib/diff/parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemovedSymbol {
  name: string;
  kind: 'function' | 'component' | 'class' | 'const' | 'type' | 'interface' | 'enum' | 'unknown';
}

export interface ChangedSignature {
  name: string;
  oldSignature: string;
  newSignature: string;
}

export interface ChangedProp {
  componentName: string;
  removedProps: string[];
  renamedProps: Array<{ from: string; to: string }>;
}

export interface ChangedType {
  name: string;
  kind: 'type' | 'interface' | 'enum';
}

// ─── Export extraction regexes ────────────────────────────────────────────────

/** Matches named exports: export function/const/class/type/interface/enum Foo */
const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface|enum|let|var)\s+(\w+)/gm;

/** Matches re-exports: export { Foo, Bar } */
const REEXPORT_RE = /^\s*export\s+\{([^}]+)\}/gm;

function extractExportNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(EXPORT_RE)) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(REEXPORT_RE)) {
    m[1].split(',').forEach((s) => {
      const name = s.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    });
  }
  return names;
}

/**
 * Returns the set of symbol names that exist in SEARCH but NOT in REPLACE.
 * These are "removed" exports the impact engine should track.
 */
export function extractRemovedExports(block: SearchReplaceBlock): RemovedSymbol[] {
  const inSearch  = extractExportNames(block.search);
  const inReplace = extractExportNames(block.replace);
  const removed: RemovedSymbol[] = [];

  for (const name of inSearch) {
    if (!inReplace.has(name)) {
      removed.push({ name, kind: guessKind(block.search, name) });
    }
  }
  return removed;
}

function guessKind(code: string, name: string): RemovedSymbol['kind'] {
  if (new RegExp(`(?:function|async function)\\s+${name}`).test(code)) return 'function';
  if (new RegExp(`(?:class)\\s+${name}`).test(code))                    return 'class';
  if (new RegExp(`(?:type)\\s+${name}\\s*[=<]`).test(code))            return 'type';
  if (new RegExp(`(?:interface)\\s+${name}`).test(code))                return 'interface';
  if (new RegExp(`(?:enum)\\s+${name}`).test(code))                     return 'enum';
  // Capitalised name → likely a React component
  if (/^[A-Z]/.test(name)) return 'component';
  return 'const';
}

// ─── Function signature change detection ─────────────────────────────────────

/** Matches: export function Foo(a: T, b: U): R { */
const FN_SIG_RE = /export\s+(?:async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*[^\{]+)?/g;

/**
 * Detects function signatures that exist in both SEARCH and REPLACE
 * but have changed parameter lists.
 */
export function extractChangedFunctionSignatures(block: SearchReplaceBlock): ChangedSignature[] {
  const searchSigs = parseFunctionSignatures(block.search);
  const replaceSigs = parseFunctionSignatures(block.replace);
  const changed: ChangedSignature[] = [];

  for (const [name, oldSig] of searchSigs) {
    const newSig = replaceSigs.get(name);
    if (newSig && newSig !== oldSig) {
      changed.push({ name, oldSignature: oldSig, newSignature: newSig });
    }
  }
  return changed;
}

function parseFunctionSignatures(code: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of code.matchAll(FN_SIG_RE)) {
    map.set(m[1], m[0].trim());
  }
  return map;
}

// ─── Component prop change detection ─────────────────────────────────────────

/** Matches interface Props or type Props = */
const PROPS_INTERFACE_RE = /(?:interface|type)\s+(\w*Props\w*)\s*(?:=\s*)?\{([^}]*)\}/gs;

/**
 * Detects Props interface/type changes in TSX components.
 * Returns component name + removed/renamed props.
 */
export function extractChangedComponentProps(block: SearchReplaceBlock): ChangedProp[] {
  const searchProps  = parsePropsInterfaces(block.search);
  const replaceProps = parsePropsInterfaces(block.replace);
  const changed: ChangedProp[] = [];

  for (const [interfaceName, oldProps] of searchProps) {
    const newProps = replaceProps.get(interfaceName);
    if (!newProps) continue;

    const removedProps = [...oldProps].filter((p) => !newProps.has(p));
    if (removedProps.length > 0) {
      changed.push({ componentName: interfaceName, removedProps, renamedProps: [] });
    }
  }
  return changed;
}

function parsePropsInterfaces(code: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const m of code.matchAll(PROPS_INTERFACE_RE)) {
    const interfaceName = m[1];
    const body = m[2];
    const propNames = new Set(
      body
        .split('\n')
        .map((l) => l.trim().split(/[?:]/)[0].trim())
        .filter((s) => s.length > 0 && !s.startsWith('//')),
    );
    map.set(interfaceName, propNames);
  }
  return map;
}

// ─── Type change detection ────────────────────────────────────────────────────

/**
 * Detects exported types/interfaces/enums that changed between SEARCH and REPLACE.
 */
export function extractChangedTypes(block: SearchReplaceBlock): ChangedType[] {
  const searchTypes  = parseExportedTypes(block.search);
  const replaceTypes = parseExportedTypes(block.replace);
  const changed: ChangedType[] = [];

  for (const [name, kind] of searchTypes) {
    const newKind = replaceTypes.get(name);
    if (newKind && block.search !== block.replace) {
      // Type still exists but content changed — mark as changed
      changed.push({ name, kind });
    }
  }
  return changed;
}

const EXPORTED_TYPE_RE =
  /^\s*export\s+(?:type|interface|enum)\s+(\w+)/gm;

function parseExportedTypes(code: string): Map<string, ChangedType['kind']> {
  const map = new Map<string, ChangedType['kind']>();
  for (const m of code.matchAll(EXPORTED_TYPE_RE)) {
    const keyword = m[0].trim().split(/\s+/)[1] as ChangedType['kind'];
    map.set(m[1], keyword);
  }
  return map;
}
