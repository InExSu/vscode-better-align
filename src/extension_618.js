"use strict";
// ============================================================
// Code.Align.Columns — VS Code Extension
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = exports.DEFAULT_LANGUAGE_RULES = exports.detectLanguageRules = exports.alignBlock = exports.findLineBlocks = exports.parseLineIgnoringStrings = exports.applyPositionMap = exports.buildPairwisePositionMap = exports.findAlignCharsGreedy = exports.a_Chain = exports.NS_Container = exports.err = exports.ok = exports.deactivate = exports.activate = void 0;
// ── 1. IMPORTS ───────────────────────────────────────────────
const vscode = __importStar(require("vscode"));
const ok = (v) => ({ ok: true, value: v });
exports.ok = ok;
const err = (e) => ({ ok: false, error: e });
exports.err = err;
const ns_Error = (ns) => ns.result.ok === false;
const ns_SetError = (ns, e) => {
    ns.result = err(e);
    ns.s_Error = e;
};
// ── 4. RWD + a_Chain ─────────────────────────────────────────
const timers = new Map();
const line = (ch) => ch.repeat(50);
function decor_Start(name) {
    timers.set(name, performance.now());
    console.log(`\n${line('═')}`);
    console.log(`▶  ${name}`);
    console.log(`${line('─')}`);
}
function decor_Finish(name) {
    const start = timers.get(name);
    const duration = start ? (performance.now() - start).toFixed(2) : '?';
    console.log(`${line('─')}`);
    console.log(`◀  ${name} (${duration}ms)`);
    console.log(`${line('═')}\n`);
    timers.delete(name);
}
function rwd(fn, ns) {
    if (ns_Error(ns)) {
        return;
    }
    decor_Start(fn.name);
    fn(ns);
    decor_Finish(fn.name);
}
function a_Chain(ns) {
    rwd(config_Load_Decor, ns);
    rwd(language_Detect_Decor, ns);
    rwd(block_Find_Decor, ns);
    rwd(lines_Parse_Decor, ns);
    rwd(alignment_Apply_Decor, ns);
    rwd(text_Replace_Decor, ns);
}
exports.a_Chain = a_Chain;
// ── 5. CONFIG ────────────────────────────────────────────────
const CONFIG = {
    b_Debug: false,
    defaultAlignChars: ['===', '!==', '<=>', '=>', '->', '==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '%=', '**=', ':', '{', '=', ','],
    maxBlockSize: 500,
    preserveComments: true,
    preserveStrings: true,
    alignMultilineBlocks: false,
    skipTemplates: true,
    greedyMatch: true,
    minColumns: 1,
    maxSpaces: 10,
    testData: {},
};
exports.CONFIG = CONFIG;
// ── 6. NS_Container ──────────────────────────────────────────
function NS_Container(cfg) {
    return {
        result: ok({}),
        s_Error: '',
        config: cfg,
        data: {
            editor: false,
            languageRules: false,
            blocks: [],
            parsedLines: [],
            alignedLines: [],
        },
        ...cfg.testData,
    };
}
exports.NS_Container = NS_Container;
// ── 7. LANGUAGE RULES MAP ─────────────────────────────────────
const LANGUAGE_RULES = {
    typescript: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', "'", '`'],
        alignChars: CONFIG.defaultAlignChars,
    },
    javascript: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', "'", '`'],
        alignChars: CONFIG.defaultAlignChars,
    },
    python: {
        lineComments: ['#'],
        blockComments: [],
        stringDelimiters: ['"', "'"],
        alignChars: CONFIG.defaultAlignChars,
    },
    rust: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"'],
        alignChars: CONFIG.defaultAlignChars,
    },
    go: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', '`'],
        alignChars: CONFIG.defaultAlignChars,
    },
    lua: {
        lineComments: ['--'],
        blockComments: [{ start: '--[[', end: ']]' }],
        stringDelimiters: ['"', "'"],
        alignChars: CONFIG.defaultAlignChars,
    },
    sql: {
        lineComments: ['--'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', "'"],
        alignChars: CONFIG.defaultAlignChars,
    },
};
const DEFAULT_LANGUAGE_RULES = {
    lineComments: ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars: CONFIG.defaultAlignChars,
};
exports.DEFAULT_LANGUAGE_RULES = DEFAULT_LANGUAGE_RULES;
// ── 8. _DECOR FUNCTIONS ───────────────────────────────────────
/**
 * Load configuration from VS Code settings or use defaults.
 */
function config_Load_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.languageRules = DEFAULT_LANGUAGE_RULES;
        return;
    }
    try {
        const vsConfig = vscode.workspace.getConfiguration('codeAlign');
        const alignChars = vsConfig.get('alignChars', ns.config.defaultAlignChars);
        const loadedCfg = loadConfig(vsConfig, alignChars, ns.config);
        ns.config = { ...ns.config, ...loadedCfg };
        ns.result = ok(ns.config);
    }
    catch (e) {
        ns_SetError(ns, e.message);
    }
}
/**
 * Detect the current editor language and load its rules.
 */
function language_Detect_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.languageRules = DEFAULT_LANGUAGE_RULES;
        return;
    }
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            ns_SetError(ns, 'No active editor');
            return;
        }
        ns.data.editor = editor;
        const langId = editor.document.languageId;
        ns.data.languageRules = detectLanguageRules(langId, ns.config.defaultAlignChars);
        ns.result = ok(ns.data.languageRules);
    }
    catch (e) {
        ns_SetError(ns, e.message);
    }
}
/**
 * Find blocks of consecutive non-empty lines with the same indentation
 * within the current selection or whole document.
 */
function block_Find_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.blocks = ns['testBlocks'] ?? [];
        ns.result = ok(ns.data.blocks);
        return;
    }
    try {
        const editor = ns.data.editor;
        if (!editor) {
            ns_SetError(ns, 'No active editor');
            return;
        }
        const rules = ns.data.languageRules;
        if (!rules) {
            ns_SetError(ns, 'No language rules');
            return;
        }
        const doc = editor.document;
        const selection = editor.selection;
        let startLine, endLine;
        if (selection.isEmpty) {
            const activeLine = selection.active.line;
            const initialIndent = doc.lineAt(activeLine).text.match(/^\s*/)?.[0] ?? '';
            startLine = activeLine;
            while (startLine > 0) {
                const prevLine = doc.lineAt(startLine - 1);
                if (prevLine.isEmptyOrWhitespace || (prevLine.text.match(/^\s*/)?.[0] ?? '') !== initialIndent) {
                    break;
                }
                startLine--;
            }
            endLine = activeLine;
            while (endLine < doc.lineCount - 1) {
                const nextLine = doc.lineAt(endLine + 1);
                if (nextLine.isEmptyOrWhitespace || (nextLine.text.match(/^\s*/)?.[0] ?? '') !== initialIndent) {
                    break;
                }
                endLine++;
            }
        }
        else {
            startLine = selection.start.line;
            endLine = selection.end.line;
        }
        const rawLines = extractRawLines(doc, startLine, endLine);
        ns.data.blocks = findLineBlocks(rawLines, startLine, rules, ns.config.maxBlockSize);
        ns.result = ok(ns.data.blocks);
    }
    catch (e) {
        ns_SetError(ns, e.message);
    }
}
/**
 * Parse each line in each block, extracting tokens and alignment markers.
 */
function lines_Parse_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.parsedLines = ns['testParsedLines'] ?? [];
        ns.result = ok(ns.data.parsedLines);
        return;
    }
    try {
        const rules = ns.data.languageRules;
        if (!rules) {
            ns_SetError(ns, 'No language rules');
            return;
        }
        ns.data.parsedLines = ns.data.blocks.map(block => block.lines.map(raw => parseLineIgnoringStrings(raw, rules)));
        ns.result = ok(ns.data.parsedLines);
    }
    catch (e) {
        ns_SetError(ns, e.message);
    }
}
/**
 * Apply pairwise sliding-window alignment to every block.
 */
function alignment_Apply_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.alignedLines = ns['testAlignedLines'] ?? [];
        ns.result = ok(ns.data.alignedLines);
        return;
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map(blockLines => alignBlock(blockLines, ns.config.maxSpaces));
        ns.result = ok(ns.data.alignedLines);
    }
    catch (e) {
        ns_SetError(ns, e.message);
    }
}
/**
 * Replace original lines in the editor with the aligned versions.
 */
function text_Replace_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.result = ok('debug-no-replace');
        return;
    }
    try {
        const editor = ns.data.editor;
        if (!editor) {
            ns_SetError(ns, 'No active editor');
            return;
        }
        applyEditorReplacements(editor, ns.data.blocks, ns.data.alignedLines);
        ns.result = ok('replaced');
    }
    catch (e) {
        ns_SetError(ns, e.message);
    }
}
// ── 9. PURE FUNCTIONS ─────────────────────────────────────────
// ── loadConfig ────────────────────────────────────────────────
/** Load and merge VS Code settings with defaults. */
function loadConfig(vsConfig, alignChars, defaults) {
    return {
        defaultAlignChars: alignChars,
        maxBlockSize: vsConfig.get('maxBlockSize', defaults.maxBlockSize),
        preserveComments: vsConfig.get('preserveComments', defaults.preserveComments),
        preserveStrings: vsConfig.get('preserveStrings', defaults.preserveStrings),
        maxSpaces: vsConfig.get('maxSpaces', defaults.maxSpaces),
        greedyMatch: vsConfig.get('greedyMatch', defaults.greedyMatch),
    };
}
// ── detectLanguageRules ───────────────────────────────────────
/** Return language parsing rules for the given VS Code language identifier. */
function detectLanguageRules(langId, defaultAlignChars) {
    const rules = LANGUAGE_RULES[langId];
    if (rules) {
        return { ...rules, alignChars: defaultAlignChars };
    }
    return { ...DEFAULT_LANGUAGE_RULES, alignChars: defaultAlignChars };
}
exports.detectLanguageRules = detectLanguageRules;
// ── extractRawLines ───────────────────────────────────────────
/** Extract raw text lines from a VS Code document between two line indices. */
function extractRawLines(doc, start, end) {
    const out = [];
    for (let i = start; i <= end; i++) {
        out.push(doc.lineAt(i).text);
    }
    return out;
}
// ── findLineBlocks ────────────────────────────────────────────
/**
 * Group consecutive non-empty lines with identical indentation into blocks.
 * Lines that are pure comments are ignored (not added to blocks).
 *
 * FSM states:
 *   idle_Waiting   — looking for the start of a new block
 *   block_Building — accumulating lines into the current block
 */
function findLineBlocks(rawLines, startOffset, rules, maxBlockSize) {
    const blocks = [];
    let state = 'idle_Waiting';
    let curBlock = { startLine: 0, lines: [] };
    let curIndent = '';
    const flush = () => {
        if (curBlock.lines.length > 1) {
            blocks.push(curBlock);
        }
        curBlock = { startLine: 0, lines: [] };
        state = 'idle_Waiting';
    };
    const isBlankOrComment = (raw) => {
        const trimmed = raw.trim();
        if (trimmed === '') {
            return true;
        }
        for (const lc of rules.lineComments) {
            if (trimmed.startsWith(lc)) {
                return true;
            }
        }
        return false;
    };
    const getIndent = (raw) => {
        const m = raw.match(/^(\s*)/);
        return m ? m[1] : '';
    };
    outerLoop: for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        switch (state) {
            case 'idle_Waiting': {
                if (isBlankOrComment(raw)) {
                    continue outerLoop;
                }
                curIndent = getIndent(raw);
                curBlock = { startLine: startOffset + i, lines: [raw] };
                state = 'block_Building';
                break;
            }
            case 'block_Building': {
                if (isBlankOrComment(raw)) {
                    flush();
                    continue outerLoop;
                }
                const indent = getIndent(raw);
                if (indent !== curIndent || curBlock.lines.length >= maxBlockSize) {
                    flush();
                    curIndent = indent;
                    curBlock = { startLine: startOffset + i, lines: [raw] };
                    state = 'block_Building';
                }
                else {
                    curBlock.lines.push(raw);
                }
                break;
            }
        }
    }
    flush();
    return blocks;
}
exports.findLineBlocks = findLineBlocks;
// ── parseLineIgnoringStrings ──────────────────────────────────
/**
 * Tokenise a line and locate alignment markers, skipping string literals,
 * line/block comments                         , and bracket-enclosed regions (parentheses and square
 * brackets).  Markers inside (...) or [...] are suppressed so that function
 * parameter annotations such as `(ns: NS, e: string)` do not produce
 * spurious `:` or `,` markers that would misalign adjacent lines.
 *
 * FSM states                    :
 *   code_Reading      — scanning normal code
 *   string_Double     — inside "..." string
 *   string_Single     — inside '...' string
 *   template_Backtick — inside `...` template literal
 *   lineComment_Done  — line comment found; stop scanning
 *   blockComment_Open — inside block comment
 *
 * Extra state                    : parenDepth tracks nesting of ( and [ so that markers are
 * only recorded when parenDepth               === 0.
 */
function parseLineIgnoringStrings(raw, rules) {
    // Sort align chars longest-first for greedy matching
    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length);
    const tokens = [];
    const markers = [];
    let state = 'code_Reading';
    let i = 0;
    let codeStart = 0;
    let blockCommentEnd = '';
    let parenDepth = 0; // depth of ( and [ nesting; markers suppressed when > 0
    const pushCode = (end) => {
        if (end > codeStart) {
            tokens.push({ kind: 'code', text: raw.slice(codeStart, end) });
        }
    };
    outerLoop: while (i <= raw.length) {
        switch (state) {
            case 'code_Reading': {
                if (i >= raw.length) {
                    pushCode(i);
                    break outerLoop;
                }
                // Check for block comment start
                let foundBlock = false;
                for (const bc of rules.blockComments) {
                    if (raw.startsWith(bc.start, i)) {
                        pushCode(i);
                        codeStart = i;
                        blockCommentEnd = bc.end;
                        state = 'blockComment_Open';
                        i += bc.start.length;
                        foundBlock = true;
                        break;
                    }
                }
                if (foundBlock) {
                    continue outerLoop;
                }
                // Check for line comment start
                let foundLine = false;
                for (const lc of rules.lineComments) {
                    if (raw.startsWith(lc, i)) {
                        pushCode(i);
                        tokens.push({ kind: 'comment', text: raw.slice(i) });
                        state = 'lineComment_Done';
                        foundLine = true;
                        break;
                    }
                }
                if (foundLine) {
                    break outerLoop;
                }
                // Check for string delimiters
                const ch = raw[i];
                if (ch === '"' && rules.stringDelimiters.includes('"')) {
                    pushCode(i);
                    codeStart = i;
                    state = 'string_Double';
                    i++;
                    continue outerLoop;
                }
                if (ch === "'" && rules.stringDelimiters.includes("'")) {
                    pushCode(i);
                    codeStart = i;
                    state = 'string_Single';
                    i++;
                    continue outerLoop;
                }
                if (ch === '`' && rules.stringDelimiters.includes('`')) {
                    pushCode(i);
                    codeStart = i;
                    state = 'template_Backtick';
                    i++;
                    continue outerLoop;
                }
                // Track bracket nesting — markers inside ( ... ) and [ ... ] are suppressed
                if (ch === '(' || ch === '[') {
                    parenDepth++;
                    i++;
                    continue outerLoop;
                }
                if (ch === ')' || ch === ']') {
                    parenDepth = Math.max(0, parenDepth - 1);
                    i++;
                    continue outerLoop;
                }
                // Greedy match alignment chars — only when not inside brackets
                let foundMarker = false;
                if (parenDepth === 0) {
                    for (const ac of alignChars) {
                        if (raw.startsWith(ac, i)) {
                            // Suppress ':' immediately after ')' — it's a return-type
                            // annotation, not a structural separator; aligning it
                            // causes cascading drift across multiple passes.
                            const isReturnTypeColon = ac === ':' && i > 0 && raw[i - 1] === ')';
                            if (!isReturnTypeColon) {
                                markers.push({ symbol: ac, startCol: i });
                            }
                            i += ac.length;
                            foundMarker = true;
                            break;
                        }
                    }
                }
                if (!foundMarker) {
                    i++;
                }
                break;
            }
            case 'string_Double': {
                if (i >= raw.length) {
                    tokens.push({ kind: 'string', text: raw.slice(codeStart) });
                    break outerLoop;
                }
                if (raw[i] === '\\') {
                    i += 2;
                    continue outerLoop;
                }
                if (raw[i] === '"') {
                    i++;
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) });
                    codeStart = i;
                    state = 'code_Reading';
                    continue outerLoop;
                }
                i++;
                break;
            }
            case 'string_Single': {
                if (i >= raw.length) {
                    tokens.push({ kind: 'string', text: raw.slice(codeStart) });
                    break outerLoop;
                }
                if (raw[i] === '\\') {
                    i += 2;
                    continue outerLoop;
                }
                if (raw[i] === "'") {
                    i++;
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) });
                    codeStart = i;
                    state = 'code_Reading';
                    continue outerLoop;
                }
                i++;
                break;
            }
            case 'template_Backtick': {
                if (i >= raw.length) {
                    tokens.push({ kind: 'string', text: raw.slice(codeStart) });
                    break outerLoop;
                }
                if (raw[i] === '\\') {
                    i += 2;
                    continue outerLoop;
                }
                if (raw[i] === '`') {
                    i++;
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) });
                    codeStart = i;
                    state = 'code_Reading';
                    continue outerLoop;
                }
                i++;
                break;
            }
            case 'blockComment_Open': {
                if (i >= raw.length) {
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart) });
                    break outerLoop;
                }
                if (raw.startsWith(blockCommentEnd, i)) {
                    i += blockCommentEnd.length;
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) });
                    codeStart = i;
                    state = 'code_Reading';
                    continue outerLoop;
                }
                i++;
                break;
            }
            case 'lineComment_Done':
                break outerLoop;
        }
    }
    return { raw, tokens, markers };
}
exports.parseLineIgnoringStrings = parseLineIgnoringStrings;
// ── findAlignCharsGreedy ──────────────────────────────────────
/**
 * Find alignment marker positions in a raw code string using greedy left-to-right
 * matching, skipping string literals, comments, and bracket-enclosed regions.
 *
 * (Thin wrapper around parseLineIgnoringStrings for external use / testing.)
 */
function findAlignCharsGreedy(code, alignChars, rules) {
    return parseLineIgnoringStrings(code, { ...rules, alignChars }).markers;
}
exports.findAlignCharsGreedy = findAlignCharsGreedy;
// ── buildPairwisePositionMap ──────────────────────────────────
/**
 * Build a target-column map for all markers in a parsed block.
 *
 * All target columns are expressed in the coordinate space of the ORIGINAL
 * (pre-alignment) line — i.e. they are raw character offsets into pl.raw.
 * applyPositionMap converts them to output positions by accounting for the
 * cumulative shift introduced by earlier insertions on the same line.
 *
 * Phase 1 — pairwise sliding window
 * ──────────────────────────────────
 * Slide a two-line window over the block top-to-bottom.
 * For each adjacent pair (i, i+1):
 *   • Walk both marker sequences in parallel until the symbols diverge.
 *   • Every matched position k gets target             = max(colA, colB),
 *     capped so neither line gains more than maxSpaces of extra padding.
 *   • Stored under keys `${i}:${k}` and `${i+1}:${k}`  ,
 *     taking Math.max with any value already there.
 *
 * Phase 2 — transitive propagation
 * ──────────────────────────────────
 * A single left-to-right pass is not enough when the widest line sits in
 * the middle of the block.  For each marker position k , find every maximal
 * run of consecutive lines sharing the same symbol at k, then lift every
 * posMap entry in that run to the run's maximum.  This makes the result
 * idempotent                    : a second pass produces no further change.
 *
 * Key format                    : `"${lineIndex}:${markerIndex}"` → target column (in raw coords)
 */
function buildPairwisePositionMap(parsedLines, maxSpaces) {
    const posMap = new Map();
    if (parsedLines.length < 2) {
        return posMap;
    }
    const maxMarkers = Math.max(0, ...parsedLines.map(pl => pl.markers.length));
    // Phase 1: Find max column for each marker index across ALL lines
    for (let mk = 0; mk < maxMarkers; mk++) {
        let maxCol = -1;
        for (let i = 0; i < parsedLines.length; i++) {
            const m = parsedLines[i].markers[mk];
            if (m) {
                maxCol = Math.max(maxCol, m.startCol);
            }
        }
        if (maxCol < 0) {
            continue;
        }
        let linesWithMarker = 0;
        for (let i = 0; i < parsedLines.length; i++) {
            if (parsedLines[i].markers[mk]) {
                linesWithMarker++;
            }
        }
        if (linesWithMarker < 2) {
            continue;
        }
        for (let i = 0; i < parsedLines.length; i++) {
            const m = parsedLines[i].markers[mk];
            if (!m) {
                continue;
            }
            const target = m.startCol >= maxCol
                ? m.startCol
                : Math.min(maxCol, m.startCol + maxSpaces);
            const key = `${i}:${mk}`;
            posMap.set(key, Math.max(posMap.get(key) ?? 0, target));
        }
    }
    // Phase 2: transitive propagation for runs
    for (let mk = 0; mk < maxMarkers; mk++) {
        let runStart = 0;
        while (runStart < parsedLines.length) {
            if (parsedLines[runStart].markers[mk] === undefined) {
                runStart++;
                continue;
            }
            const symbol = parsedLines[runStart].markers[mk].symbol;
            let runEnd = runStart;
            while (runEnd + 1 < parsedLines.length &&
                parsedLines[runEnd + 1].markers[mk]?.symbol === symbol) {
                runEnd++;
            }
            let runMax = 0;
            for (let i = runStart; i <= runEnd; i++) {
                runMax = Math.max(runMax, posMap.get(`${i}:${mk}`) ?? 0);
            }
            if (runMax > 0) {
                for (let i = runStart; i <= runEnd; i++) {
                    const key = `${i}:${mk}`;
                    if (posMap.has(key)) {
                        posMap.set(key, runMax);
                    }
                }
            }
            runStart = runEnd + 1;
        }
    }
    return posMap;
}
exports.buildPairwisePositionMap = buildPairwisePositionMap;
// ── applyPositionMap ─────────────────────────────────────────
/**
 * Rewrite each parsed line by inserting spaces before markers so that each
 * marker lands on its target column.
 *
 * KEY INSIGHT — two coordinate spaces
 * ─────────────────────────────────────
 * posMap stores targets in RAW coordinates (offsets into pl.raw, the
 * original unmodified line).  As we write characters into `out` we
 * accumulate a `shift` — the total number of extra spaces inserted so far
 * on this line.  A marker originally at raw column C will appear in the
 * output at column C + shift.  So to reach target (raw) we need the output
 * column to be target + shift               :
 *
 *   pad                     = (target + shift) - out.length   // out.length === C + shift before pad
 *                           = target - C                       // simplifies to raw gap
 *
 * Without this correction the first marker is placed correctly but every
 * subsequent marker on the same line is off by the cumulative shift of all
 * previous insertions — causing the "needs two passes" symptom when a block
 * has markers at both ':' and ','.
 *
 * After this fix the operation is idempotent: on a line that is already
 * aligned                    , shift stays 0 throughout, pad is always 0, output equals input.
 */
function applyPositionMap(parsedLines, posMap) {
    return parsedLines.map((pl, lineIdx) => {
        let out = '';
        let srcPos = 0; // read cursor in pl.raw (raw coordinates)
        let shift = 0; // extra chars inserted so far on this line
        for (let mk = 0; mk < pl.markers.length; mk++) {
            const marker = pl.markers[mk];
            // Copy everything in the original string up to this marker
            out += pl.raw.slice(srcPos, marker.startCol);
            srcPos = marker.startCol;
            // target is in raw coords; translate to output coords via shift
            const key = `${lineIdx}:${mk}`;
            if (posMap.has(key)) {
                const target = posMap.get(key);
                const targetOut = target + shift; // where we want out.length to be
                const pad = targetOut - out.length;
                if (pad > 0) {
                    out += ' '.repeat(pad);
                    shift += pad;
                }
            }
            // Append the marker symbol itself
            out += marker.symbol;
            srcPos = marker.startCol + marker.symbol.length;
        }
        // Append the remainder of the line after the last marker
        out += pl.raw.slice(srcPos);
        return out;
    });
}
exports.applyPositionMap = applyPositionMap;
// ── alignBlock ───────────────────────────────────────────────
/**
 * Align all lines in a block using the pairwise sliding-window strategy
 * with transitive propagation.
 * Blocks with fewer than two lines are returned unchanged.
 */
function alignBlock(parsedLines, maxSpaces) {
    if (parsedLines.length < 2) {
        return parsedLines.map(pl => pl.raw);
    }
    const posMap = buildPairwisePositionMap(parsedLines, maxSpaces);
    if (posMap.size === 0) {
        return parsedLines.map(pl => pl.raw);
    }
    return applyPositionMap(parsedLines, posMap);
}
exports.alignBlock = alignBlock;
// ── applyEditorReplacements ───────────────────────────────────
/** Apply aligned lines back into the VS Code editor document. */
function applyEditorReplacements(editor, blocks, alignedLines) {
    editor.edit(editBuilder => {
        for (let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi];
            const aligned = alignedLines[bi];
            for (let li = 0; li < block.lines.length; li++) {
                const lineIdx = block.startLine + li;
                const range = editor.document.lineAt(lineIdx).range;
                editBuilder.replace(range, aligned[li]);
            }
        }
    });
}
// ── 10. ACTIVATE / DEACTIVATE ─────────────────────────────────
/** Activate the extension and register commands. */
function activate(context) {
    const runAlign = () => {
        const ns = NS_Container(CONFIG);
        a_Chain(ns);
        if (ns.s_Error) {
            vscode.window.showErrorMessage(`Code.Align: ${ns.s_Error}`);
        }
        else {
            vscode.window.showInformationMessage('Code aligned successfully');
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('vscode-better-align-columns.align', runAlign), vscode.commands.registerCommand('CodeAlign.AlignBlock', runAlign), vscode.commands.registerCommand('CodeAlign.Configure', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'codeAlign');
    }));
}
exports.activate = activate;
/** Deactivate the extension. */
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension_618.js.map