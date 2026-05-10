'use strict';
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
exports.alignCallSites = exports.tokenizeLine = exports.ws = exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
// ─── Language config ──────────────────────────────────────────────────────────
const DEFAULT_LANG = {
    bash: { lineComments: ['#'], blockComments: [] },
    c: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    cpp: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    csharp: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    dockerfile: { lineComments: ['#'], blockComments: [] },
    go: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    html: { lineComments: [], blockComments: [{ start: '<!--', end: '-->' }] },
    java: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    javascript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    julia: { lineComments: ['#'], blockComments: [{ start: '#=', end: '=#' }] },
    php: { lineComments: ['//', '#'], blockComments: [{ start: '/*', end: '*/' }] },
    python: { lineComments: ['#'], blockComments: [] },
    ruby: { lineComments: ['#'], blockComments: [] },
    rust: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    shellscript: { lineComments: ['#'], blockComments: [] },
    sql: { lineComments: ['--'], blockComments: [{ start: '/*', end: '*/' }] },
    typescript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    yaml: { lineComments: ['#'], blockComments: [] },
};
const FALLBACK = { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] };
const getLangConfig = (lang, overrides = {}) => overrides[lang] ?? DEFAULT_LANG[lang] ?? FALLBACK;
// ─── Helpers ──────────────────────────────────────────────────────────────────
const ws = (n) => n <= 0 ? '' : ' '.repeat(Math.min(n, 1e6));
exports.ws = ws;
const sortByLenDesc = (arr) => [...arr].sort((a, b) => {
    const len = (x) => typeof x === 'string' ? x.length : x.start.length;
    return len(b) - len(a);
});
const matchPrefix = (text, pos, markers) => {
    for (const m of sortByLenDesc(markers)) {
        if (text.startsWith(m, pos)) {
            return m;
        }
    }
    return null;
};
const findLineComment = (text, pos, cfg) => {
    const m = matchPrefix(text, pos, cfg.lineComments);
    return m === '//' && pos > 0 && text[pos - 1] === ':' ? null : m;
};
const findBlockCommentStart = (text, pos, cfg) => {
    for (const bc of sortByLenDesc(cfg.blockComments)) {
        if (text.startsWith(bc.start, pos)) {
            return bc.end;
        }
    }
    return null;
};
// ─── PHP / generic helpers ────────────────────────────────────────────────────
const isGenericOpen = (text, pos) => pos > 0 && /[\w>\\]/.test(text[pos - 1]);
const consumeGeneric = (text, pos) => {
    let depth = 0, i = pos;
    while (i < text.length) {
        switch (text[i]) {
            case '<':
                depth++;
                i++;
                break;
            case '>':
                depth--;
                i++;
                if (depth === 0) {
                    return i;
                }
                break;
            default: i++;
        }
    }
    return -1;
};
const BRACKET_PAIR = { '{': '}', '[': ']', '(': ')' };
function classifyAtDefault(text, pos, cfg) {
    const ch = text[pos] ?? '';
    const nx = text[pos + 1] ?? '';
    const rd = text[pos + 2] ?? '';
    switch (ch) {
        case ' ':
        case '\t':
        case '\n':
        case '\r':
            return { type: "Whitespace" /* TokenType.Whitespace */, advance: 1 };
        case '"':
        case "'":
        case '`':
            return { type: "String" /* TokenType.String */, advance: 1 };
        case '{': return { type: "OpenBrace" /* TokenType.OpenBrace */, advance: 1 };
        case '(': return { type: "OpenParen" /* TokenType.OpenParen */, advance: 1 };
        case '[': return { type: "Block" /* TokenType.Block */, advance: 1 };
        case '}':
        case ')':
        case ']':
            return { type: "EndOfBlock" /* TokenType.EndOfBlock */, advance: 1 };
        case ';': return { type: "Semicolon" /* TokenType.Semicolon */, advance: 1 };
        case ',': return { type: "Comma" /* TokenType.Comma */, advance: 1 };
        case '<': {
            if (nx === '?') {
                let end = pos + 2;
                while (end < text.length && /[a-zA-Z]/.test(text[end])) {
                    end++;
                }
                return { type: "Word" /* TokenType.Word */, advance: end - pos };
            }
            switch (true) {
                case nx === '=' && rd === '>': return { type: "Spaceship" /* TokenType.Spaceship */, advance: 3 };
                case nx === '=' && rd === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 3 };
                case nx === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 2 };
            }
            if (isGenericOpen(text, pos)) {
                const end = consumeGeneric(text, pos);
                if (end !== -1) {
                    return { type: "Word" /* TokenType.Word */, advance: end - pos };
                }
            }
            return { type: "Comparison" /* TokenType.Comparison */, advance: 1 };
        }
        case '>':
            switch (true) {
                case nx === '=' && rd === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 3 };
                case nx === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 2 };
                default: return { type: "Comparison" /* TokenType.Comparison */, advance: 1 };
            }
        case '!':
            switch (true) {
                case nx === '=' && rd === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 3 };
                case nx === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 2 };
                default: return { type: "Word" /* TokenType.Word */, advance: 1 };
            }
        case '=':
            switch (true) {
                case nx === '>': return { type: "Arrow" /* TokenType.Arrow */, advance: 2 };
                case nx === '=' && rd === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 3 };
                case nx === '=': return { type: "Comparison" /* TokenType.Comparison */, advance: 2 };
                default: return { type: "Assignment" /* TokenType.Assignment */, advance: 1 };
            }
        case '-':
            switch (true) {
                case nx === '>': return { type: "Word" /* TokenType.Word */, advance: 2 };
                case nx === '=': return { type: "Assignment" /* TokenType.Assignment */, advance: 2 };
                default: return { type: "Word" /* TokenType.Word */, advance: 1 };
            }
        case '+':
        case '*':
        case '%':
        case '~':
        case '|':
        case '^':
        case '.':
        case '&':
            return nx === '=' ? { type: "Assignment" /* TokenType.Assignment */, advance: 2 }
                : { type: "Word" /* TokenType.Word */, advance: 1 };
        case '/':
            if (findLineComment(text, pos, cfg)) {
                return { type: "Comment" /* TokenType.Comment */, advance: 1 };
            }
            if (findBlockCommentStart(text, pos, cfg)) {
                return { type: "Comment" /* TokenType.Comment */, advance: 1 };
            }
            if (nx === '=') {
                return { type: "Assignment" /* TokenType.Assignment */, advance: 2 };
            }
            return { type: "Word" /* TokenType.Word */, advance: 1 };
        case ':':
            switch (true) {
                case nx === ':': return { type: "Word" /* TokenType.Word */, advance: 2 };
                case nx === '=': return { type: "Assignment" /* TokenType.Assignment */, advance: 2 };
                default: return { type: "Colon" /* TokenType.Colon */, advance: 1 };
            }
    }
    if (findLineComment(text, pos, cfg)) {
        return { type: "Comment" /* TokenType.Comment */, advance: 1 };
    }
    if (findBlockCommentStart(text, pos, cfg)) {
        return { type: "Comment" /* TokenType.Comment */, advance: 1 };
    }
    return { type: "Word" /* TokenType.Word */, advance: 1 };
}
function nextStateFor(type, text, pos, cfg) {
    switch (type) {
        case "String" /* TokenType.String */:
            return { state: 1 /* State.InString */, quote: text[pos] ?? '', open: '', blockEnd: '' };
        case "Block" /* TokenType.Block */:
            return { state: 2 /* State.InBlock */, quote: '', open: text[pos] ?? '', blockEnd: '' };
        case "OpenBrace" /* TokenType.OpenBrace */:
            return { state: 2 /* State.InBlock */, quote: '', open: '{', blockEnd: '' };
        case "OpenParen" /* TokenType.OpenParen */:
            return { state: 2 /* State.InBlock */, quote: '', open: '(', blockEnd: '' };
        case "Comment" /* TokenType.Comment */: {
            if (findLineComment(text, pos, cfg)) {
                return { state: 3 /* State.InLineComment */, quote: '', open: '', blockEnd: '' };
            }
            const end = findBlockCommentStart(text, pos, cfg);
            if (end) {
                return { state: 4 /* State.InBlockComment */, quote: '', open: '', blockEnd: end };
            }
            return { state: 0 /* State.Default */, quote: '', open: '', blockEnd: '' };
        }
        default:
            return { state: 0 /* State.Default */, quote: '', open: '', blockEnd: '' };
    }
}
function tokenizeLine(ln, cfg, lang) {
    const text = ln.text;
    const tokens = [];
    let state = 0 /* State.Default */;
    let tokenStart = -1;
    let lastType = "Invalid" /* TokenType.Invalid */;
    let quote = '';
    let open = '';
    let blockDepth = 0;
    let blockEnd = '';
    const flush = (upTo, overrideType) => {
        if (tokenStart === -1) {
            return;
        }
        tokens.push({ type: overrideType ?? lastType, text: text.substring(tokenStart, upTo) });
        tokenStart = -1;
    };
    let pos = 0;
    while (pos < text.length) {
        switch (state) {
            case 1 /* State.InString */: {
                if (text[pos] === quote) {
                    let backslashes = 0, k = pos - 1;
                    while (k >= 0 && text[k] === '\\') {
                        backslashes++;
                        k--;
                    }
                    if (backslashes % 2 === 0) {
                        pos++;
                        flush(pos);
                        state = 0 /* State.Default */;
                        break;
                    }
                }
                pos++;
                break;
            }
            case 2 /* State.InBlock */: {
                switch (text[pos]) {
                    case undefined:
                        pos++;
                        break;
                    case (open):
                        blockDepth++;
                        pos++;
                        break;
                    case (BRACKET_PAIR[open]): {
                        pos++;
                        blockDepth--;
                        if (blockDepth === 0) {
                            flush(pos);
                            state = 0 /* State.Default */;
                        }
                        break;
                    }
                    default: pos++;
                }
                break;
            }
            case 3 /* State.InLineComment */: {
                pos = text.length;
                flush(text.length);
                break;
            }
            case 4 /* State.InBlockComment */: {
                if (text.startsWith(blockEnd, pos)) {
                    pos += blockEnd.length;
                    flush(pos);
                    state = 0 /* State.Default */;
                }
                else {
                    pos++;
                }
                break;
            }
            case 0 /* State.Default */: {
                const { type, advance } = classifyAtDefault(text, pos, cfg);
                if (advance > 1 && type === "Word" /* TokenType.Word */) {
                    flush(pos);
                    tokens.push({ type: "Word" /* TokenType.Word */, text: text.substring(pos, pos + advance) });
                    lastType = "Word" /* TokenType.Word */;
                    tokenStart = -1;
                    pos += advance;
                    break;
                }
                if (type !== lastType) {
                    flush(pos);
                    lastType = type;
                    tokenStart = pos;
                    const ns = nextStateFor(type, text, pos, cfg);
                    state = ns.state;
                    quote = ns.quote;
                    open = ns.open;
                    blockEnd = ns.blockEnd;
                    blockDepth = state === 2 /* State.InBlock */ ? 1 : 0;
                }
                else if (tokenStart === -1) {
                    tokenStart = pos;
                    const ns = nextStateFor(type, text, pos, cfg);
                    state = ns.state;
                    quote = ns.quote;
                    open = ns.open;
                    blockEnd = ns.blockEnd;
                    blockDepth = state === 2 /* State.InBlock */ ? 1 : 0;
                }
                pos += advance;
                break;
            }
        }
    }
    if (tokenStart !== -1) {
        const partialType = state === 1 /* State.InString */ ? "PartialString" /* TokenType.PartialString */ :
            state === 2 /* State.InBlock */ ? "PartialBlock" /* TokenType.PartialBlock */ : lastType;
        flush(text.length, partialType);
    }
    // Split {…} and (…) tokens into Open + Block(inner) + EndOfBlock
    const split = [];
    for (const tok of tokens) {
        const ch = tok.text[0];
        if ((tok.type === "Block" /* TokenType.Block */ || tok.type === "OpenBrace" /* TokenType.OpenBrace */ || tok.type === "OpenParen" /* TokenType.OpenParen */) && tok.text.length >= 2 && (ch === '{' || ch === '(')) {
            const opType = ch === '{' ? "OpenBrace" /* TokenType.OpenBrace */ : "OpenParen" /* TokenType.OpenParen */;
            split.push({ type: opType, text: ch });
            split.push({ type: "Block" /* TokenType.Block */, text: tok.text.slice(1, -1) });
            split.push({ type: "EndOfBlock" /* TokenType.EndOfBlock */, text: BRACKET_PAIR[ch] });
        }
        else {
            split.push(tok);
        }
    }
    const finalTokens = split;
    // Refine Comma → CommaAsWord
    for (let i = 0; i < finalTokens.length; i++) {
        if (finalTokens[i].type !== "Comma" /* TokenType.Comma */) {
            continue;
        }
        const nonWsBefore = finalTokens.slice(0, i).some(t => t.type !== "Whitespace" /* TokenType.Whitespace */);
        if (!nonWsBefore) {
            finalTokens[i] = { ...finalTokens[i], type: "CommaAsWord" /* TokenType.CommaAsWord */ };
        }
        break;
    }
    // Refine Word → From (JS-like langs)
    const JS_LIKE = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact']);
    if (JS_LIKE.has(lang)) {
        for (const t of finalTokens) {
            if (t.type === "Word" /* TokenType.Word */ && t.text === 'from') {
                t.type = "From" /* TokenType.From */;
            }
        }
    }
    const SIG = new Set([
        "Assignment" /* TokenType.Assignment */, "Colon" /* TokenType.Colon */, "Arrow" /* TokenType.Arrow */,
        "Comment" /* TokenType.Comment */, "From" /* TokenType.From */, "Comparison" /* TokenType.Comparison */,
        "OpenBrace" /* TokenType.OpenBrace */, "OpenParen" /* TokenType.OpenParen */, "Semicolon" /* TokenType.Semicolon */,
    ]);
    const sgfntTokens = [];
    for (const t of finalTokens) {
        if (SIG.has(t.type) && !sgfntTokens.includes(t.type)) {
            sgfntTokens.push(t.type);
        }
    }
    return { tokens: finalTokens, sgfntTokens };
}
exports.tokenizeLine = tokenizeLine;
function tokenizeFlat(inner, cfg) {
    const result = [];
    let state = 0 /* FlatState.Word */;
    let pos = 0, start = 0, quote = '', depth = 0, bcEnd = '';
    const flushWord = (upTo) => {
        if (start < upTo) {
            result.push({ type: "Word" /* TokenType.Word */, text: inner.substring(start, upTo) });
        }
    };
    while (pos < inner.length) {
        const ch = inner[pos];
        switch (state) {
            case 1 /* FlatState.InString */: {
                if (ch === quote) {
                    let backslashes = 0, k = pos - 1;
                    while (k >= 0 && inner[k] === '\\') {
                        backslashes++;
                        k--;
                    }
                    if (backslashes % 2 === 0) {
                        pos++;
                        result.push({ type: "String" /* TokenType.String */, text: inner.substring(start, pos) });
                        start = pos;
                        state = 0 /* FlatState.Word */;
                    }
                    else {
                        pos++;
                    }
                }
                else {
                    pos++;
                }
                break;
            }
            case 2 /* FlatState.InBracket */: {
                switch (ch) {
                    case '[':
                        depth++;
                        pos++;
                        break;
                    case ']': {
                        depth--;
                        pos++;
                        if (depth === 0) {
                            result.push({ type: "Block" /* TokenType.Block */, text: inner.substring(start, pos) });
                            start = pos;
                            state = 0 /* FlatState.Word */;
                        }
                        break;
                    }
                    default: pos++;
                }
                break;
            }
            case 3 /* FlatState.InLineComment */: {
                pos = inner.length;
                result.push({ type: "Comment" /* TokenType.Comment */, text: inner.substring(start, pos) });
                start = pos;
                break;
            }
            case 4 /* FlatState.InBlockComment */: {
                if (inner.startsWith(bcEnd, pos)) {
                    pos += bcEnd.length;
                    result.push({ type: "Comment" /* TokenType.Comment */, text: inner.substring(start, pos) });
                    start = pos;
                    state = 0 /* FlatState.Word */;
                }
                else {
                    pos++;
                }
                break;
            }
            case 0 /* FlatState.Word */: {
                switch (ch) {
                    case '"':
                    case "'":
                    case '`': {
                        flushWord(pos);
                        start = pos;
                        quote = ch;
                        state = 1 /* FlatState.InString */;
                        pos++;
                        break;
                    }
                    case '[': {
                        flushWord(pos);
                        start = pos;
                        depth = 1;
                        state = 2 /* FlatState.InBracket */;
                        pos++;
                        break;
                    }
                    case '{': {
                        flushWord(pos);
                        result.push({ type: "OpenBrace" /* TokenType.OpenBrace */, text: '{' });
                        pos++;
                        let d = 1, s = pos;
                        while (pos < inner.length && d > 0) {
                            switch (inner[pos]) {
                                case '{':
                                    d++;
                                    pos++;
                                    break;
                                case '}':
                                    d--;
                                    if (d > 0) {
                                        pos++;
                                    }
                                    ;
                                    break;
                                default: pos++;
                            }
                        }
                        result.push(...tokenizeFlat(inner.substring(s, pos), cfg));
                        result.push({ type: "EndOfBlock" /* TokenType.EndOfBlock */, text: '}' });
                        if (pos < inner.length) {
                            pos++;
                        }
                        start = pos;
                        break;
                    }
                    case '(': {
                        flushWord(pos);
                        result.push({ type: "OpenParen" /* TokenType.OpenParen */, text: '(' });
                        pos++;
                        let d = 1, s = pos;
                        while (pos < inner.length && d > 0) {
                            switch (inner[pos]) {
                                case '(':
                                    d++;
                                    pos++;
                                    break;
                                case ')':
                                    d--;
                                    if (d > 0) {
                                        pos++;
                                    }
                                    ;
                                    break;
                                default: pos++;
                            }
                        }
                        result.push(...tokenizeFlat(inner.substring(s, pos), cfg));
                        result.push({ type: "EndOfBlock" /* TokenType.EndOfBlock */, text: ')' });
                        if (pos < inner.length) {
                            pos++;
                        }
                        start = pos;
                        break;
                    }
                    case ';': {
                        flushWord(pos);
                        result.push({ type: "Semicolon" /* TokenType.Semicolon */, text: ';' });
                        pos++;
                        start = pos;
                        break;
                    }
                    case ',': {
                        flushWord(pos);
                        result.push({ type: "Comma" /* TokenType.Comma */, text: ',' });
                        pos++;
                        start = pos;
                        break;
                    }
                    case ':': {
                        const nx = inner[pos + 1];
                        if (nx === ':' || nx === '=') {
                            pos += 2;
                            break;
                        }
                        flushWord(pos);
                        result.push({ type: "Colon" /* TokenType.Colon */, text: ':' });
                        pos++;
                        start = pos;
                        break;
                    }
                    default: {
                        const lc = findLineComment(inner, pos, cfg);
                        if (lc) {
                            flushWord(pos);
                            start = pos;
                            state = 3 /* FlatState.InLineComment */;
                            pos++;
                            break;
                        }
                        const be = findBlockCommentStart(inner, pos, cfg);
                        if (be) {
                            flushWord(pos);
                            start = pos;
                            bcEnd = be;
                            state = 4 /* FlatState.InBlockComment */;
                            pos++;
                            break;
                        }
                        pos++;
                    }
                }
                break;
            }
        }
    }
    switch (state) {
        case 0 /* FlatState.Word */:
            flushWord(inner.length);
            break;
        case 1 /* FlatState.InString */:
            result.push({ type: "String" /* TokenType.String */, text: inner.substring(start) });
            break;
        case 2 /* FlatState.InBracket */:
            result.push({ type: "Block" /* TokenType.Block */, text: inner.substring(start) });
            break;
        case 3 /* FlatState.InLineComment */:
        case 4 /* FlatState.InBlockComment */:
            result.push({ type: "Comment" /* TokenType.Comment */, text: inner.substring(start) });
            break;
    }
    return result.filter(t => t.text.length > 0);
}
// ─── Range collection ─────────────────────────────────────────────────────────
const hasPartial = (info) => info.tokens.some(t => t.type === "PartialBlock" /* TokenType.PartialBlock */ || t.type === "PartialString" /* TokenType.PartialString */);
const sameIndent = (a, b) => {
    const t1 = a.tokens[0], t2 = b.tokens[0];
    return t1?.type === "Whitespace" /* TokenType.Whitespace */ ? t1.text === t2?.text : t2?.type !== "Whitespace" /* TokenType.Whitespace */;
};
const intersect = (a, b) => {
    const set = new Set(a);
    return b.filter(t => set.has(t));
};
const SIG_BLOCK = new Set(["OpenBrace" /* TokenType.OpenBrace */, "OpenParen" /* TokenType.OpenParen */, "Semicolon" /* TokenType.Semicolon */]);
function prefixKey(tokens, type) {
    const parts = [];
    for (const t of tokens) {
        if (t.type === type) {
            break;
        }
        if (t.type === "Whitespace" /* TokenType.Whitespace */) {
            continue;
        }
        switch (t.type) {
            case "Word" /* TokenType.Word */:
            case "String" /* TokenType.String */:
            case "Block" /* TokenType.Block */:
            case "CommaAsWord" /* TokenType.CommaAsWord */:
                parts.push(t.type);
                break;
            default: parts.push(t.text);
        }
    }
    return parts.join('|');
}
function intersectWithStructure(anchor, candidate) {
    const common = intersect(anchor.sgfntTokens, candidate.sgfntTokens);
    const blockTypes = common.filter(t => SIG_BLOCK.has(t));
    const otherTypes = common.filter(t => !SIG_BLOCK.has(t));
    const result = [...otherTypes];
    for (const bt of blockTypes) {
        if (prefixKey(anchor.tokens, bt) === prefixKey(candidate.tokens, bt)) {
            result.push(bt);
        }
    }
    return result;
}
function collectRange(doc, start, end, anchor, lang, overrides, indentImportant) {
    const tokenize = (ln) => {
        const tl = doc.lineAt(ln);
        const { tokens, sgfntTokens } = tokenizeLine(tl, getLangConfig(lang, overrides), lang);
        return { line: tl, sgfntTokenType: "Invalid" /* TokenType.Invalid */, sgfntTokens, tokens };
    };
    const anchorInfo = tokenize(anchor);
    const range = { anchor, infos: [anchorInfo] };
    let types = anchorInfo.sgfntTokens;
    if (!types.length || hasPartial(anchorInfo)) {
        return range;
    }
    for (let i = anchor - 1; i >= start; i--) {
        const info = tokenize(i);
        if (hasPartial(info)) {
            break;
        }
        const tt = intersectWithStructure(anchorInfo, info);
        if (!tt.length) {
            break;
        }
        if (indentImportant && !sameIndent(anchorInfo, info)) {
            break;
        }
        types = tt;
        range.infos.unshift(info);
    }
    for (let i = anchor + 1; i <= end; i++) {
        const info = tokenize(i);
        if (hasPartial(info)) {
            break;
        }
        const tt = intersectWithStructure(anchorInfo, info);
        if (!tt.length) {
            break;
        }
        if (indentImportant && !sameIndent(anchorInfo, info)) {
            break;
        }
        types = tt;
        range.infos.push(info);
    }
    const sgt = types.includes("Assignment" /* TokenType.Assignment */) ? "Assignment" /* TokenType.Assignment */ : types[0];
    for (const info of range.infos) {
        info.sgfntTokenType = sgt;
    }
    return range;
}
// ─── Formatting helpers ───────────────────────────────────────────────────────
const isOnlyComments = (range) => range.infos.every(info => {
    const nonWs = info.tokens.filter(t => t.type !== "Whitespace" /* TokenType.Whitespace */);
    return nonWs.length === 1 && nonWs[0]?.type === "Comment" /* TokenType.Comment */;
});
function extractIndent(infos) {
    let min = Infinity, wsChar = ' ';
    for (const info of infos) {
        const firstNonWs = info.line.text.search(/\S/);
        min = Math.min(min, firstNonWs === -1 ? 0 : firstNonWs);
        if (info.tokens[0]?.type === "Whitespace" /* TokenType.Whitespace */) {
            wsChar = info.tokens[0].text[0] ?? ' ';
            info.tokens.shift();
        }
        if (info.tokens.at(-1)?.type === "Whitespace" /* TokenType.Whitespace */) {
            info.tokens.pop();
        }
    }
    return wsChar.repeat(min === Infinity ? 0 : min);
}
function padFirstWord(infos) {
    const wordsBefore = (info) => {
        let count = 0;
        for (const t of info.tokens) {
            if (t.type === info.sgfntTokenType) {
                return count;
            }
            if (t.type !== "Whitespace" /* TokenType.Whitespace */ && t.type !== "Block" /* TokenType.Block */) {
                count++;
            }
        }
        return count;
    };
    const counts = infos.map(wordsBefore);
    const maxCount = Math.max(...counts);
    if (maxCount <= 1) {
        return;
    }
    for (let i = 0; i < infos.length; i++) {
        const info = infos[i], count = counts[i];
        if (count >= maxCount) {
            continue;
        }
        const firstNonWsIdx = info.tokens.findIndex(t => t.type !== "Whitespace" /* TokenType.Whitespace */);
        if (firstNonWsIdx === -1) {
            continue;
        }
        if (info.tokens[firstNonWsIdx + 1]?.type !== "Whitespace" /* TokenType.Whitespace */) {
            info.tokens.splice(firstNonWsIdx + 1, 0, { type: "Insertion" /* TokenType.Insertion */, text: ' ' });
        }
    }
}
function stripOperatorWhitespace(infos) {
    for (const info of infos) {
        for (let i = 0; i < info.tokens.length; i++) {
            const t = info.tokens[i];
            if (t?.type !== info.sgfntTokenType && t?.type !== "Comma" /* TokenType.Comma */) {
                continue;
            }
            if (t.type === "Comma" /* TokenType.Comma */ && i === 0) {
                continue;
            }
            if (i > 0 && info.tokens[i - 1]?.type === "Whitespace" /* TokenType.Whitespace */) {
                info.tokens.splice(i - 1, 1);
                i--;
            }
            if (info.tokens[i + 1]?.type === "Whitespace" /* TokenType.Whitespace */) {
                info.tokens.splice(i + 1, 1);
            }
        }
        for (let i = 0; i < info.tokens.length - 1; i++) {
            if (info.tokens[i]?.type === "Whitespace" /* TokenType.Whitespace */ && info.tokens[i + 1]?.type === "Whitespace" /* TokenType.Whitespace */) {
                info.tokens[i] = { type: "Whitespace" /* TokenType.Whitespace */, text: info.tokens[i].text + info.tokens[i + 1].text };
                info.tokens.splice(i + 1, 1);
                i--;
            }
        }
    }
}
function stripBracketWhitespace(infos) {
    for (const info of infos) {
        const sgt = info.sgfntTokenType;
        if (sgt !== "OpenBrace" /* TokenType.OpenBrace */ && sgt !== "OpenParen" /* TokenType.OpenParen */) {
            continue;
        }
        for (let i = 0; i < info.tokens.length; i++) {
            if (info.tokens[i]?.type !== sgt) {
                continue;
            }
            if (i > 0 && info.tokens[i - 1]?.type === "Whitespace" /* TokenType.Whitespace */) {
                info.tokens.splice(i - 1, 1);
                i--;
            }
        }
    }
}
// ─── DEFAULT_SURROUND ─────────────────────────────────────────────────────────
const DEFAULT_SURROUND = {
    colon: [1, 1], assignment: [1, 1], comment: [2, 0], arrow: [1, 1],
    from: [1, 1], comparison: [1, 1], openbrace: [1, 0], openparen: [0, 0], semicolon: [0, 1],
};
function normaliseSurround(raw, key) {
    const def = DEFAULT_SURROUND[key] ?? [1, 1];
    if (raw === undefined) {
        return def;
    }
    if (typeof raw === 'number') {
        return [Math.max(0, raw), 0];
    }
    return [Math.max(0, raw[0] ?? def[0]), Math.max(0, raw[1] ?? def[1])];
}
function applyOperator(before, op, pad, bsp, asp) {
    return before + pad + ws(bsp) + op + ws(asp);
}
// ─── buildSemicolonAlignedLines ───────────────────────────────────────────────
function buildSemicolonAlignedLines(infos, indent, cfg) {
    const flatRows = infos.map(info => {
        const expanded = [];
        for (const tok of info.tokens) {
            switch (tok.type) {
                case "OpenBrace" /* TokenType.OpenBrace */:
                case "OpenParen" /* TokenType.OpenParen */:
                case "EndOfBlock" /* TokenType.EndOfBlock */:
                    expanded.push(tok);
                    break;
                case "Block" /* TokenType.Block */:
                    expanded.push(...tokenizeFlat(tok.text, cfg));
                    break;
                default:
                    expanded.push(tok);
            }
        }
        return expanded;
    });
    const splitRows = flatRows.map(toks => {
        const segs = [], seps = [], rendered = [];
        let cur = [];
        for (const t of toks) {
            if (t.type === "Semicolon" /* TokenType.Semicolon */) {
                segs.push(cur);
                rendered.push(false);
                seps.push(t);
                cur = [];
            }
            else {
                cur.push(t);
            }
        }
        segs.push(cur);
        rendered.push(false);
        return { segs, seps, rendered };
    });
    const numSeps = Math.max(...splitRows.map(r => r.seps.length));
    const renderSeg = (seg) => seg.map(t => t.text).join('');
    const results = infos.map(() => indent);
    for (let si = 0; si < numSeps; si++) {
        const prefixLens = splitRows.map((row, li) => {
            if (si >= row.segs.length || row.rendered[si]) {
                return results[li].length;
            }
            return results[li].length + renderSeg(row.segs[si]).trimEnd().length;
        });
        const maxPrefix = Math.max(...prefixLens.filter((_, li) => si < splitRows[li].seps.length && !splitRows[li].rendered[si]));
        for (let li = 0; li < infos.length; li++) {
            const row = splitRows[li];
            if (si >= row.segs.length || row.rendered[si]) {
                continue;
            }
            const segText = renderSeg(row.segs[si]).trimEnd();
            results[li] += segText + ws(maxPrefix - results[li].length - segText.length) + ';';
            row.rendered[si] = true;
        }
        const afterCols = splitRows.map((row, li) => {
            if (si >= row.seps.length) {
                return 0;
            }
            const raw = renderSeg(row.segs[si + 1] ?? []);
            const spaces = raw.length - raw.trimStart().length;
            return results[li].length + Math.max(1, spaces);
        });
        const targetCol = Math.max(...afterCols.filter((_, li) => si < splitRows[li].seps.length));
        for (let li = 0; li < infos.length; li++) {
            const row = splitRows[li];
            if (si >= row.seps.length) {
                continue;
            }
            const nextSeg = row.segs[si + 1] ?? [];
            const trimmed = renderSeg(nextSeg).trimStart();
            results[li] += ws(targetCol - results[li].length);
            row.segs[si + 1] = [{ type: "Word" /* TokenType.Word */, text: trimmed }];
        }
    }
    for (let li = 0; li < infos.length; li++) {
        const row = splitRows[li];
        const lastIdx = row.segs.length - 1;
        if (!row.rendered[lastIdx]) {
            const lastSeg = row.segs[lastIdx] ?? [];
            results[li] += renderSeg(lastSeg);
        }
    }
    return results;
}
// ─── buildColonAlignedLines ───────────────────────────────────────────────────
function buildColonAlignedLines(infos, indent, cfg) {
    const flatRows = infos.map(info => tokenizeFlat(info.tokens.map(t => t.text).join(''), cfg));
    const splitRows = flatRows.map(toks => {
        const segs = [], seps = [], rendered = [];
        let cur = [];
        for (const t of toks) {
            if (t.type === "Colon" /* TokenType.Colon */) {
                segs.push(cur);
                rendered.push(false);
                seps.push(t);
                cur = [];
            }
            else {
                cur.push(t);
            }
        }
        segs.push(cur);
        rendered.push(false);
        return { segs, seps, rendered };
    });
    const numSeps = Math.max(...splitRows.map(r => r.seps.length));
    const renderSeg = (seg) => seg.map(t => t.text).join('');
    const results = infos.map(() => indent);
    for (let si = 0; si < numSeps; si++) {
        const prefixLens = splitRows.map((row, li) => {
            if (si >= row.segs.length || row.rendered[si]) {
                return results[li].length;
            }
            return results[li].length + renderSeg(row.segs[si]).trimEnd().length;
        });
        const maxPrefix = Math.max(...prefixLens.filter((_, li) => si < splitRows[li].seps.length && !splitRows[li].rendered[si]));
        for (let li = 0; li < infos.length; li++) {
            const row = splitRows[li];
            if (si >= row.seps.length || row.rendered[si]) {
                results[li] += renderSeg(row.segs[si] ?? []);
                row.rendered[si] = true;
                continue;
            }
            const segText = renderSeg(row.segs[si]).trimEnd();
            results[li] += segText + ws(maxPrefix - results[li].length - segText.length) + ' :';
            row.rendered[si] = true;
        }
        for (let li = 0; li < infos.length; li++) {
            const row = splitRows[li];
            if (si >= row.seps.length) {
                continue;
            }
            const nextSeg = row.segs[si + 1] ?? [];
            const trimmed = renderSeg(nextSeg).trimStart();
            row.segs[si + 1] = [{ type: "Word" /* TokenType.Word */, text: ' ' + trimmed }];
        }
    }
    for (let li = 0; li < infos.length; li++) {
        const row = splitRows[li];
        const lastIdx = row.segs.length - 1;
        if (!row.rendered[lastIdx]) {
            const lastSeg = row.segs[lastIdx] ?? [];
            results[li] += renderSeg(lastSeg);
        }
    }
    return results;
}
// ─── Call-site alignment — SRP post-processor ────────────────────────────────
//
// Responsibility: given a group of already-formatted lines that share the same
// leading indent, find all positions where `word(` appears at the same nesting
// depth on every line, and pad the word so all `(` land in one column.
//
// This runs AFTER buildLines and never touches the token model.
// It only manipulates plain strings — no vscode API, no LineInfo.
// ── Helpers ──────────────────────────────────────────────────────────────────
/** Find all `word(` positions at depth-0 in a plain string.
 *  Returns array of { wordStart, parenPos } — positions of the `(` character. */
function findCallSiteParens(line) {
    const result = [];
    let state = 0 /* CS.Normal */;
    let depth = 0;
    let quote = '';
    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        const nx = line[i + 1] ?? '';
        switch (state) {
            case 2 /* CS.InLineComment */:
                i = line.length;
                break;
            case 3 /* CS.InBlockComment */:
                line.startsWith('*/', i) ? (state = 0 /* CS.Normal */, i += 2) : i++;
                break;
            case 1 /* CS.InString */:
                ch === '\\' ? i += 2 : ch === quote ? (state = 0 /* CS.Normal */, i++) : i++;
                break;
            case 0 /* CS.Normal */: {
                switch (ch) {
                    case '/':
                        nx === '/' ? (state = 2 /* CS.InLineComment */, i += 2) : nx === '*' ? (state = 3 /* CS.InBlockComment */, i += 2) : i++;
                        break;
                    case '"':
                    case "'":
                    case '`':
                        state = 1 /* CS.InString */;
                        quote = ch;
                        i++;
                        break;
                    case '{':
                    case '[':
                        depth++;
                        i++;
                        break;
                    case '}':
                    case ']':
                        depth--;
                        i++;
                        break;
                    case '(': {
                        if (depth === 0) {
                            // scan back to find the word
                            let w = i - 1;
                            while (w >= 0 && /[\w$]/.test(line[w])) {
                                w--;
                            }
                            const wordStart = w + 1;
                            if (wordStart < i) {
                                result.push({ wordStart, parenPos: i });
                            }
                        }
                        depth++;
                        i++;
                        break;
                    }
                    case ')':
                        depth--;
                        i++;
                        break;
                    default: i++;
                }
                break;
            }
        }
    }
    return result;
}
/** True if every line has at least one call-site paren at depth-0 at position `slot`. */
function allLinesHaveParenAtSlot(lines, slot) {
    return lines.every(line => findCallSiteParens(line).some(p => p.wordStart <= slot && p.parenPos >= slot - 1));
}
/** Pad the `slot`-th call-site paren (0-indexed) across all lines so `(` aligns. */
function alignCallSiteSlot(lines, slot) {
    // Collect wordStart and parenPos for each line at this slot
    const sites = lines.map(line => findCallSiteParens(line)[slot]);
    if (sites.some(s => s === undefined)) {
        return lines;
    }
    const maxParenPos = Math.max(...sites.map(s => s.parenPos));
    return lines.map((line, li) => {
        const { wordStart, parenPos } = sites[li];
        if (parenPos === maxParenPos) {
            return line;
        }
        const pad = maxParenPos - parenPos;
        return line.slice(0, wordStart) + line.slice(wordStart, parenPos) + ws(pad) + line.slice(parenPos);
    });
}
/**
 * Post-processor : align call-site `(` across a group of lines.
 *
 * Rules :
 *  1. All lines must share the same leading whitespace(same indent group).
 *  2. For each slot index(0, 1, 2, …) where every line has a depth-0 `word(`
 *     with mismatched paren positions — pad the shorter words.
 *  3. Stop at the first slot where not all lines have a paren (lines differ
 *     structurally — don't force alignment).
 */
function alignCallSites(lines) {
    if (lines.length < 2) {
        return lines;
    }
    // All lines must share the same indent
    const indentOf = (l) => l.match(/^(\s*)/)?.[1] ?? '';
    const indent = indentOf(lines[0]);
    if (lines.some(l => indentOf(l) !== indent)) {
        return lines;
    }
    let result = [...lines];
    for (let slot = 0;; slot++) {
        // Collect sites for this slot on the current (possibly already padded) result
        const sites = result.map(line => findCallSiteParens(line)[slot]);
        if (sites.some(s => s === undefined)) {
            break;
        } // not all lines have this slot → stop
        const parenPositions = sites.map(s => s.parenPos);
        const allSame = parenPositions.every(p => p === parenPositions[0]);
        if (!allSame) {
            result = alignCallSiteSlot(result, slot);
        }
    }
    return result;
}
exports.alignCallSites = alignCallSites;
// ─── buildLines ───────────────────────────────────────────────────────────────
function buildLines(range, indent, cfg) {
    if (isOnlyComments(range)) {
        return range.infos.map(i => i.line.text);
    }
    const sgt = range.infos[0]?.sgfntTokenType;
    const langId = range.infos[0]?.line?.languageId ?? 'typescript';
    const langCfg = getLangConfig(langId);
    switch (sgt) {
        case "Semicolon" /* TokenType.Semicolon */: return buildSemicolonAlignedLines(range.infos, indent, langCfg);
        case "Colon" /* TokenType.Colon */: return buildColonAlignedLines(range.infos, indent, langCfg);
        case "OpenBrace" /* TokenType.OpenBrace */:
        case "OpenParen" /* TokenType.OpenParen */:
            stripBracketWhitespace(range.infos);
            break;
    }
    padFirstWord(range.infos);
    stripOperatorWhitespace(range.infos);
    const sttKey = String(range.infos[0].sgfntTokenType).toLowerCase();
    const surrounds = cfg('surroundSpace', {});
    const rawSurround = surrounds[sttKey] ?? DEFAULT_SURROUND[sttKey];
    const [before_sp, after_sp] = normaliseSurround(rawSurround, sttKey);
    const rawCommentGap = surrounds['comment'] ?? DEFAULT_SURROUND['comment'];
    const commentGap = typeof rawCommentGap === 'number' ? Math.max(0, rawCommentGap) : Math.max(0, rawCommentGap[0] ?? 2);
    const opAlign = cfg('operatorPadding', 'right');
    const infos = range.infos, size = infos.length;
    const col = new Array(size).fill(0);
    const result = new Array(size).fill(indent);
    let done = 0;
    while (done < size) {
        let maxOpLen = 0, maxCol = 0;
        for (let l = 0; l < size; l++) {
            if (col[l] === -1) {
                continue;
            }
            const info = infos[l], toks = info.tokens;
            const end = toks.length > 1 && toks.at(-1)?.type === "Comment" /* TokenType.Comment */
                ? (toks.at(-2)?.type === "Whitespace" /* TokenType.Whitespace */ ? toks.length - 2 : toks.length - 1)
                : toks.length;
            let cur = result[l], j = col[l];
            for (; j < end; j++) {
                const t = toks[j];
                if (t.type === info.sgfntTokenType || (t.type === "Comma" /* TokenType.Comma */ && j !== 0)) {
                    maxOpLen = Math.max(maxOpLen, t.text.length);
                    maxCol = Math.max(maxCol, cur.length);
                    break;
                }
                cur += t.text;
            }
            result[l] = cur;
            if (j === end) {
                done++;
                col[l] = -1;
                toks.splice(0, end);
            }
            else {
                col[l] = j;
            }
        }
        for (let l = 0; l < size; l++) {
            const j = col[l];
            if (j === -1) {
                continue;
            }
            const info = infos[l], toks = info.tokens, cur = result[l];
            const pad = ws(maxCol - cur.length);
            let opText = toks[j].text;
            if (opText.length < maxOpLen) {
                opText = opAlign === 'right' ? ws(maxOpLen - opText.length) + opText : opText + ws(maxOpLen - opText.length);
            }
            switch (toks[j].type) {
                case "Comma" /* TokenType.Comma */:
                    result[l] = cur + pad + opText + (j < toks.length - 1 ? ' ' : '');
                    break;
                default:
                    if (toks.length === 1 && toks[0].type === "Comment" /* TokenType.Comment */) {
                        done++;
                    }
                    else {
                        result[l] = applyOperator(cur, opText, pad, before_sp, after_sp);
                    }
            }
            let next = j + 1;
            if (toks[next]?.type === "Whitespace" /* TokenType.Whitespace */) {
                next++;
            }
            col[l] = next;
        }
    }
    const maxLen = result.reduce((m, r) => Math.max(m, r.length), 0);
    for (let l = 0; l < size; l++) {
        const remaining = infos[l].tokens;
        if (remaining.length === 0) {
            continue;
        }
        const trailing = remaining[remaining.length - 1];
        if (trailing?.type === "Comment" /* TokenType.Comment */) {
            for (let k = 0; k < remaining.length - 1; k++) {
                result[l] += remaining[k].text;
            }
            result[l] += ws(maxLen - result[l].length + commentGap) + trailing.text;
        }
        else {
            for (const t of remaining) {
                result[l] += t.text;
            }
        }
    }
    // ── Post-process: align call-site `(` within this group ──────────────────
    return alignCallSites(result);
}
function makeConfig(doc) {
    const base = vscode.workspace.getConfiguration('betterAlignColumns');
    let lang = null;
    try {
        lang = vscode.workspace.getConfiguration().get(`[${doc.languageId}]`) ?? null;
    }
    catch { }
    return (key, def) => lang?.[`betterAlignColumns.${key}`] ?? base.get(key, def);
}
// ─── Main ─────────────────────────────────────────────────────────────────────
function process(editor) {
    const doc = editor.document;
    const cfg = makeConfig(doc);
    const overrides = cfg('languageConfigs', {});
    const ranges = [];
    for (const sel of editor.selections) {
        const indentImportant = cfg('indentBase', 'firstline') === 'dontchange';
        if (sel.isSingleLine) {
            ranges.push(collectRange(doc, 0, doc.lineCount - 1, sel.active.line, doc.languageId, overrides, indentImportant));
            continue;
        }
        let start = sel.start.line, end = sel.end.line;
        while (start <= end) {
            const r = collectRange(doc, start, end, start, doc.languageId, overrides, indentImportant);
            const last = r.infos.at(-1);
            if (last.line.lineNumber > end) {
                break;
            }
            if (r.infos[0]?.sgfntTokenType !== "Invalid" /* TokenType.Invalid */) {
                ranges.push(r);
            }
            if (last.line.lineNumber === end) {
                break;
            }
            start = last.line.lineNumber + 1;
        }
    }
    const outputs = ranges.map(r => {
        const indent = isOnlyComments(r) ? '' : extractIndent(r.infos);
        return buildLines(r, indent, cfg);
    });
    editor.edit(b => {
        const eol = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';
        for (let i = 0; i < ranges.length; i++) {
            const infos = ranges[i].infos, last = infos.at(-1).line;
            const loc = new vscode.Range(infos[0].line.lineNumber, 0, last.lineNumber, last.text.length);
            const text = outputs[i].join(eol);
            if (doc.getText(loc) !== text) {
                b.replace(loc, text);
            }
        }
    });
}
// ─── Extension lifecycle ──────────────────────────────────────────────────────
function activate(ctx) {
    let alignOnEnter = vscode.workspace.getConfiguration('betterAlignColumns').get('alignAfterTypeEnter');
    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('vscode-better-align-columns.align', process), vscode.workspace.onDidChangeTextDocument(e => {
        if (alignOnEnter && e.contentChanges.some(c => c.text.includes('\n'))) {
            vscode.commands.executeCommand('vscode-better-align-columns.align');
        }
    }), vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('betterAlignColumns')) {
            alignOnEnter = vscode.workspace.getConfiguration('betterAlignColumns').get('alignAfterTypeEnter');
        }
    }));
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension_207.js.map