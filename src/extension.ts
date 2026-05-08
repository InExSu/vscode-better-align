'use strict'
import * as vscode from 'vscode'

// ─── Types ────────────────────────────────────────────────────────────────────

const enum TokenType {
    Invalid       = 'Invalid'      ,
    Word          = 'Word'         ,
    Assignment    = 'Assignment'   ,
    Arrow         = 'Arrow'        ,
    Block         = 'Block'        ,
    PartialBlock  = 'PartialBlock' ,
    EndOfBlock    = 'EndOfBlock'   ,
    String        = 'String'       ,
    PartialString = 'PartialString',
    Comment       = 'Comment'      ,
    Whitespace    = 'Whitespace'   ,
    Colon         = 'Colon'        ,
    Comma         = 'Comma'        ,
    CommaAsWord   = 'CommaAsWord'  ,
    Insertion     = 'Insertion'    ,
    Spaceship     = 'Spaceship'    ,
    PHPShortEcho  = 'PHPShortEcho' ,
    From          = 'From'         ,
    Comparison    = 'Comparison'   ,
}

interface Token { type: TokenType; text: string }
interface BlockComment { start: string; end: string }
interface LanguageSyntaxConfig { lineComments: string[]; blockComments: BlockComment[] }
interface TextLine { text: string; lineNumber: number }
interface LineInfo { line: TextLine; sgfntTokenType: TokenType; sgfntTokens: TokenType[]; tokens: Token[] }
interface LineRange { anchor: number; infos: LineInfo[] }

// ─── Language config ──────────────────────────────────────────────────────────

const DEFAULT_LANG: Record<string, LanguageSyntaxConfig> = {
    bash       : { lineComments: ['#'], blockComments: [] }                                ,
    c          : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    cpp        : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    csharp     : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    dockerfile : { lineComments: ['#'], blockComments: [] }                                ,
    go         : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    html       : { lineComments: [], blockComments: [{ start: '<!--', end: '-->' }] }      ,
    java       : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    javascript : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    julia      : { lineComments: ['#'], blockComments: [{ start: '#=', end: '=#' }] }      ,
    php        : { lineComments: ['//', '#'], blockComments: [{ start: '/*', end: '*/' }] },
    python     : { lineComments: ['#'], blockComments: [] }                                ,
    ruby       : { lineComments: ['#'], blockComments: [] }                                ,
    rust       : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    shellscript: { lineComments: ['#'], blockComments: [] }                                ,
    sql        : { lineComments: ['--'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    typescript : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }     ,
    yaml       : { lineComments: ['#'], blockComments: [] }                                ,
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
    // Don't treat `://` (URLs) as a line comment
    return m === '//' && pos > 0 && text[pos - 1] === ':' ? null : m
}

const findBlockCommentEnd = (text: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    for(const bc of sortByLenDesc(cfg.blockComments)) {
        if(text.startsWith(bc.start, pos)) { return bc.end }
    }
    return null
}

// ─── PHP-aware helpers ────────────────────────────────────────────────────────
//
// Three PHP/generic constructs that must NOT be split into separate tokens:
//
//   1. `<?php` / `<?=`  — PHP open tags starting with `<`
//   2. `->`              — PHP object-access operator (also used in other langs)
//   3. `array<T>`        — Generic type annotations using `<`/`>` as angle brackets
//
// For (3) we use a heuristic: if `<` is immediately preceded (no space) by a
// word character (letter, digit, `_`, `\`, `>`), treat the whole `<...>` block
// as a generic/type annotation and consume it as a single Word token.
//
// For `->` we check before handling `-` as Assignment/Word.
//
// For `<?` we check before handling `<` as Comparison.

/** Returns true when the `<` at `pos` opens a generic type annotation.
 *  Heuristic: the character immediately before `pos` (ignoring nothing — must be adjacent)
 *  is a word character or `>` (closing of an outer generic). */
const isGenericOpen = (text: string, pos: number): boolean => {
    if(pos === 0) { return false }
    const prev = text[pos - 1]!
    return /[\w>\\]/.test(prev)
}

/** Consume a balanced `<...>` generic block starting at `pos` (pointing at `<`).
 *  Handles nesting.  Returns the index AFTER the closing `>`, or -1 if unbalanced. */
const consumeGeneric = (text: string, pos: number): number => {
    let depth = 0
    let i     = pos
    while(i < text.length) {
        if(text[i] === '<') { depth++; i++; continue }
        if(text[i] === '>') {
            depth--
            i++
            if(depth === 0) { return i }
            continue
        }
        i++
    }
    return -1  // unbalanced — caller falls back to Comparison
}

// ─── Tokeniser state machine ──────────────────────────────────────────────────
//
// States:
//    Default        — scanning character by character, classifying tokens
//    InString       — consuming until matching unescaped closing quote
//    InBlock        — consuming until matching closing bracket (depth-tracked)
//    InLineComment  — consuming rest of line
//    InBlockComment — consuming until closing sequence
//
// Transitions:
//    Default → InString       on " ' `
//    Default → InBlock        on { ( [
//    Default → InLineComment  on line comment marker
//    Default → InBlockComment on block comment start
//    InString → Default       on matching unescaped close quote
//    InBlock  → Default       on matching close bracket (depth = 0)
//    InBlock  → InBlock       on nested open bracket (depth++)
//    InLineComment  → (exits; line ends)
//    InBlockComment → Default on block comment end sequence

const enum State { Default, InString, InBlock, InLineComment, InBlockComment }

const BRACKET_PAIR: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

// classifyAtDefault returns either the normal classification OR, for multi-char
// tokens that must be emitted as a single Word (generics, `->`, PHP tags), an
// `advance` that skips the entire sequence so the state machine never splits it.
function classifyAtDefault(
    text: string, pos: number, cfg: LanguageSyntaxConfig
): { type: TokenType; advance: number } {
    const ch = text[pos] ?? ''
    const nx = text[pos + 1] ?? ''
    const rd = text[pos + 2] ?? ''

    if(ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        return { type: TokenType.Whitespace, advance: 1 }
    }

    switch(ch) {
        case '"': 
        case "'": 
        case '`': 
            return { type: TokenType.String, advance: 1 }

        case '{': 
        case '(': 
        case '[': 
            return { type: TokenType.Block, advance: 1 }

        case '}': 
        case ')': 
        case ']': 
            return { type: TokenType.EndOfBlock, advance: 1 }

        case ',': 
            return { type: TokenType.Comma, advance: 1 }

        // ── `<` — PHP tags, spaceship, PHP short-echo, comparison, or generic ──
        case '<': {
            // PHP open tag: `<?php` or `<?=`
            if(nx === '?') {
                // Consume until end of tag token: `<?php`, `<?=`, or just `<?`
                // We treat the whole `<?...` opening sequence as a Word so it
                // is never split across tokens.
                let end = pos + 2
                // Consume alphabetic suffix (e.g. "php" in `<?php`)
                while(end < text.length && /[a-zA-Z]/.test(text[end]!)) { end++ }
                return { type: TokenType.Word, advance: end - pos }
            }

            // Spaceship <=>
            if(nx === '=' && rd === '>') { return { type: TokenType.Spaceship, advance: 3 } }

            // PHP short-echo `<?=` already handled above (nx === '?')

            // Comparison variants `<==` `<=` `<`
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }

            // Generic type annotation: `array<T>`, `Map<K,V>`, etc.
            if(isGenericOpen(text, pos)) {
                const end = consumeGeneric(text, pos)
                if(end !== -1) { return { type: TokenType.Word, advance: end - pos } }
            }

            return { type: TokenType.Comparison, advance: 1 }
        }

        // ── `>` — only a comparison; generics are consumed wholesale by `<` above ──
        case '>': 
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }
            return { type: TokenType.Comparison, advance: 1 }

        case '!': 
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case '=': 
            if(nx === '>') { return { type: TokenType.Arrow, advance: 2 } }
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }
            return { type: TokenType.Assignment, advance: 1 }

        // ── `-` — must check for `->` (PHP/JS object access) before `assignment` ──
        case '-': 
            if(nx === '>') { return { type: TokenType.Word, advance: 2 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case '+': 
        case '*': 
        case '%': 
        case '~': 
        case '|': 
        case '^': 
        case '.': 
        case '&': 
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case '/': {
            const lc = findLineComment(text, pos, cfg)
            if(lc) { return { type: TokenType.Comment, advance: 1 } }
            const bcEnd = findBlockCommentEnd(text, pos, cfg)
            if(bcEnd) { return { type: TokenType.Comment, advance: 1 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }
        }

        case ':': 
            if(nx === ':') { return { type: TokenType.Word, advance: 2 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Colon, advance: 1 }
    }

    // Generic comment detection for non-'/' starters (e.g. '#', '--')
    if(findLineComment(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
    if(findBlockCommentEnd(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }

    return { type: TokenType.Word, advance: 1 }
}

function nextStateFor(type: TokenType, text: string, pos: number, cfg: LanguageSyntaxConfig): {
    state: State; quote: string; open: string; blockEnd: string
} {
    if(type === TokenType.String) { return { state: State.InString, quote: text[pos] ?? '', open: '', blockEnd: '' } }
    if(type === TokenType.Block) { return { state: State.InBlock, quote: '', open: text[pos] ?? '', blockEnd: '' } }
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
    const text            = ln.text
    const tokens: Token[] = []

    let state      = State.Default
    let tokenStart = -1
    let lastType   = TokenType.Invalid
    let quote      = ''
    let open       = ''
    let blockDepth = 0
    let blockEnd   = ''

    const flush = (upTo: number, overrideType?: TokenType) => {
        if(tokenStart === -1) { return }
        tokens.push({ type: overrideType ?? lastType, text: text.substring(tokenStart, upTo) })
        tokenStart = -1
    }

    let pos = 0
    while(pos < text.length) {
        switch(state) {

            case State.InString: {
                if(text[pos] === quote) {
                    let backslashCount = 0
                    let k              = pos - 1
                    while(k >= 0 && text[k] === '\\') { backslashCount++; k-- }
                    if(backslashCount % 2 === 0) {
                        pos++
                        flush(pos)
                        state = State.Default
                        break
                    }
                }
                pos++
                break
            }

            case State.InBlock: {
                if(text[pos] === open) {
                    blockDepth++
                    pos++
                } else if(text[pos] === BRACKET_PAIR[open]) {
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
                pos = text.length
                flush(text.length)
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

                // When advance > 1 we have a multi-char token that must be emitted
                // as a single unit (e.g. `->`, `<?php`, generic `array<T>`).
                // Flush the previous token, then immediately emit the whole sequence
                // as a Word and stay in Default — no state transition needed.
                if(advance > 1 && type === TokenType.Word) {
                    flush(pos)
                    tokens.push({ type: TokenType.Word, text: text.substring(pos, pos + advance) })
                    lastType    = TokenType.Word
                    tokenStart  = -1
                    pos        += advance
                    break
                }

                if(type !== lastType) {
                    flush(pos)
                    lastType   = type
                    tokenStart = pos
                    const ns   = nextStateFor(type, text, pos, cfg)
                    state      = ns.state
                    quote      = ns.quote
                    open       = ns.open
                    blockEnd   = ns.blockEnd
                    blockDepth = state === State.InBlock ? 1 : 0
                } else if(tokenStart === -1) {
                    tokenStart = pos
                    const ns   = nextStateFor(type, text, pos, cfg)
                    state      = ns.state
                    quote      = ns.quote
                    open       = ns.open
                    blockEnd   = ns.blockEnd
                    blockDepth = state === State.InBlock ? 1 : 0
                }

                pos += advance
                break
            }
        }
    }

    if(tokenStart !== -1) {
        const partialType = 
            state === State.InString ? TokenType.PartialString :
            state === State.InBlock ? TokenType.PartialBlock :
                    lastType
        flush(text.length, partialType)
    }

    // Refine Comma → CommaAsWord (comma-first style)
    for(let i = 0; i < tokens.length; i++) {
        if(tokens[i]!.type !== TokenType.Comma) { continue }
        const nonWsBefore = tokens.slice(0, i).some(t => t.type !== TokenType.Whitespace)
        if(!nonWsBefore) { tokens[i] = { ...tokens[i]!, type: TokenType.CommaAsWord } }
        break
    }

    // Refine Word → From for JS/TS imports
    const JS_LIKE = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact'])
    if(JS_LIKE.has(lang)) {
        for(const t of tokens) {
            if(t.type === TokenType.Word && t.text === 'from') { t.type = TokenType.From }
        }
    }

    const SIG = new Set([
        TokenType.Assignment, TokenType.Colon, TokenType.Arrow,
        TokenType.Comment, TokenType.From, TokenType.Comparison,
    ])
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
    doc : vscode.TextDocument, start    : number       , end                  : number         , anchor: number,
    lang: string             , overrides: Record<string, LanguageSyntaxConfig>, indentImportant: boolean
): LineRange {
    const tokenize = (ln: number): LineInfo => {
        const tl                      = doc.lineAt(ln)
        const { tokens, sgfntTokens } = tokenizeLine(tl, getLangConfig(lang, overrides), lang)
        return { line: tl, sgfntTokenType: TokenType.Invalid, sgfntTokens, tokens }
    }

    const anchorInfo       = tokenize(anchor)
    const range: LineRange = { anchor, infos: [anchorInfo] }
    let types              = anchorInfo.sgfntTokens

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
        if(hasPartial(info)) { break }
        const tt = intersect(types, info.sgfntTokens)
        if(!tt.length) { break }
        if(indentImportant && !sameIndent(anchorInfo, info)) { break }
        types = tt
        range.infos.push(info)
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

function extractIndent(infos: LineInfo[]): string {
    let min = Infinity, wsChar = ' '
    for(const info of infos) {
        const firstNonWs = info.line.text.search(/\S/)
        min              = Math.min(min, firstNonWs === -1 ? 0 : firstNonWs)
        if(info.tokens[0]?.type === TokenType.Whitespace) {
            wsChar = info.tokens[0].text[0] ?? ' '
            info.tokens.shift()
        }
        if(info.tokens.at(-1)?.type === TokenType.Whitespace) { info.tokens.pop() }
    }
    return wsChar.repeat(min === Infinity ? 0 : min)
}

function padFirstWord(infos: LineInfo[]): void {
    const wordsBefore = (info: LineInfo): number => {
        let count = 0
        for(const t of info.tokens) {
            if(t.type === info.sgfntTokenType) { return count }
            if(t.type !== TokenType.Whitespace && t.type !== TokenType.Block) { count++ }
        }
        return count
    }

    const counts   = infos.map(wordsBefore)
    const maxCount = Math.max(...counts)

    if(maxCount <= 1) { return }

    for(let i = 0; i < infos.length; i++) {
        const info  = infos[i]!
        const count = counts[i]!
        if(count >= maxCount) { continue }

        const firstNonWsIdx = info.tokens.findIndex(t => t.type !== TokenType.Whitespace)
        if(firstNonWsIdx === -1) { continue }

        if(info.tokens[firstNonWsIdx + 1]?.type === TokenType.Whitespace) {
            // already has whitespace after first token — leave it
        } else {
            info.tokens.splice(firstNonWsIdx + 1, 0, { type: TokenType.Insertion, text: ' ' })
        }
    }
}

function stripOperatorWhitespace(infos: LineInfo[]): void {
    for(const info of infos) {
        for(let i = 0; i < info.tokens.length; i++) {
            const t = info.tokens[i]
            if(t?.type !== info.sgfntTokenType && t?.type !== TokenType.Comma) { continue }
            if(t.type === TokenType.Comma && i === 0) { continue }

            if(i > 0 && info.tokens[i - 1]?.type === TokenType.Whitespace) {
                info.tokens.splice(i - 1, 1)
                i--
            }
            if(info.tokens[i + 1]?.type === TokenType.Whitespace) {
                info.tokens.splice(i + 1, 1)
            }
        }

        for(let i = 0; i < info.tokens.length - 1; i++) {
            if(
                info.tokens[i]?.type     === TokenType.Whitespace &&
                info.tokens[i + 1]?.type === TokenType.Whitespace
            ) {
                info.tokens[i] = { type: TokenType.Whitespace, text: info.tokens[i]!.text + info.tokens[i + 1]!.text }
                info.tokens.splice(i + 1, 1)
                i--
            }
        }
    }
}

const DEFAULT_SURROUND: Record<string, [number, number]> = {
    colon     : [0, 1],
    assignment: [1, 1],
    comment   : [2, 0],
    arrow     : [1, 1],
    from      : [1, 1],
    comparison: [1, 1],
}

function normaliseSurround(raw: number | number[] | undefined, key: string): [number, number] {
    const def = DEFAULT_SURROUND[key] ?? [1, 1]
    if(raw === undefined) { return def }
    if(typeof raw === 'number') { return [Math.max(0, raw), 0] }
    const before = Math.max(0, raw[0] ?? def[0])
    const after  = Math.max(0, raw[1] ?? def[1])
    return [before, after]
}

function applyOperator(before: string, op: string, pad: string, before_sp: number, after_sp: number): string {
    return before + pad + ws(before_sp) + op + ws(after_sp)
}

function buildLines(range: LineRange, indent: string, cfg: ReturnType<typeof makeConfig>): string[] {
    if(isOnlyComments(range)) { return range.infos.map(i => i.line.text) }

    padFirstWord(range.infos)
    stripOperatorWhitespace(range.infos)

    const sttKey                = String(range.infos[0]!.sgfntTokenType).toLowerCase()
    const surrounds             = cfg('surroundSpace', {}) as Record<string, number | number[]>
    const rawSurround           = surrounds[sttKey] ?? DEFAULT_SURROUND[sttKey]
    const [before_sp, after_sp] = normaliseSurround(rawSurround, sttKey)

    const rawCommentGap = surrounds['comment'] ?? DEFAULT_SURROUND['comment']
    const commentGap    = typeof rawCommentGap === 'number'
        ? Math.max(0, rawCommentGap)
        : Math.max(0, (rawCommentGap as number[])[0] ?? 2)

    const opAlign = cfg('operatorPadding', 'right') as string

    const infos = range.infos
    const size  = infos.length

    const col: number[]    = new Array(size).fill(0)
    const result: string[] = new Array(size).fill(indent)

    let done = 0
    while(done < size) {
        let maxOpLen = 0, maxCol = 0
        for(let l = 0; l < size; l++) {
            if(col[l] === -1) { continue }
            const info = infos[l]!
            const toks = info.tokens

            const end = toks.length > 1 && toks.at(-1)?.type === TokenType.Comment
                ? (toks.at(-2)?.type === TokenType.Whitespace ? toks.length - 2 : toks.length - 1)
                : toks.length

            let cur = result[l]!
            let j   = col[l]!
            for(; j < end; j++) {
                const t = toks[j]!
                if(t.type === info.sgfntTokenType || (t.type === TokenType.Comma && j !== 0)) {
                    maxOpLen = Math.max(maxOpLen, t.text.length)
                    maxCol   = Math.max(maxCol, cur.length)
                    break
                }
                cur += t.text
            }
            result[l] = cur
            if(j === end) { done++; col[l] = -1; toks.splice(0, end) }
            else { col[l] = j }
        }

        for(let l = 0; l < size; l++) {
            const j = col[l]!
            if(j === -1) { continue }

            const info = infos[l]!
            const toks = info.tokens
            const cur  = result[l]!
            const pad  = ws(maxCol - cur.length)

            let opText = toks[j]!.text
            if(opText.length < maxOpLen) {
                opText = opAlign === 'right'
                    ? ws(maxOpLen - opText.length) + opText
                    : opText + ws(maxOpLen - opText.length)
            }

            if(toks[j]!.type === TokenType.Comma) {
                result[l] = cur + pad + opText + (j < toks.length - 1 ? ' ' : '')
            } else if(toks.length === 1 && toks[0]!.type === TokenType.Comment) {
                done++
            } else {
                result[l] = applyOperator(cur, opText, pad, before_sp, after_sp)
            }

            let next = j + 1
            if(toks[next]?.type === TokenType.Whitespace) { next++ }
            col[l] = next
        }
    }

    const maxLen = result.reduce((m, r) => Math.max(m, r.length), 0)
    for(let l = 0; l < size; l++) {
        const remaining = infos[l]!.tokens
        if(remaining.length === 0) { continue }

        const trailing = remaining[remaining.length - 1]
        if(trailing?.type === TokenType.Comment) {
            for(let k = 0; k < remaining.length - 1; k++) {
                result[l] += remaining[k]!.text
            }
            result[l] += ws(maxLen - result[l]!.length + commentGap) + trailing.text
        } else {
            for(const t of remaining) { result[l] += t.text }
        }
    }

    return result
}

// ─── Config ───────────────────────────────────────────────────────────────────

type ConfigFn = (key: string, defaultValue?: unknown) => unknown

function makeConfig(doc: vscode.TextDocument): ConfigFn {
    const base              = vscode.workspace.getConfiguration('betterAlign')
    let lang: Record<string, unknown> | null = null
    try {
        lang = vscode.workspace.getConfiguration().get<Record<string, unknown>>(`[${doc.languageId}]`) ?? null
    } catch { }
    return (key, def) => lang?.[`betterAlign.${key}`] ?? base.get(key, def)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function process(editor: vscode.TextEditor): void {
    const doc                 = editor.document
    const cfg                 = makeConfig(doc)
    const overrides           = cfg('languageConfigs', {}) as Record<string, LanguageSyntaxConfig>
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
            const r    = collectRange(doc, start, end, start, doc.languageId, overrides, indentImportant)
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
            const last  = infos.at(-1)!.line
            const loc   = new vscode.Range(infos[0]!.line.lineNumber, 0, last.lineNumber, last.text.length)
            const text  = outputs[i]!.join(eol)
            if(doc.getText(loc) !== text) { b.replace(loc, text) }
        }
    })
}

// ─── Extension lifecycle ──────────────────────────────────────────────────────

export function activate(ctx: vscode.ExtensionContext) {
    let alignOnEnter = vscode.workspace.getConfiguration('betterAlign').get<boolean>('alignAfterTypeEnter')

    ctx.subscriptions.push(
        vscode.commands.registerTextEditorCommand('vscode-better-align-columns.align', process),

        vscode.workspace.onDidChangeTextDocument(e => {
            if(alignOnEnter && e.contentChanges.some(c => c.text.includes('\n'))) { vscode.commands.executeCommand('vscode-better-align-columns.align') }
        }),

        vscode.workspace.onDidChangeConfiguration(e => {
            if(e.affectsConfiguration('betterAlign')) {
                alignOnEnter = vscode.workspace.getConfiguration('betterAlign').get<boolean>('alignAfterTypeEnter')
            }
        }),
    )
}

export function deactivate() { }

export { ws, tokenizeLine, TokenType, LanguageSyntaxConfig, LineInfo, LineRange }