'use strict'
import * as vscode from 'vscode'

// ─── Types ────────────────────────────────────────────────────────────────────

const enum TokenType {
    Arrow         = 'Arrow'        ,
    Assignment    = 'Assignment'   ,
    Block         = 'Block'        ,   // `[...]` — opaque
    Colon         = 'Colon'        ,
    Comma         = 'Comma'        ,
    CommaAsWord   = 'CommaAsWord'  ,
    Comment       = 'Comment'      ,
    Comparison    = 'Comparison'   ,
    EndOfBlock    = 'EndOfBlock'   ,
    From          = 'From'         ,
    Insertion     = 'Insertion'    ,
    Invalid       = 'Invalid'      ,
    OpenBrace     = 'OpenBrace'    ,   // `{`  — significant alignment token
    OpenParen     = 'OpenParen'    ,   // `(`  — significant alignment token
    PartialBlock  = 'PartialBlock' ,
    PartialString = 'PartialString',
    PHPShortEcho  = 'PHPShortEcho' ,
    Semicolon     = 'Semicolon'    ,   // `;`  — significant alignment token
    Spaceship     = 'Spaceship'    ,
    String        = 'String'       ,
    Whitespace    = 'Whitespace'   ,
    Word          = 'Word'         ,
}

interface Token                { type: TokenType; text: string }
interface BlockComment         { start: string; end: string }
interface LanguageSyntaxConfig { lineComments: string[]; blockComments: BlockComment[] }
interface TextLine             { text: string; lineNumber: number }
interface LineInfo             { line: TextLine; sgfntTokenType: TokenType; sgfntTokens: TokenType[]; tokens: Token[] }
interface LineRange            { anchor: number; infos: LineInfo[] }

// ─── Language config ──────────────────────────────────────────────────────────

const DEFAULT_LANG: Record<string, LanguageSyntaxConfig> = {
    bash        : { lineComments : ['#'], blockComments       : [] },
    c           : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    cpp         : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    csharp      : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    dockerfile  : { lineComments : ['#'], blockComments       : [] },
    go          : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    html        : { lineComments : [], blockComments          : [{ start: '<!--', end: '-->' }] },
    java        : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    javascript  : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    julia       : { lineComments : ['#'], blockComments       : [{ start: '#=', end: '=#' }] },
    php         : { lineComments : ['//', '#'], blockComments : [{ start: '/*', end: '*/' }] },
    python      : { lineComments : ['#'], blockComments       : [] },
    ruby        : { lineComments : ['#'], blockComments       : [] },
    rust        : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    shellscript : { lineComments : ['#'], blockComments       : [] },
    sql         : { lineComments : ['--'], blockComments      : [{ start: '/*', end: '*/' }] },
    typescript  : { lineComments : ['//'], blockComments      : [{ start: '/*', end: '*/' }] },
    yaml        : { lineComments : ['#'], blockComments       : [] },
}
const FALLBACK: LanguageSyntaxConfig = { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }

const getLangConfig = (lang: string, overrides: Record<string, LanguageSyntaxConfig> = {}) =>
    overrides[lang] ?? DEFAULT_LANG[lang] ?? FALLBACK

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ws = (n: number) => n <= 0 ? '' : ' '.repeat(Math.min(n, 1e6))

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
    return m === '//' && pos > 0 && text[pos - 1] === ':' ? null : m
}

const findBlockCommentStart = (text: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    for(const bc of sortByLenDesc(cfg.blockComments)) {
        if(text.startsWith(bc.start, pos)) { return bc.end }
    }
    return null
}

// ─── PHP / generic helpers ────────────────────────────────────────────────────

const isGenericOpen = (text: string, pos: number): boolean =>
    pos > 0 && /[\w>\\]/.test(text[pos - 1]!)

const consumeGeneric = (text: string, pos: number): number => {
    let depth = 0, i = pos
    while(i < text.length) {
        switch(text[i]) {
            case '<' : depth++; i++; break
            case '>' : depth--; i++; if(depth === 0) { return i } break
            default  : i++
        }
    }
    return -1
}

// ─── Tokeniser state machine ──────────────────────────────────────────────────
// Шалыто-style switch automaton. Flat structure, explicit transitions.

const enum State { Default, InString, InBlock, InLineComment, InBlockComment }
const BRACKET_PAIR: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

function classifyAtDefault(
    text : string, pos : number, cfg : LanguageSyntaxConfig
): { type: TokenType; advance: number } {
    const ch = text[pos] ?? ''
    const nx = text[pos + 1] ?? ''
    const rd = text[pos + 2] ?? ''

    switch(ch) {
        case ' ' : case '\t' : case '\n' : case '\r' : 
            return { type: TokenType.Whitespace, advance: 1 }

        case '"' : case "'" : case '`' : 
            return { type: TokenType.String, advance: 1 }

        case '{' : return { type : TokenType.OpenBrace, advance : 1 }
        case '(' : return { type : TokenType.OpenParen, advance : 1 }
        case '[' : return { type : TokenType.Block, advance     : 1 }

        case '}' : case ')' : case ']' : 
            return { type: TokenType.EndOfBlock, advance: 1 }

        case ';' : return { type : TokenType.Semicolon, advance : 1 }
        case ',' : return { type : TokenType.Comma, advance     : 1 }

        case '<': {
            if(nx === '?') {
                let end = pos + 2
                while(end < text.length && /[a-zA-Z]/.test(text[end]!)) { end++ }
                return { type: TokenType.Word, advance: end - pos }
            }
            switch(true) {
                case nx === '=' && rd === '>': return { type: TokenType.Spaceship, advance: 3 }
                case nx === '=' && rd === '=': return { type: TokenType.Comparison, advance: 3 }
                case nx === '=': return { type: TokenType.Comparison, advance: 2 }
            }
            if(isGenericOpen(text, pos)) {
                const end = consumeGeneric(text, pos)
                if(end !== -1) { return { type: TokenType.Word, advance: end - pos } }
            }
            return { type: TokenType.Comparison, advance: 1 }
        }

        case '>' : 
            switch(true) {
                case nx === '=' && rd === '=' : return { type : TokenType.Comparison, advance : 3 }
                case nx === '='               : return { type : TokenType.Comparison, advance : 2 }
                default                       : return { type : TokenType.Comparison, advance : 1 }
            }

        case '!' : 
            switch(true) {
                case nx === '=' && rd === '=' : return { type : TokenType.Comparison, advance : 3 }
                case nx === '='               : return { type : TokenType.Comparison, advance : 2 }
                default                       : return { type : TokenType.Word, advance       : 1 }
            }

        case '=' : 
            switch(true) {
                case nx === '>'               : return { type : TokenType.Arrow, advance      : 2 }
                case nx === '=' && rd === '=' : return { type : TokenType.Comparison, advance : 3 }
                case nx === '='               : return { type : TokenType.Comparison, advance : 2 }
                default                       : return { type : TokenType.Assignment, advance : 1 }
            }

        case '-' : 
            switch(true) {
                case nx === '>' : return { type : TokenType.Word, advance       : 2 }
                case nx === '=' : return { type : TokenType.Assignment, advance : 2 }
                default         : return { type : TokenType.Word, advance       : 1 }
            }

        case '+' : case '*' : case '%' : case '~' : 
        case '|' : case '^' : case '.' : case '&' : 
            return nx === '=' ? { type: TokenType.Assignment, advance: 2 }
                 : { type : TokenType.Word, advance : 1 }

        case '/' : 
            if(findLineComment(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
            if(findBlockCommentStart(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case ':' : 
            switch(true) {
                case nx === ':' : return { type : TokenType.Word, advance       : 2 }
                case nx === '=' : return { type : TokenType.Assignment, advance : 2 }
                default         : return { type : TokenType.Colon, advance      : 1 }
            }
    }

    if(findLineComment(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
    if(findBlockCommentStart(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
    return { type: TokenType.Word, advance: 1 }
}

function nextStateFor(
    type : TokenType, text : string, pos : number, cfg : LanguageSyntaxConfig
): { state: State; quote: string; open: string; blockEnd: string } {
    switch(type) {
        case TokenType.String : 
            return { state: State.InString, quote: text[pos] ?? '', open: '', blockEnd: '' }
        case TokenType.Block : 
            return { state: State.InBlock, quote: '', open: text[pos] ?? '', blockEnd: '' }
        case TokenType.OpenBrace : 
            return { state: State.InBlock, quote: '', open: '{', blockEnd: '' }
        case TokenType.OpenParen : 
            return { state: State.InBlock, quote: '', open: '(', blockEnd: '' }
        case TokenType.Comment: {
            if(findLineComment(text, pos, cfg)) { return { state: State.InLineComment, quote: '', open: '', blockEnd: '' } }
            const end = findBlockCommentStart(text, pos, cfg)
            if(end) { return { state: State.InBlockComment, quote: '', open: '', blockEnd: end } }
            return { state: State.Default, quote: '', open: '', blockEnd: '' }
        }
        default : 
            return { state: State.Default, quote: '', open: '', blockEnd: '' }
    }
}

function tokenizeLine(ln: { text: string }, cfg: LanguageSyntaxConfig, lang: string): {
    tokens : Token[]; sgfntTokens : TokenType[]
} {
    const text            = ln.text
    const tokens: Token[] = []
    let state             = State.Default
    let tokenStart        = -1
    let lastType          = TokenType.Invalid
    let quote             = ''
    let open              = ''
    let blockDepth        = 0
    let blockEnd          = ''

    const flush = (upTo: number, overrideType?: TokenType) => {
        if         (tokenStart === -1) { return }
        tokens.push({ type: overrideType ?? lastType, text: text.substring(tokenStart, upTo) })
        tokenStart = -1
    }

    let pos = 0
    while(pos < text.length) {
        switch(state) {
            case State.InString: {
                if(text[pos] === quote) {
                    let backslashes = 0, k = pos - 1
                    while(k >= 0 && text[k] === '\\') { backslashes++; k-- }
                    if   (backslashes % 2 === 0) { pos++; flush(pos); state = State.Default; break }
                }
                pos++
                break
            }

            case State.InBlock: {
                switch(text[pos]) {
                    case undefined : pos++; break
                    case (open)    : blockDepth++; pos++; break
                    case (BRACKET_PAIR[open]): {
                        pos++; blockDepth--
                        if(blockDepth === 0) { flush(pos); state = State.Default }
                        break
                    }
                    default : pos++
                }
                break
            }

            case State.InLineComment : { pos = text.length; flush(text.length); break }

            case State.InBlockComment: {
                if(text.startsWith(blockEnd, pos)) { pos += blockEnd.length; flush(pos); state = State.Default }
                else { pos++ }
                break
            }

            case State.Default: {
                const { type, advance } = classifyAtDefault(text, pos, cfg)

                if(advance > 1 && type === TokenType.Word) {
                    flush      (pos)
                    tokens.push({ type: TokenType.Word, text: text.substring(pos, pos + advance) })
                    lastType = TokenType.Word; tokenStart = -1; pos += advance
                    break
                }

                if(type !== lastType) {
                    flush(pos)
                    lastType   = type
                    tokenStart = pos
                    const ns   = nextStateFor(type, text, pos, cfg)
                    state      = ns.state; quote = ns.quote; open = ns.open; blockEnd = ns.blockEnd
                    blockDepth = state === State.InBlock ? 1 : 0
                } else if(tokenStart === -1) {
                    tokenStart = pos
                    const ns   = nextStateFor(type, text, pos, cfg)
                    state      = ns.state; quote = ns.quote; open = ns.open; blockEnd = ns.blockEnd
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
            state === State.InBlock ? TokenType.PartialBlock : lastType
        flush(text.length, partialType)
    }

    // Split {…} and (…) tokens into Open + Block(inner) + EndOfBlock
    const split: Token[] = []
    for(const tok of tokens) {
        const ch = tok.text[0]
        if((tok.type === TokenType.Block || tok.type === TokenType.OpenBrace || tok.type === TokenType.OpenParen) && tok.text.length >= 2 && (ch === '{' || ch === '(')) {
            const opType = ch === '{' ? TokenType.OpenBrace : TokenType.OpenParen
            split.push({ type: opType, text: ch })
            split.push({ type: TokenType.Block, text: tok.text.slice(1, -1) })
            split.push({ type: TokenType.EndOfBlock, text: BRACKET_PAIR[ch]! })
        } else {
            split.push(tok)
        }
    }

    const finalTokens = split

    // Refine Comma → CommaAsWord
    for(let i = 0; i < finalTokens.length; i++) {
        if(finalTokens[i]!.type !== TokenType.Comma) { continue }
        const nonWsBefore = finalTokens.slice(0, i).some(t => t.type !== TokenType.Whitespace)
        if(!nonWsBefore) { finalTokens[i] = { ...finalTokens[i]!, type: TokenType.CommaAsWord } }
        break
    }

    // Refine Word → From (JS-like langs)
    const JS_LIKE = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact'])
    if(JS_LIKE.has(lang)) {
        for(const t of finalTokens) {
            if(t.type === TokenType.Word && t.text === 'from') { t.type = TokenType.From }
        }
    }

    const SIG = new Set([
        TokenType.Assignment, TokenType.Colon, TokenType.Arrow,
        TokenType.Comment, TokenType.From, TokenType.Comparison,
        TokenType.OpenBrace, TokenType.OpenParen, TokenType.Semicolon,
    ])
    const sgfntTokens: TokenType[] = []
    for(const t of finalTokens) {
        if(SIG.has(t.type) && !sgfntTokens.includes(t.type)) { sgfntTokens.push(t.type) }
    }

    return { tokens: finalTokens, sgfntTokens }
}

// ─── tokenizeFlat — transparent recursion for { and ( ─────────────────────────

const enum FlatState { Word, InString, InBracket, InLineComment, InBlockComment }

function tokenizeFlat(inner: string, cfg: LanguageSyntaxConfig): Token[] {
    const result: Token[] = []
    let state             = FlatState.Word
    let pos               = 0, start = 0, quote = '', depth = 0, bcEnd = ''

    const flushWord = (upTo: number) => {
        if(start < upTo) { result.push({ type: TokenType.Word, text: inner.substring(start, upTo) }) }
    }

    while(pos < inner.length) {
        const ch = inner[pos]!
        switch(state) {
            case FlatState.InString: {
                if(ch === quote) {
                    let backslashes = 0, k = pos - 1
                    while(k >= 0 && inner[k] === '\\') { backslashes++; k-- }
                    if(backslashes % 2 === 0) {
                        pos++
                        result.push({ type: TokenType.String, text: inner.substring(start, pos) })
                        start = pos; state = FlatState.Word
                } else { pos++ }
                } else { pos++ }
                break
            }

            case FlatState.InBracket: {
                switch(ch) {
                    case '[' : depth++; pos++; break
                    case ']': {
                        depth--; pos++
                        if(depth === 0) {
                            result.push({ type: TokenType.Block, text: inner.substring(start, pos) })
                            start = pos; state = FlatState.Word
                        }
                        break
                    }
                    default : pos++
                }
                break
            }

            case FlatState.InLineComment: {
                pos = inner.length
                result.push({ type: TokenType.Comment, text: inner.substring(start, pos) })
                start = pos
                break
            }

            case FlatState.InBlockComment: {
                if(inner.startsWith(bcEnd, pos)) {
                    pos += bcEnd.length
                    result.push({ type: TokenType.Comment, text: inner.substring(start, pos) })
                    start = pos; state = FlatState.Word
                } else { pos++ }
                break
            }

            case FlatState.Word: {
                switch(ch) {
                    case '"': case "'": case '`': {
                        flushWord(pos)
                        start = pos; quote = ch; state = FlatState.InString; pos++
                        break
                    }
                    case '[': {
                        flushWord(pos)
                        start = pos; depth = 1; state = FlatState.InBracket; pos++
                        break
                    }
                    case '{': {
                        flushWord  (pos)
                        result.push({ type: TokenType.OpenBrace, text: '{' })
                        pos++
                        let d = 1, s = pos
                        while(pos < inner.length && d > 0) {
                            switch(inner[pos]) {
                                case '{' : d++; pos++; break
                                case '}' : d--; if(d > 0) { pos++ }; break
                                default  : pos++
                            }
                        }
                        result.push(...tokenizeFlat(inner.substring(s, pos), cfg))
                        result.push({ type: TokenType.EndOfBlock, text: '}' })
                        if         (pos < inner.length) { pos++ }
                        start = pos
                        break
                    }
                    case '(': {
                        flushWord(pos)
                        result.push({ type: TokenType.OpenParen, text: '(' })
                        pos++
                        let d = 1, s = pos
                        while(pos < inner.length && d > 0) {
                            switch(inner[pos]) {
                                case '(' : d++; pos++; break
                                case ')' : d--; if(d > 0) { pos++ }; break
                                default  : pos++
                            }
                        }
                        result.push(...tokenizeFlat(inner.substring(s, pos), cfg))
                        result.push({ type: TokenType.EndOfBlock, text: ')' })
                        if(pos < inner.length) { pos++ }
                        start = pos
                        break
                    }
                    case ';': {
                        flushWord  (pos)
                        result.push({ type: TokenType.Semicolon, text: ';' })
                        pos++; start = pos
                        break
                    }
                    case ',': {
                        flushWord  (pos)
                        result.push({ type: TokenType.Comma, text: ',' })
                        pos++; start = pos
                        break
                    }
                    case ':': {
                        const nx = inner[pos + 1]
                        if         (nx === ':' || nx === '=') { pos += 2; break }
                        flushWord  (pos)
                        result.push({ type: TokenType.Colon, text: ':' })
                        pos++; start = pos
                        break
                    }
                    default: {
                        const lc = findLineComment(inner, pos, cfg)
                        if(lc) {
                            flushWord(pos)
                            start = pos; state = FlatState.InLineComment; pos++
                            break
                        }
                        const be = findBlockCommentStart(inner, pos, cfg)
                        if(be) {
                            flushWord(pos)
                            start = pos; bcEnd = be; state = FlatState.InBlockComment; pos++
                            break
                        }
                        pos++
                    }
                }
                break
            }
        }
    }

    // Flush tail — each case handles its own cleanup, no fallthrough confusion
    switch(state) {
        case FlatState.Word           : flushWord(inner.length); break
        case FlatState.InString       : result.push({ type : TokenType.String, text  : inner.substring(start) }); break
        case FlatState.InBracket      : result.push({ type : TokenType.Block, text   : inner.substring(start) }); break
        case FlatState.InLineComment  : 
        case FlatState.InBlockComment : result.push({ type : TokenType.Comment, text : inner.substring(start) }); break
    }

    return result.filter(t => t.text.length > 0)
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

const SIG_BLOCK = new Set([TokenType.OpenBrace, TokenType.OpenParen, TokenType.Semicolon])

function prefixKey(tokens: Token[], type: TokenType): string {
    const parts: string[] = []
    for(const t of tokens) {
        if(t.type === type) { break }
        if(t.type === TokenType.Whitespace) { continue }
        switch(t.type) {
            case TokenType.Word : case TokenType.String : case TokenType.Block : case TokenType.CommaAsWord : 
                parts.push(t.type); break
            default : parts.push(t.text)
        }
    }
    return parts.join('|')
}

function intersectWithStructure(anchor: LineInfo, candidate: LineInfo): TokenType[] {
    const common     = intersect(anchor.sgfntTokens, candidate.sgfntTokens)
    const blockTypes = common.filter(t => SIG_BLOCK.has(t))
    const otherTypes = common.filter(t => !SIG_BLOCK.has(t))
    const result     = [...otherTypes]
    for(const bt of blockTypes) {
        if(prefixKey(anchor.tokens, bt) === prefixKey(candidate.tokens, bt)) { result.push(bt) }
    }
    return result
}

function collectRange(
    doc  : vscode.TextDocument, start : number, end                                           : number, anchor : number,
    lang : string, overrides          : Record<string, LanguageSyntaxConfig>, indentImportant : boolean
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
        const tt = intersectWithStructure(anchorInfo, info)
        if(!tt.length) { break }
        if(indentImportant && !sameIndent(anchorInfo, info)) { break }
        types = tt
        range.infos.unshift(info)
    }

    for(let i = anchor + 1; i <= end; i++) {
        const info = tokenize(i)
        if(hasPartial(info)) { break }
        const tt = intersectWithStructure(anchorInfo, info)
        if(!tt.length) { break }
        if(indentImportant && !sameIndent(anchorInfo, info)) { break }
        types = tt
        range.infos.push(info)
    }

    const sgt = types.includes(TokenType.Assignment) ? TokenType.Assignment : types[0]!
    for(const info of range.infos) { info.sgfntTokenType = sgt }
    return range
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

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
        const info = infos[i]!, count = counts[i]!
        if(count >= maxCount) { continue }
        const firstNonWsIdx = info.tokens.findIndex(t => t.type !== TokenType.Whitespace)
        if(firstNonWsIdx === -1) { continue }
        if(info.tokens[firstNonWsIdx + 1]?.type !== TokenType.Whitespace) {
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
            if(i > 0 && info.tokens[i - 1]?.type === TokenType.Whitespace) { info.tokens.splice(i - 1, 1); i-- }
            if(info.tokens[i + 1]?.type === TokenType.Whitespace) { info.tokens.splice(i + 1, 1) }
        }
        for(let i = 0; i < info.tokens.length - 1; i++) {
            if(info.tokens[i]?.type === TokenType.Whitespace && info.tokens[i + 1]?.type === TokenType.Whitespace) {
                info.tokens[i] = { type: TokenType.Whitespace, text: info.tokens[i]!.text + info.tokens[i + 1]!.text }
                info.tokens.splice(i + 1, 1); i--
            }
        }
    }
}

function stripBracketWhitespace(infos: LineInfo[]): void {
    for(const info of infos) {
        const sgt = info.sgfntTokenType
        if(sgt !== TokenType.OpenBrace && sgt !== TokenType.OpenParen) { continue }
        for(let i = 0; i < info.tokens.length; i++) {
            if(info.tokens[i]?.type !== sgt) { continue }
            if(i > 0 && info.tokens[i - 1]?.type === TokenType.Whitespace) { info.tokens.splice(i - 1, 1); i-- }
        }
    }
}

// ─── DEFAULT_SURROUND ─────────────────────────────────────────────────────────

const DEFAULT_SURROUND: Record<string, [number, number]> = {
    colon : [1, 1], assignment : [1, 1], comment   : [2, 0], arrow     : [1, 1],
    from  : [1, 1], comparison : [1, 1], openbrace : [1, 0], openparen : [0, 0], semicolon : [0, 1],
}

function normaliseSurround(raw: number | number[] | undefined, key: string): [number, number] {
    const def = DEFAULT_SURROUND[key] ?? [1, 1]
    if(raw === undefined) { return def }
    if(typeof raw === 'number') { return [Math.max(0, raw), 0] }
    return [Math.max(0, raw[0] ?? def[0]), Math.max(0, raw[1] ?? def[1])]
}

function applyOperator(before: string, op: string, pad: string, bsp: number, asp: number): string {
    return before + pad + ws(bsp) + op + ws(asp)
}

// ─── buildSemicolonAlignedLines — FIXED: no duplicate rendering ───────────────

function buildSemicolonAlignedLines(
    infos : LineInfo[], indent : string, cfg : LanguageSyntaxConfig
): string[] {
    type Seg = Token[]
    type Row = { segs: Seg[]; seps: Token[]; rendered: boolean[] }

    // Build flat token streams
    const flatRows = infos.map(info => {
        const expanded: Token[] = []
        for(const tok of info.tokens) {
            switch(tok.type) {
                case TokenType.OpenBrace : case TokenType.OpenParen : case TokenType.EndOfBlock : 
                    expanded.push(tok); break
                case TokenType.Block : 
                    expanded.push(...tokenizeFlat(tok.text, cfg)); break
                default : 
                    expanded.push(tok)
            }
        }
        return expanded
    })

    // Split at semicolons, track which segments are rendered
    const splitRows = flatRows.map(toks => {
        const segs: Seg[] = [], seps: Token[] = [], rendered: boolean[] = []
        let cur: Token[]  = []
        for(const t of toks) {
            if(t.type === TokenType.Semicolon) { segs.push(cur); rendered.push(false); seps.push(t); cur = [] }
            else { cur.push(t) }
        }
        segs.push(cur); rendered.push(false)
        return { segs, seps, rendered }
    })

    const numSeps           = Math.max(...splitRows.map(r => r.seps.length))
    const renderSeg         = (seg: Seg) => seg.map(t => t.text).join('')
    const results: string[] = infos.map(() => indent)

    for(let si = 0; si < numSeps; si++) {
        // Step 1: align prefix before `;` and emit `;`
        const prefixLens = splitRows.map((row, li) => {
            if(si >= row.segs.length || row.rendered[si]) { return results[li]!.length }
            return results[li]!.length + renderSeg(row.segs[si]!).trimEnd().length
        })
        const maxPrefix = Math.max(...prefixLens.filter((_, li) => si < splitRows[li]!.seps.length && !splitRows[li]!.rendered[si]))

        for(let li = 0; li < infos.length; li++) {
            const row = splitRows[li]!
            if(si >= row.segs.length || row.rendered[si]) { continue }
            const segText      = renderSeg(row.segs[si]!).trimEnd()
            results [li]      += segText + ws(maxPrefix - results[li]!.length - segText.length) + ';'
            row.rendered [si]  = true
        }

        // Step 2: align first token after `;` (min 1 space)
        const afterCols = splitRows.map((row, li) => {
            if(si >= row.seps.length) { return 0 }
            const raw    = renderSeg(row.segs[si + 1] ?? [])
            const spaces = raw.length - raw.trimStart().length
            return results[li]!.length + Math.max(1, spaces)
        })
        const targetCol = Math.max(...afterCols.filter((_, li) => si < splitRows[li]!.seps.length))

        for(let li = 0; li < infos.length; li++) {
            const row = splitRows[li]!
            if(si >= row.seps.length) { continue }
            const nextSeg      = row.segs[si + 1] ?? []
            const trimmed      = renderSeg(nextSeg).trimStart()
            results [li]      += ws(targetCol - results[li]!.length)
            row.segs [si + 1]  = [{ type: TokenType.Word, text: trimmed }]
        }
    }

    // Emit last segment — ONLY if not already rendered
    for(let li = 0; li < infos.length; li++) {
        const row     = splitRows[li]!
        const lastIdx = row.segs.length - 1
        if(!row.rendered[lastIdx]) {
            const lastSeg  = row.segs[lastIdx] ?? []
            results [li]  += renderSeg(lastSeg)
        }
    }

    return results
}

// ─── buildColonAlignedLines — FIXED: no duplicate rendering ───────────────────

function buildColonAlignedLines(
    infos : LineInfo[], indent : string, cfg : LanguageSyntaxConfig
): string[] {
    type Seg = Token[]
    type Row = { segs: Seg[]; seps: Token[]; rendered: boolean[] }

    const flatRows = infos.map(info => tokenizeFlat(info.tokens.map(t => t.text).join(''), cfg))

    const splitRows = flatRows.map(toks => {
        const segs: Seg[] = [], seps: Token[] = [], rendered: boolean[] = []
        let cur: Token[]  = []
        for(const t of toks) {
            if(t.type === TokenType.Colon) { segs.push(cur); rendered.push(false); seps.push(t); cur = [] }
            else { cur.push(t) }
        }
        segs.push(cur); rendered.push(false)
        return { segs, seps, rendered }
    })

    const numSeps           = Math.max(...splitRows.map(r => r.seps.length))
    const renderSeg         = (seg: Seg) => seg.map(t => t.text).join('')
    const results: string[] = infos.map(() => indent)

    for(let si = 0; si < numSeps; si++) {
        // Align prefix before `:`
        const prefixLens = splitRows.map((row, li) => {
            if(si >= row.segs.length || row.rendered[si]) { return results[li]!.length }
            return results[li]!.length + renderSeg(row.segs[si]!).trimEnd().length
        })
        const maxPrefix = Math.max(...prefixLens.filter((_, li) => si < splitRows[li]!.seps.length && !splitRows[li]!.rendered[si]))

        for(let li = 0; li < infos.length; li++) {
            const row = splitRows[li]!
            if(si >= row.seps.length || row.rendered[si]) { results[li] += renderSeg(row.segs[si] ?? []); row.rendered[si] = true; continue }
            const segText      = renderSeg(row.segs[si]!).trimEnd()
            results [li]      += segText + ws(maxPrefix - results[li]!.length - segText.length) + ' :'
            row.rendered [si]  = true
        }

        // One space after `:`
        for(let li = 0; li < infos.length; li++) {
            const row = splitRows[li]!
            if(si >= row.seps.length) { continue }
            const nextSeg     = row.segs[si + 1] ?? []
            const trimmed     = renderSeg(nextSeg).trimStart()
            row.segs [si + 1] = [{ type: TokenType.Word, text: ' ' + trimmed }]
        }
    }

    // Emit last segment — ONLY if not already rendered
    for(let li = 0; li < infos.length; li++) {
        const row     = splitRows[li]!
        const lastIdx = row.segs.length - 1
        if(!row.rendered[lastIdx]) {
            const lastSeg  = row.segs[lastIdx] ?? []
            results [li]  += renderSeg(lastSeg)
        }
    }

    return results
}

// ─── buildLines ───────────────────────────────────────────────────────────────

function buildLines(range: LineRange, indent: string, cfg: ReturnType<typeof makeConfig>): string[] {
    if(isOnlyComments(range)) { return range.infos.map(i => i.line.text) }

    const sgt     = range.infos[0]?.sgfntTokenType
    const langId  = (range.infos[0]?.line as unknown as { languageId?: string })?.languageId ?? 'typescript'
    const langCfg = getLangConfig(langId)

    switch(sgt) {
        case TokenType.Semicolon : return buildSemicolonAlignedLines(range.infos, indent, langCfg)
        case TokenType.Colon     : return buildColonAlignedLines(range.infos, indent, langCfg)
        case TokenType.OpenBrace : case TokenType.OpenParen : stripBracketWhitespace(range.infos); break
    }

    padFirstWord           (range.infos)
    stripOperatorWhitespace(range.infos)

    const sttKey                = String(range.infos[0]!.sgfntTokenType).toLowerCase()
    const surrounds             = cfg('surroundSpace', {}) as Record<string, number | number[]>
    const rawSurround           = surrounds[sttKey] ?? DEFAULT_SURROUND[sttKey]
    const [before_sp, after_sp] = normaliseSurround(rawSurround, sttKey)

    const rawCommentGap = surrounds['comment'] ?? DEFAULT_SURROUND['comment']
    const commentGap    = typeof rawCommentGap === 'number' ? Math.max(0, rawCommentGap) : Math.max(0, (rawCommentGap as number[])[0] ?? 2)

    const opAlign          = cfg('operatorPadding', 'right') as string
    const infos            = range.infos, size = infos.length
    const col: number[]    = new Array(size).fill(0)
    const result: string[] = new Array(size).fill(indent)

    let done = 0
    while(done < size) {
        let maxOpLen = 0, maxCol = 0
        for(let l = 0; l < size; l++) {
            if(col[l] === -1) { continue }
            const info = infos[l]!, toks = info.tokens
            const end  = toks.length > 1 && toks.at(-1)?.type === TokenType.Comment
                ?(toks.at(-2)?.type === TokenType.Whitespace ? toks.length - 2 : toks.length - 1)
                 : toks.length
            let cur = result[l]!, j = col[l]!
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
            const info = infos[l]!, toks = info.tokens, cur = result[l]!
            const pad  = ws(maxCol - cur.length)
            let opText = toks[j]!.text
            if(opText.length < maxOpLen) {
                opText = opAlign === 'right' ? ws(maxOpLen - opText.length) + opText : opText + ws(maxOpLen - opText.length)
            }
            switch(toks[j]!.type) {
                case TokenType.Comma : result[l] = cur + pad + opText + (j < toks.length - 1 ? ' ' : ''); break
                default              : 
                    if(toks.length === 1 && toks[0]!.type === TokenType.Comment) { done++ }
                    else { result[l] = applyOperator(cur, opText, pad, before_sp, after_sp) }
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
            for(let k = 0; k < remaining.length - 1; k++) { result[l] += remaining[k]!.text }
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
    const base                               = vscode.workspace.getConfiguration('betterAlignColumns')
    let lang: Record<string, unknown> | null = null
    try { lang = vscode.workspace.getConfiguration().get<Record<string, unknown>>(`[${doc.languageId}]`) ?? null } catch { }
    return(key, def) => lang?.[`betterAlignColumns.${key}`] ?? base.get(key, def)
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
        let start = sel.start.line, end = sel.end.line
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
            const infos = ranges[i]!.infos, last = infos.at(-1)!.line
            const loc   = new vscode.Range(infos[0]!.line.lineNumber, 0, last.lineNumber, last.text.length)
            const text  = outputs[i]!.join(eol)
            if(doc.getText(loc) !== text) { b.replace(loc, text) }
        }
    })
}

// ─── Extension lifecycle ──────────────────────────────────────────────────────

export function activate(ctx: vscode.ExtensionContext) {
    let alignOnEnter = vscode.workspace.getConfiguration('betterAlignColumns').get<boolean>('alignAfterTypeEnter')
    ctx.subscriptions.push(
        vscode.commands.registerTextEditorCommand('vscode-better-align-columns.align', process),
        vscode.workspace.onDidChangeTextDocument(e => {
            if(alignOnEnter && e.contentChanges.some(c => c.text.includes('\n'))) {
                vscode.commands.executeCommand('vscode-better-align-columns.align')
            }
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if(e.affectsConfiguration('betterAlignColumns')) {
                alignOnEnter = vscode.workspace.getConfiguration('betterAlignColumns').get<boolean>('alignAfterTypeEnter')
            }
        }),
    )
}

export function deactivate() { }
export { ws, tokenizeLine, TokenType, LanguageSyntaxConfig, LineInfo, LineRange }