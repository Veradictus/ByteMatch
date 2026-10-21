/**
 * Finding one function in a source file, for showing a unit's code on its project page. Reports
 * say which file a unit comes from (objdiff's source_path) but not where in it a function is, so
 * this reads C and C++ just well enough to find a definition by name and where its body ends.
 */

export type FoundFunction =
  | { kind: "c"; start: number; end: number }
  /** Still assembly: the line that includes it (INCLUDE_ASM, GLOBAL_ASM, LINKER_REMNANT, #pragma GLOBAL_ASM…). */
  | { kind: "asm"; start: number; end: number };

/** Masks comments and string/char literals with spaces (keeping newlines), so braces and names inside them don't count. */
export function maskNonCode(text: string): string {
  const out: string[] = [];
  const blank = (ch: string) => (ch === "\n" ? "\n" : " ");
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") {
        out.push(" ");
        i++;
      }
    } else if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i++) out.push(blank(text[i]));
    } else if (c === '"' || c === "'") {
      out.push(" ");
      i++;
      while (i < text.length && text[i] !== c && text[i] !== "\n") {
        const step = text[i] === "\\" ? 2 : 1;
        for (let k = 0; k < step && i < text.length; k++, i++) out.push(blank(text[i]));
      }
      if (i < text.length) {
        out.push(blank(text[i]));
        i++;
      }
    } else {
      out.push(c);
      i++;
    }
  }
  return out.join("");
}

const lineOf = (text: string, index: number) => {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * For each position, how deep it sits inside function bodies (or initialisers): braces of
 * namespaces, extern "C" blocks, classes, structs and enums don't count, so a definition inside a
 * namespace or an inline method is still at depth 0, and a call inside a function never is.
 */
function bodyDepths(masked: string): (at: number) => number {
  const changes: [number, number][] = [[0, 0]];
  const stack: boolean[] = [];
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{") {
      const before = masked.slice(Math.max(0, i - 300), i);
      const head = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}")) + 1);
      const container = /\b(namespace|extern|class|struct|union|enum)\b/.test(head) && !/\)\s*(const\s*)?$/.test(head);
      stack.push(!container);
      if (!container) changes.push([i + 1, ++depth]);
    } else if (c === "}") {
      if (stack.pop()) changes.push([i, --depth]);
    }
  }
  return (at) => {
    let lo = 0;
    let hi = changes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (changes[mid][0] <= at) lo = mid;
      else hi = mid - 1;
    }
    return changes[lo][1];
  };
}

/** Where the body of a definition whose parameter list closes at CLOSE begins; null for a declaration or call. */
function bodyAfter(masked: string, close: number): number | null {
  const rest = masked.slice(close + 1, close + 1 + 2000);
  // Qualifiers and attributes: const, noexcept, override, __attribute__((...)), a trailing return.
  const q = /^[\s\w:()&*<>,-]*?\{/.exec(rest);
  if (q && !q[0].includes(";") && !/[=]/.test(q[0])) return close + q[0].length;
  // Old-style C: the parameters' types follow the list, each ended by ";", then the body.
  const kr = /^(\s*[A-Za-z_][\w\s*,[\]]*;)+\s*\{/.exec(rest);
  if (kr) return close + kr[0].length;
  return null;
}

/** The line range of the definition whose name starts at NAMEAT, with its leading return type and comment. */
function definitionRange(text: string, masked: string, nameAt: number, open: number): { start: number; end: number } | null {
  let depth = 0;
  let i = open;
  for (; i < masked.length; i++) {
    if (masked[i] === "(") depth++;
    else if (masked[i] === ")" && --depth === 0) break;
  }
  const brace = bodyAfter(masked, i);
  if (brace === null) return null;
  let k = brace;
  depth = 0;
  for (; k < masked.length; k++) {
    if (masked[k] === "{") depth++;
    else if (masked[k] === "}" && --depth === 0) break;
  }
  let start = lineOf(text, nameAt);
  const lines = text.split("\n");
  // The return type and qualifiers may sit on the lines before the name.
  while (start > 1 && /^\s*[\w*&:<>,\s]+$/.test(lines[start - 2]) && lines[start - 2].trim() && !/[;{}]\s*$/.test(lines[start - 2]))
    start--;
  // The comment directly above describes it.
  if (start > 1 && /\*\/\s*$/.test(lines[start - 2])) {
    let c = start - 1;
    while (c > 1 && !lines[c - 1].includes("/*")) c--;
    start = c;
  } else {
    while (start > 1 && /^\s*\/\//.test(lines[start - 2])) start--;
  }
  return { start, end: lineOf(text, Math.min(k, masked.length - 1)) };
}

/** Function names to look for: the report's (and its demangled form's) plain and qualified names. */
export function functionNames(name: string, demangled?: string | null): string[] {
  const out: string[] = [];
  const add = (n: string | null | undefined) => {
    const v = n?.trim();
    if (v && /^~?[A-Za-z_][\w:~]*$/.test(v) && !out.includes(v)) out.push(v);
    const plain = v?.split("::").pop();
    if (plain && /^~?[A-Za-z_]\w*$/.test(plain) && !out.includes(plain)) out.push(plain);
  };
  for (const n of [demangled, name]) {
    if (!n) continue;
    if (/^[\w:~]+$/.test(n)) {
      add(n);
      continue;
    }
    // A demangled signature: the name is what comes before its parameter list.
    const paren = n.indexOf("(");
    if (paren > 0)
      add(
        n
          .slice(0, paren)
          .trim()
          .split(/\s+/)
          .pop()
          ?.replace(/^[*&]+/, ""),
      );
    // MSVC's own mangling, when nothing demangled it: ?Name@Class@@..., ??0Class@@ (constructor), ??1Class@@ (destructor).
    const ms = /^\?(\?[01])?([^@?][^?]*?)@@/.exec(n);
    if (ms) {
      const parts = ms[2].split("@").filter(Boolean).reverse();
      const cls = parts.at(-1);
      if (ms[1] === "?0" && cls) add([...parts, cls].join("::"));
      else if (ms[1] === "?1" && cls) add([...parts, `~${cls}`].join("::"));
      else add(parts.join("::"));
    }
  }
  return out;
}

/** The address a function's name carries (func_00112380, fn_80008D40, function_9cbc0), if any. */
export function addressInName(name: string): number | null {
  const m = /(?:^|_)(?:0x)?([0-9a-fA-F]{5,8})$/.exec(name);
  return m ? parseInt(m[1], 16) : null;
}

/**
 * Where a function is in TEXT (1-based, inclusive lines), with the comment block directly above
 * it; or the assembly it still is; or null. NAMES are tried in order (see functionNames). With
 * ADDRESS, a comment naming it (reccmp's `// FUNCTION: LEGO1 0x100b12c0`, `// @retail 0x9cbc0`)
 * finds the definition under it whatever the function is called.
 */
export function findFunction(text: string, names: string | string[], address?: number | null): FoundFunction | null {
  const masked = maskNonCode(text);
  const depthAt = bodyDepths(masked);
  const list = [...new Set((Array.isArray(names) ? names : [names]).flatMap((n) => [n, n.split("::").pop()!]).filter(Boolean))];
  const lines = text.split("\n");
  const definitionOf = (n: string): FoundFunction | null => {
    const re = new RegExp(`(?<![\\w.>~])${escapeRe(n)}\\s*\\(`, "g");
    for (let m = re.exec(masked); m; m = re.exec(masked)) {
      if (depthAt(m.index) !== 0) continue;
      const r = definitionRange(text, masked, m.index, m.index + m[0].length - 1);
      if (r) return { kind: "c", ...r };
    }
    return null;
  };
  for (const n of list) {
    const found = definitionOf(n);
    if (found) return found;
  }
  // Written under another C name and tied to this one with an asm label:
  // `int helper_r(int x) __asm__("func_0011B4C8");` — find the C name and look for that.
  for (const n of list) {
    const label = new RegExp(`__asm(__)?\\s*\\(\\s*"${escapeRe(n)}"\\s*\\)`).exec(text);
    if (!label) continue;
    const before = masked.slice(0, label.index);
    const statement = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf("}")) + 1);
    const alias = /([A-Za-z_]\w*)\s*\(/.exec(statement)?.[1];
    if (alias && !list.includes(alias)) {
      const found = definitionOf(alias);
      if (found) return found;
    }
  }
  // Marked with its address in a comment, under whatever name the source gives it.
  if (address) {
    const hex = address.toString(16);
    const marker = new RegExp(`(\\/\\/|\\/\\*|^\\s*\\*|#).*\\b0x0*${hex}\\b`, "i");
    const at = lines.findIndex((l) => marker.test(l));
    if (at >= 0) {
      const from = lines.slice(0, at + 1).join("\n").length + 1;
      const re = /(?<![\w.>~])(~?[A-Za-z_][\w:~]*)\s*\(/g;
      re.lastIndex = from;
      for (let m = re.exec(masked); m && lineOf(text, m.index) <= at + 12; m = re.exec(masked)) {
        if (depthAt(m.index) !== 0) continue;
        const r = definitionRange(text, masked, m.index, m.index + m[0].length - 1);
        if (r) return { kind: "c", start: Math.min(r.start, at + 1), end: r.end };
      }
    }
  }
  // Still assembly, written in place: asm(".globl func_X\nfunc_X:\n\t...");
  for (const n of list) {
    const label = new RegExp(`(\\b${escapeRe(n)}\\s*:|\\.glob(a)?l\\s+${escapeRe(n)}\\b|glabel\\s+${escapeRe(n)}\\b)`);
    const block = /\b(?:__asm__|__asm|asm)\s*(?:volatile\s*|__volatile__\s*)?\(/g;
    for (let m = block.exec(masked); m; m = block.exec(masked)) {
      if (depthAt(m.index) !== 0) continue;
      let depth = 0;
      let i = m.index + m[0].length - 1;
      for (; i < masked.length; i++) {
        if (masked[i] === "(") depth++;
        else if (masked[i] === ")" && --depth === 0) break;
      }
      if (label.test(text.slice(m.index, i))) return { kind: "asm", start: lineOf(text, m.index), end: lineOf(text, i) };
    }
  }
  // Not written in C (yet): find the line that pulls in its assembly. Projects name these macros
  // differently (INCLUDE_ASM, GLOBAL_ASM, ASM_FUNC, LINKER_REMNANT…): any all-caps call naming it.
  for (const n of list) {
    const asm = new RegExp(`^\\s*(#\\s*pragma\\s+)?[A-Z][A-Z0-9_]*\\s*\\(.*\\b${escapeRe(n)}\\b`);
    const at = lines.findIndex((l) => asm.test(l));
    if (at >= 0) return { kind: "asm", start: at + 1, end: at + 1 };
  }
  return null;
}

/** A source path from a report, if it's safe to ask a repository for: relative, no "..". */
export function cleanSourcePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!p || p.startsWith("/") || /^[a-z]:/i.test(p) || p.split("/").some((s) => s === ".." || s === "") || p.length > 400) return null;
  return p;
}

// ---- Highlighting ----

export type TokenKind = "comment" | "string" | "keyword" | "type" | "number" | "preproc" | "plain";

const KEYWORDS = new Set(
  "if else for while do switch case default break continue return goto sizeof typedef struct union enum static extern const volatile inline register restrict auto class namespace template typename public private protected virtual override new delete this using operator friend true false nullptr NULL".split(
    " ",
  ),
);
const TYPES = /^(void|char|short|int|long|float|double|signed|unsigned|bool|s8|s16|s32|s64|u8|u16|u32|u64|f32|f64|size_t|u_\w+|\w+_t)$/;

/** One line's tokens. `inComment` carries a block comment over from the line before. */
export function highlightLine(line: string, inComment: boolean): { tokens: [TokenKind, string][]; inComment: boolean } {
  const tokens: [TokenKind, string][] = [];
  let i = 0;
  const push = (k: TokenKind, s: string) => {
    if (!s) return;
    const last = tokens[tokens.length - 1];
    if (last && last[0] === k) last[1] += s;
    else tokens.push([k, s]);
  };
  if (inComment) {
    const end = line.indexOf("*/");
    if (end < 0) return { tokens: [["comment", line]], inComment: true };
    push("comment", line.slice(0, end + 2));
    i = end + 2;
  }
  if (!inComment && /^\s*#/.test(line)) return { tokens: [["preproc", line]], inComment: false };
  while (i < line.length) {
    const rest = line.slice(i);
    let m: RegExpMatchArray | null;
    if (rest.startsWith("//")) {
      push("comment", rest);
      break;
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      if (end < 0) {
        push("comment", rest);
        return { tokens, inComment: true };
      }
      push("comment", rest.slice(0, end + 2));
      i += end + 2;
    } else if ((m = rest.match(/^"(?:\\.|[^"\\])*"?|^'(?:\\.|[^'\\])*'?/))) {
      push("string", m[0]);
      i += m[0].length;
    } else if ((m = rest.match(/^(0x[0-9a-fA-F]+|\d+\.?\d*(e[+-]?\d+)?)[uUlLfF]*/))) {
      push("number", m[0]);
      i += m[0].length;
    } else if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      push(KEYWORDS.has(m[0]) ? "keyword" : TYPES.test(m[0]) ? "type" : "plain", m[0]);
      i += m[0].length;
    } else {
      push("plain", line[i]);
      i++;
    }
  }
  return { tokens, inComment: false };
}

/** Every line's tokens, carrying block comments from line to line. */
export function highlight(code: string): [TokenKind, string][][] {
  const rows: [TokenKind, string][][] = [];
  let inComment = false;
  for (const line of code.split("\n")) {
    const r = highlightLine(line, inComment);
    inComment = r.inComment;
    rows.push(r.tokens);
  }
  return rows;
}
