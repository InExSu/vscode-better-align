'use strict'
import * as vscode from 'vscode'

// ─── Types ────────────────────────────────────────────────────────────────────

const enum TokenType {
    Invalid = 'Invalid', Word = 'Word', Assignment = 'Assignment',
    Arrow = 'Arrow', Block = 'Block', PartialBlock = 'PartialBlock',
    EndOfBlock = 'EndOfBlock', String = 'String', PartialString = 'PartialString',
    Comment = 'Comment', Whitespace = 'Whitespace', Colon = 'Colon',
    Comma = 'Comma', CommaAsWord = 'CommaAsWord', Insertion = 'Insertion',
    Spaceship = 'Spaceship', PHPShortEcho = 'PHPShortEcho', From = 'From',
}

interface Token { type: TokenType; text: string }
interface BlockComment { start: string; end: string }
interface LanguageSyntaxConfig { lineComments: string[]; blockComments: BlockComment[] }
interface TextLine { text: string; lineNumber: number }
interface LineInfo { line: TextLine; sgfntTokenType: TokenType; sgfntTokens: TokenType[]; tokens: Token[] }
interface LineRange { anchor: number; infos: LineInfo[] }

// ─── Language config ──────────────────────────────────────────────────────────

const DEFAULT_LANG: Record<string, LanguageSyntaxConfig> = {
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
}
const FALLBACK: LanguageSyntaxConfig = { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }

const getLangConfig = (lang: string, overrides: Record<string, LanguageSyntaxConfig> = {}) =>
    overrides[lang] ?? DEFAULT_LANG[lang] ?? FALLBACK

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ws = (n: number) => n <= 0 ? '' : ' '.repeat(Math.min(n, 1e6))

const REG_WS = /\s/

const sortByLenDesc = <T extends string | { start: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => {
        const len = (x: T) => typeof x === 'string' ? x.length : (x as BlockComment).start.length
        return len(b) - len(a)
    })

const matchPrefix = (text: string, pos: number, markers: string[]): string | null => {
    for(const m of sortByLenDesc(markers)) {
        if(text.startsWith(m, pos)) { return m }
    }
    return null
}

const findLineComment = (text: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    const m = matchPrefix(text, pos, cfg.lineComments)
    // Don't treat '//' inside '://' as a comment (e.g. https://)
    return m === '//' && pos > 0 && text[pos - 1] === ':' ? null : m
}

const findBlockCommentEnd = (text: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    for(const bc of sortByLenDesc(cfg.blockComments)) {
        if(text.startsWith(bc.start, pos)) { return bc.end }
    }
    return null
}

// ─── Tokeniser state machine ───────────────────────────────────────────────────
//
//  States:
//    Default      — scanning character by character, classifying tokens
//    InString     — consuming until matching unescaped closing quote
//    InBlock      — consuming until matching closing bracket (depth-tracked)
//    InLineComment  — consuming rest of line (emits one Comment token)
//    InBlockComment — consuming until closing sequence (may span lines in theory)
//
//  Transitions:
//    Default → InString       on " ' `
//    Default → InBlock        on { ( [
//    Default → InLineComment  on line comment marker
//    Default → InBlockComment on block comment start
//    InString → Default       on matching unescaped close quote
//    InBlock  → Default       on matching close bracket (depth = 0)
//    InBlock  → InBlock       on nested open bracket (depth++)
//    InLineComment  → Default (never; line ends, loop exits)
//    InBlockComment → Default on block comment end sequence
//
//  Each state handles its own advance; Default is the only state that
//  emits completed tokens (via flush) and classifies the *next* state.

const enum State { Default, InString, InBlock, InLineComment, InBlockComment }

const BRACKET_PAIR: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

// Raw character classification — only called from Default state.
// Returns the token type the character *starts*, and how many chars to advance.
// CommaAsWord detection is finalised after flush (see tokenizeLine).
function classifyAtDefault(
    text: string, pos: number, cfg: LanguageSyntaxConfig
): { type: TokenType; advance: number } {
    const ch = text[pos] ?? '', nx = text[pos + 1] ?? '', rd = text[pos + 2] ?? ''

    if(REG_WS.test(ch)) { return { type: TokenType.Whitespace, advance: 1 } }
    if('"\'`'.includes(ch)) { return { type: TokenType.String, advance: 1 } }
    if(ch === '{' || ch === '(' || ch === '[') { return { type: TokenType.Block, advance: 1 } }
    if(ch === '}' || ch === ')' || ch === ']') { return { type: TokenType.EndOfBlock, advance: 1 } }
    if(findLineComment(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
    if(findBlockCommentEnd(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
    if(ch === ',') { return { type: TokenType.Comma, advance: 1 } }  // refined later
    if(ch === '<' && nx === '=' && rd === '>') { return { type: TokenType.Spaceship, advance: 3 } }
    if(ch === '<' && nx === '?' && rd === '=') { return { type: TokenType.PHPShortEcho, advance: 3 } }
    if(ch === '=' && nx === '>') { return { type: TokenType.Arrow, advance: 2 } }
    if(ch === '>' && nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
    if(ch === '<' && nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
    if(ch === '!' && nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
    if(ch === '<' && nx !== '=' && nx !== '?') { return { type: TokenType.Assignment, advance: 1 } }
    if(ch === '>' && nx !== '=') { return { type: TokenType.Assignment, advance: 1 } }
    if(ch === '!' && nx !== '=') { return { type: TokenType.Assignment, advance: 1 } }

    const ASSIGN_OPS = new Set(['+', '-', '*', '/', '%', '~', '|', '^', '.', '!', '&', '=', ':'])
    if(ASSIGN_OPS.has(ch) && nx === '=') { return { type: TokenType.Assignment, advance: rd === '=' ? 3 : 2 } }
    if(ch === '=' && nx !== '=') { return { type: TokenType.Assignment, advance: 1 } }
    if(ch === ':' && nx === ':') { return { type: TokenType.Word, advance: 2 } }
    if(ch === ':' && nx !== ':') { return { type: TokenType.Colon, advance: 1 } }

    return { type: TokenType.Word, advance: 1 }
}

// Enter the sub-state that corresponds to the token type just classified.
function nextStateFor(type: TokenType, text: string, pos: number, cfg: LanguageSyntaxConfig): {
    state: State; quote: string; open: string; blockEnd: string
} {
    if(type === TokenType.String) { return { state: State.InString, quote: text[pos], open: '', blockEnd: '' } }
    if(type === TokenType.Block) { return { state: State.InBlock, quote: '', open: text[pos], blockEnd: '' } }
    if(type === TokenType.Comment) {
        if(findLineComment(text, pos, cfg)) { return { state: State.InLineComment, quote: '', open: '', blockEnd: '' } }
        const end = findBlockCommentEnd(text, pos, cfg)
        if(end) { return { state: State.InBlockComment, quote: '', open: '', blockEnd: end } }
    }
    return { state: State.Default, quote: '', open: '', blockEnd: '' }
}

function tokenizeLine(ln: { text: string }, cfg: LanguageSyntaxConfig, lang: string): {
    tokens: Token[]; sgfntTokens: TokenType[]
} {
    const text = ln.text
    const tokens: Token[] = []

    // Mutable scan head — all fields are plain values, no closures, no classes.
    let state = State.Default
    let tokenStart = -1                 // index where current token began (-1 = none open)
    let lastType = TokenType.Invalid
    let quote = ''                 // InString: which quote char started this string
    let open = ''                 // InBlock:  which bracket opened this block
    let blockDepth = 0                  // InBlock:  nesting depth
    let blockEnd = ''                 // InBlockComment: closing sequence

    // Flush the token that has been accumulating since tokenStart.
    const flush = (upTo: number, overrideType?: TokenType) => {
        if(tokenStart === -1) { return }
        tokens.push({ type: overrideType ?? lastType, text: text.substring(tokenStart, upTo) })
        tokenStart = -1
    }

    let pos = 0
    while(pos < text.length) {

        switch(state) {

            case State.InString: {
                if(text[pos] === quote && text[pos - 1] !== '\\') {
                    pos++
                    flush(pos)
                    state = State.Default
                } else {
                    pos++
                }
                break
            }

            case State.InBlock: {
                if(text[pos] === open) {
                    blockDepth++
                    pos++
                } else if(text[pos] === BRACKET_PAIR[open] && text[pos - 1] !== '\\') {
                    pos++
                    if(--blockDepth === 0) {
                        flush(pos)
                        state = State.Default
                    }
                } else {
                    pos++
                }
                break
            }

            case State.InLineComment: {
                flush(text.length)
                pos = text.length  // consume rest of line
                break
            }

            case State.InBlockComment: {
                if(text.startsWith(blockEnd, pos)) {
                    pos += blockEnd.length
                    flush(pos)
                    state = State.Default
                } else {
                    pos++
                }
                break
            }

            case State.Default: {
                const { type, advance } = classifyAtDefault(text, pos, cfg)

                if(type !== lastType) {
                    // Type changed → flush previous token, open new one.
                    flush(pos)
                    lastType = type
                    tokenStart = pos
                    const ns = nextStateFor(type, text, pos, cfg)
                    state = ns.state
                    quote = ns.quote
                    open = ns.open
                    blockEnd = ns.blockEnd
                    blockDepth = state === State.InBlock ? 1 : 0
                } else if(tokenStart === -1) {
                    // Very first character.
                    tokenStart = pos
                    const ns = nextStateFor(type, text, pos, cfg)
                    state = ns.state
                    quote = ns.quote
                    open = ns.open
                    blockEnd = ns.blockEnd
                    blockDepth = state === State.InBlock ? 1 : 0
                }
                // else: same type, same state — just accumulate.

                pos += advance
                break
            }

        }  // switch
    }

    // Flush whatever remains; mark partial tokens.
    if(tokenStart !== -1) {
        const partialType =
            state === State.InString ? TokenType.PartialString :
                state === State.InBlock ? TokenType.PartialBlock :
            /* InBlockComment / rest */     lastType
        flush(text.length, partialType)
    }

    // Refine Comma → CommaAsWord: a comma is "word-like" when it is the very
    // first non-whitespace token on the line (comma-first style).
    for(let i = 0; i < tokens.length; i++) {
        if(tokens[i].type !== TokenType.Comma) { continue }
        const nonWsBefore = tokens.slice(0, i).some(t => t.type !== TokenType.Whitespace)
        if(!nonWsBefore) { tokens[i] = { ...tokens[i], type: TokenType.CommaAsWord } }
        break  // only the first comma can be CommaAsWord
    }

    // Refine Word → From for JS/TS import statements.
    const JS_LIKE = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact'])
    if(JS_LIKE.has(lang)) {
        for(const t of tokens) {
            if(t.type === TokenType.Word && t.text === 'from') { t.type = TokenType.From }
        }
    }

    // Collect significant token types (used by range-builder).
    const SIG = new Set([TokenType.Assignment, TokenType.Colon, TokenType.Arrow, TokenType.Comment, TokenType.From])
    const sgfntTokens: TokenType[] = []
    for(const t of tokens) {
        if(SIG.has(t.type) && !sgfntTokens.includes(t.type)) { sgfntTokens.push(t.type) }
    }

    return { tokens, sgfntTokens }
}

// ─── Range collection ─────────────────────────────────────────────────────────

const hasPartial = (info: LineInfo) =>
    info.tokens.some(t => t.type === TokenType.PartialBlock || t.type === TokenType.PartialString)

const sameIndent = (a: LineInfo, b: LineInfo) => {
    const t1 = a.tokens[0], t2 = b.tokens[0]
    return t1?.type === TokenType.Whitespace ? t1.text === t2?.text : t2?.type !== TokenType.Whitespace
}

const intersect = (a: TokenType[], b: TokenType[]) => {
    const set = new Set(a)
    return b.filter(t => set.has(t))
}

function collectRange(
    doc: vscode.TextDocument, start: number, end: number, anchor: number,
    lang: string, overrides: Record<string, LanguageSyntaxConfig>, indentImportant: boolean
): LineRange {
    const tokenize = (ln: number): LineInfo => {
        const tl = doc.lineAt(ln)
        const { tokens, sgfntTokens } = tokenizeLine(tl, getLangConfig(lang, overrides), lang)
        return { line: tl, sgfntTokenType: TokenType.Invalid, sgfntTokens, tokens }
    }

    const anchorInfo = tokenize(anchor)
    const range: LineRange = { anchor, infos: [anchorInfo] }
    let types = anchorInfo.sgfntTokens

    if(!types.length || hasPartial(anchorInfo)) { return range }

    for(let i = anchor - 1; i >= start; i--) {
        const info = tokenize(i)
        if(hasPartial(info)) { break }
        const tt = intersect(types, info.sgfntTokens)
        if(!tt.length) { break }
        if(indentImportant && !sameIndent(anchorInfo, info)) { break }
        types = tt
        range.infos.unshift(info)
    }

    for(let i = anchor + 1; i <= end; i++) {
        const info = tokenize(i)
        const tt = intersect(types, info.sgfntTokens)
        if(!tt.length) { break }
        if(indentImportant && !sameIndent(anchorInfo, info)) { break }
        types = tt
        range.infos.push(info)
        if(hasPartial(info)) { break }
    }

    const sgt = types.includes(TokenType.Assignment) ? TokenType.Assignment : types[0]!
    for(const info of range.infos) { info.sgfntTokenType = sgt }
    return range
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const isOnlyComments = (range: LineRange) =>
    range.infos.every(info => {
        const nonWs = info.tokens.filter(t => t.type !== TokenType.Whitespace)
        return nonWs.length === 1 && nonWs[0]?.type === TokenType.Comment
    })

// Strip leading/trailing whitespace tokens; return the common indentation string.
function extractIndent(infos: LineInfo[]): string {
    let min = Infinity, wsChar = ' '
    for(const info of infos) {
        min = Math.min(min, info.line.text.search(/\S/))
        if(info.tokens[0]?.type === TokenType.Whitespace) {
            wsChar = info.tokens[0].text[0] ?? ' '
            info.tokens.shift()
        }
        if(info.tokens.at(-1)?.type === TokenType.Whitespace) { info.tokens.pop() }
    }
    return wsChar.repeat(min === Infinity ? 0 : min)
}

// If lines have the pattern  WORD WORD OP  (two words before operator),
// pad the first word so all operators line up after a consistent prefix.
function padFirstWord(infos: LineInfo[]): void {
    // Count words before the significant operator.
    const wordsBefore = (info: LineInfo): number => {
        let count = 0
        for(const t of info.tokens) {
            if(t.type === info.sgfntTokenType) { return -count }  // negative = "had operator"
            if(t.type !== TokenType.Whitespace && t.type !== TokenType.Block) { count++ }
        }
        return count  // positive = "no operator found"
    }

    const maxFirstLen = infos.reduce((max, info) => {
        const wb = wordsBefore(info)
        return wb < -1 ? Math.max(max, info.tokens[0]?.text.length ?? 0) : max
    }, 0)

    if(!maxFirstLen) { return }

    const spacer = { type: TokenType.Insertion, text: ws(maxFirstLen + 1) }
    const singleSp = { type: TokenType.Insertion, text: ' ' }

    for(const info of infos) {
        const wb = wordsBefore(info)
        if(wb === -(-1)) {  // exactly one word before op — prepend full spacer
            info.tokens.unshift(spacer)
        } else if(wb < -1) {  // two+ words — pad first word to maxFirstLen
            const firstLen = info.tokens[0]?.text.length ?? 0
            const isCommaFirst = info.tokens[0]?.type === TokenType.CommaAsWord

            // Normalise the whitespace after the first word.
            if(info.tokens[1]?.type === TokenType.Whitespace) {
                info.tokens[1] = singleSp
            } else {
                info.tokens.splice(1, 0, singleSp)
            }

            // Insert padding if the first word is shorter than the longest.
            if(firstLen < maxFirstLen) {
                const pad = { type: TokenType.Insertion, text: ws(maxFirstLen - firstLen) }
                info.tokens.splice(isCommaFirst ? 0 : 1, 0, pad)
            }
        }
    }
}

// Remove any whitespace immediately before or after the significant operator.
function stripOperatorWhitespace(infos: LineInfo[]): void {
    for(const info of infos) {
        for(let i = 1; i < info.tokens.length; i++) {
            const t = info.tokens[i]
            if(t?.type !== info.sgfntTokenType && t?.type !== TokenType.Comma) { continue }
            if(info.tokens[i - 1]?.type === TokenType.Whitespace) { info.tokens.splice(i - 1, 1); i-- }
            if(info.tokens[i + 1]?.type === TokenType.Whitespace) { info.tokens.splice(i + 1, 1) }
        }
    }
}

const DEFAULT_SURROUND: Record<string, number | number[]> = {
    colon: [0, 1], assignment: [1, 1], comment: 2, arrow: [1, 1], from: [1, 1],
}

// Build the final string for one operator cell given padding config.
function applyOperator(before: string, op: string, pad: string, stt: number[]): string {
    if(stt[0]! < 0) {
        // Operator sticks to the word on its left.
        if(stt[1]! < 0) {
            // Sibling token sticks to operator on the right too.
            let z = before.length - 1
            while(z >= 0 && !REG_WS.test(before[z] ?? '')) { z-- }
            return before.slice(0, z + 1) + pad + before.slice(z + 1) + op
        }
        return before + op + pad
    }
    let result = before + pad + ws(stt[0]!) + op
    if(stt[1]! > 0) { result += ws(stt[1]!) }
    return result
}

function buildLines(range: LineRange, indent: string, cfg: ReturnType<typeof makeConfig>): string[] {
    if(isOnlyComments(range)) { return range.infos.map(i => i.line.text) }

    padFirstWord(range.infos)
    stripOperatorWhitespace(range.infos)

    const sttKey = String(range.infos[0]!.sgfntTokenType).toLowerCase()
    const surrounds = cfg('surroundSpace', {}) as Record<string, number | number[]>
    const stt = (surrounds[sttKey] ?? DEFAULT_SURROUND[sttKey]) as number[]
    const commentGap = (surrounds['comment'] ?? DEFAULT_SURROUND['comment']) as number
    const opAlign = cfg('operatorPadding', 'right') as string

    const infos = range.infos
    const size = infos.length

    // Per-line write cursors into infos[l].tokens; -1 means this line is done.
    const col: number[] = new Array(size).fill(0)
    const result: string[] = new Array(size).fill(indent)

    let done = 0
    while(done < size) {
        // ── Pass 1: advance each line to its next operator, measure the column. ──
        let maxOpLen = 0, maxCol = 0
        for(let l = 0; l < size; l++) {
            if(col[l] === -1) { continue }
            const info = infos[l]!
            const toks = info.tokens
            // Exclude trailing comment from this pass.
            const end = toks.length > 1 && toks.at(-1)?.type === TokenType.Comment
                ? (toks.at(-2)?.type === TokenType.Whitespace ? toks.length - 2 : toks.length - 1)
                : toks.length

            let cur = result[l]!
            let j = col[l]!
            for(; j < end; j++) {
                const t = toks[j]!
                if(t.type === info.sgfntTokenType || (t.type === TokenType.Comma && j !== 0)) {
                    maxOpLen = Math.max(maxOpLen, t.text.length)
                    maxCol = Math.max(maxCol, cur.length)
                    break
                }
                cur += t.text
            }
            result[l] = cur
            if(j === end) { done++; col[l] = -1; toks.splice(0, end) }
            else { col[l] = j }
        }

        // ── Pass 2: write operator + padding for each line. ──
        for(let l = 0; l < size; l++) {
            const j = col[l]!
            if(j === -1) { continue }

            const info = infos[l]!
            const toks = info.tokens
            const cur = result[l]!
            const pad = ws(maxCol - cur.length)

            let opText = toks[j]!.text
            if(opText.length < maxOpLen) {
                opText = opAlign === 'right'
                    ? ws(maxOpLen - opText.length) + opText
                    : opText + ws(maxOpLen - opText.length)
            }

            if(toks[j]!.type === TokenType.Comma) {
                result[l] = cur + opText + (j < toks.length - 1 ? ' ' : '')
            } else if(toks.length === 1 && toks[0]!.type === TokenType.Comment) {
                done++  // lone comment line — nothing more to align
            } else {
                result[l] = applyOperator(cur, opText, pad, stt)
            }

            col[l] = j + 1
        }
    }

    // ── Trailing comment alignment. ──
    if(commentGap < 0) {
        // No alignment — just append whatever remains.
        for(let l = 0; l < size; l++) {
            for(const t of infos[l]!.tokens) { result[l] += t.text }
        }
    } else {
        const maxLen = result.reduce((m, r) => Math.max(m, r.length), 0)
        for(let l = 0; l < size; l++) {
            const trailing = infos[l]!.tokens.pop()
            if(trailing) { result[l] += ws(maxLen - result[l]!.length + commentGap) + trailing.text }
        }
    }

    return result
}

// ─── Config helpers ───────────────────────────────────────────────────────────

type ConfigFn = (key: string, defaultValue?: unknown) => unknown

function makeConfig(doc: vscode.TextDocument): ConfigFn {
    const base = vscode.workspace.getConfiguration('betterAlign')
    let lang: Record<string, unknown> | null = null
    try { lang = vscode.workspace.getConfiguration().get<Record<string, unknown>>(`[${doc.languageId}]`) ?? null } catch { }
    return (key, def) => lang?.[`betterAlign.${key}`] ?? base.get(key, def)
}

// ─── Main entry point ─────────────────────────────────────────────────────────

function process(editor: vscode.TextEditor): void {
    const doc = editor.document
    const cfg = makeConfig(doc)
    const overrides = cfg('languageConfigs', {}) as Record<string, LanguageSyntaxConfig>
    const ranges: LineRange[] = []

    for(const sel of editor.selections) {
        const indentImportant = cfg('indentBase', 'firstline') === 'dontchange'

        if(sel.isSingleLine) {
            ranges.push(collectRange(doc, 0, doc.lineCount - 1, sel.active.line, doc.languageId, overrides, indentImportant))
            continue
        }

        let start = sel.start.line
        const end = sel.end.line
        while(start <= end) {
            const r = collectRange(doc, start, end, start, doc.languageId, overrides, indentImportant)
            const last = r.infos.at(-1)!
            if(last.line.lineNumber > end) { break }
            if(r.infos[0]?.sgfntTokenType !== TokenType.Invalid) { ranges.push(r) }
            if(last.line.lineNumber === end) { break }
            start = last.line.lineNumber + 1
        }
    }

    const outputs = ranges.map(r => {
        const indent = isOnlyComments(r) ? '' : extractIndent(r.infos)
        return buildLines(r, indent, cfg)
    })

    editor.edit(b => {
        const eol = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
        for(let i = 0; i < ranges.length; i++) {
            const infos = ranges[i]!.infos
            const last = infos.at(-1)!.line
            const loc = new vscode.Range(infos[0]!.line.lineNumber, 0, last.lineNumber, last.text.length)
            const text = outputs[i]!.join(eol)
            if(doc.getText(loc) !== text) { b.replace(loc, text) }
        }
    })
}

// ─── Extension lifecycle ──────────────────────────────────────────────────────

export function activate(ctx: vscode.ExtensionContext) {
    let alignOnEnter = vscode.workspace.getConfiguration('betterAlign').get<boolean>('alignAfterTypeEnter')

    ctx.subscriptions.push(
        vscode.commands.registerTextEditorCommand('vscode-better-align.align', process),

        vscode.workspace.onDidChangeTextDocument(e => {
            if(alignOnEnter && e.contentChanges.some(c => c.text.includes('\n'))) { vscode.commands.executeCommand('vscode-better-align.align') }
        }),

        vscode.workspace.onDidChangeConfiguration(e => {
            if(e.affectsConfiguration('betterAlign')) { alignOnEnter = vscode.workspace.getConfiguration('betterAlign').get<boolean>('alignAfterTypeEnter') }
        }),
    )
}

export function deactivate() { }

export { ws, tokenizeLine, TokenType, LanguageSyntaxConfig, LineInfo, LineRange }