'use strict'
import * as vscode from 'vscode'

const enum TokenType {
    Invalid       = 'Invalid',
    Word          = 'Word',
    Assignment    = 'Assignment',
    Arrow         = 'Arrow',
    Block         = 'Block',
    PartialBlock  = 'PartialBlock',
    EndOfBlock    = 'EndOfBlock',
    String        = 'String',
    PartialString = 'PartialString',
    Comment       = 'Comment',
    Whitespace    = 'Whitespace',
    Colon         = 'Colon',
    Comma         = 'Comma',
    CommaAsWord   = 'CommaAsWord',
    Insertion     = 'Insertion',
    Spaceship     = 'Spaceship',
    PHPShortEcho  = 'PHPShortEcho',
    From          = 'From',
}

interface Token { type: TokenType; text: string }
interface BlockComment { start: string; end: string }
interface LanguageSyntaxConfig { lineComments: string[]; blockComments: BlockComment[] }

interface TextLine { text: string; lineNumber: number }

interface LineInfo {
    line          : TextLine
    sgfntTokenType: TokenType
    sgfntTokens   : TokenType[]
    tokens: Token[]
}

interface LineRange { anchor: number; infos: LineInfo[] }

const DEFAULT_LANG: Record<string, LanguageSyntaxConfig> = {
    bash      : { lineComments: ['#'], blockComments: [] }, c: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    cpp       : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },  csharp                                       : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    dockerfile: { lineComments: ['#'], blockComments: [] }, go: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    html      : { lineComments: [], blockComments: [{ start: '<!--', end: '-->' }] },  java                                          : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    javascript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },  julia                                        : { lineComments: ['#'], blockComments: [{ start: '#=', end: '=#' }] },
    php       : { lineComments: ['//', '#'], blockComments: [{ start: '/*', end: '*/' }] },  python                                  : { lineComments: ['#'], blockComments: [] },
    ruby       : { lineComments: ['#'], blockComments: [] }, rust: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },
    shellscript: { lineComments: ['#'], blockComments: [] }, sql: { lineComments: ['--'], blockComments: [{ start: '/*', end: '*/' }] },
    typescript : { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] },  yaml                                           : { lineComments: ['#'], blockComments: [] },
}

const FALLBACK: LanguageSyntaxConfig = { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }

const getLangConfig = (lang: string, overrides = {} as Record<string, LanguageSyntaxConfig>) =>
    overrides[lang] ?? DEFAULT_LANG[lang] ?? FALLBACK

const ws = (n: number) => n <= 0 ? '' : ' '.repeat(isFinite(n) && n > 1e6 ? 1e6 : n)

enum State { Default, InString, InBlock, InLineCmt, InBlockCmt }

interface Scan {
    state: State; quote: string; open: string; depth: number; end: string; start: number; last: TokenType; partial: boolean
}

const PAIR: Record<string, string> = { '{': '}', '[': ']', '(': ')' }
const REG_WS = /\s/

const sortDesc = <T extends string | { start: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => (typeof a === 'string' ? a.length : a.start.length) - (typeof b === 'string' ? b.length : b.start.length))

const findLineCmt = (txt: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    for(const m of sortDesc(cfg.lineComments)) {if(txt.startsWith(m, pos) && !(m === '//' && pos > 0 && txt[pos - 1] === ':')) {return m}}
    return null
}

const findBlockCmt = (txt: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    for(const b of sortDesc(cfg.blockComments)) {if(txt.startsWith(b.start, pos)) {return b.end}}
    return null
}

const classifyChar = (txt: string, pos: number, cfg: LanguageSyntaxConfig, leading: number): { t: TokenType; n: number } => {
    const ch = txt[pos] ?? '', nx = txt[pos + 1] ?? '', rd = txt[pos + 2] ?? ''
    const isWs = /\s/.test(ch)
    if(isWs) {return { t: TokenType.Whitespace, n: 1 }}
    const isStr = '"\'`'.includes(ch)
    if(isStr) {return { t: TokenType.String, n: 1 }}
    const isOpen = ch === '{' || ch === '(' || ch === '['
    if(isOpen) {return { t: TokenType.Block, n: 1 }}
    const isClose = ch === '}' || ch === ')' || ch === ']'
    if(isClose) {return { t: TokenType.EndOfBlock, n: 1 }}
    const isLineCmt = findLineCmt(txt, pos, cfg)
    if(isLineCmt) {return { t: TokenType.Comment, n: 1 }}
    const isBlockCmt = findBlockCmt(txt, pos, cfg)
    if(isBlockCmt) {return { t: TokenType.Comment, n: 1 }}
    const isComma = ch === ','
    if(isComma) {return { t: leading === 0 ? TokenType.CommaAsWord : TokenType.Comma, n: 1 }}
    const isSpaceship = ch === '<' && nx === '=' && rd === '>'
    if(isSpaceship) {return { t: TokenType.Spaceship, n: 3 }}
    const isPHPEcho = ch === '<' && nx === '?' && rd === '='
    if(isPHPEcho) {return { t: TokenType.PHPShortEcho, n: 3 }}
    const isArrow = ch === '=' && nx === '>'
    if(isArrow) {return { t: TokenType.Arrow, n: 2 }}
    const asn = new Set(['+', '-', '*', '/', '%', '~', '|', '^', '.', '!', '&', '=', ':'])
    const isAssignOp = asn.has(ch) && nx === '='
    if(isAssignOp) {return { t: TokenType.Assignment, n: rd === '=' ? 3 : 2 }}
    const isAssign = ch === '=' && nx !== '='
    if(isAssign) {return { t: TokenType.Assignment, n: 1 }}
    const isDoubleColon = ch === ':' && nx === ':'
    if(isDoubleColon) {return { t: TokenType.Word, n: 2 }}
    const isColon = ch === ':' && nx !== ':'
    if(isColon) {return { t: TokenType.Colon, n: 1 }}
    return { t: TokenType.Word, n: 1 }
}

const getCommentState = (txt: string, pos: number, cfg: LanguageSyntaxConfig): State | null => {
    const lineCmt = findLineCmt(txt, pos, cfg)
    if(lineCmt) {return State.InLineCmt}
    const blockCmt = findBlockCmt(txt, pos, cfg)
    if(blockCmt) {return State.InBlockCmt}
    return null
}

const getStringState = (ch: string): State | null => {
    if('"\'`'.includes(ch)) {return State.InString}
    return null
}

const getBlockState = (ch: string): State | null => {
    if(ch === '{' || ch === '(' || ch === '[') {return State.InBlock}
    return null
}

const getTokenState = (cls: { t: TokenType; n: number }, txt: string, pos: number, cfg: LanguageSyntaxConfig): State => {
    const strState = getStringState(txt[pos])
    if(strState) {return strState}
    const blkState = getBlockState(txt[pos])
    if(blkState) {return blkState}
    if(cls.t === TokenType.Comment) {
        const cmtState = getCommentState(txt, pos, cfg)
        if(cmtState) {return cmtState}
    }
    return State.Default
}

const step = (txt: string, pos: number, scan: Scan, cfg: LanguageSyntaxConfig, toks: Token[]): { p: number; s: Scan; e?: Token } => {
    const ch = txt[pos] ?? ''
    const isEscaped = (c: string) => txt[pos - 1] === '\\'

    switch(scan.state) {
        case State.InString: {
            const isClosed = ch === scan.quote && !isEscaped(ch)
            if(isClosed) {return { p: pos + 1, s: { ...scan, state: State.Default, partial: false } }}
            return { p: pos + 1, s: scan }
        }

        case State.InBlock: {
            const isOpen = ch === scan.open
            if(isOpen) {return { p: pos + 1, s: { ...scan, depth: scan.depth + 1 } }}
            const closeChar = PAIR[scan.open]
            const isClose = ch === closeChar && !isEscaped(ch)
            if(isClose) {
                if(scan.depth === 1) {return { p: pos + 1, s: { ...scan, state: State.Default, depth: 0, partial: false } }}
                return { p: pos + 1, s: { ...scan, depth: scan.depth - 1 } }
            }
            return { p: pos + 1, s: scan }
        }

        case State.InLineCmt: {
            return { p: txt.length, s: scan }
        }

        case State.InBlockCmt: {
            const ends = txt.startsWith(scan.end, pos)
            if(ends) {return { p: pos + scan.end.length, s: { ...scan, state: State.Default, partial: false } }}
            return { p: pos + 1, s: scan }
        }

        case State.Default: {
            const nonWs = toks.filter(t => t.type !== TokenType.Whitespace).length
            const cls = classifyChar(txt, pos, cfg, nonWs)
            const isNewToken = cls.t !== scan.last && scan.start !== -1

            if(isNewToken) {
                const emit: Token = { type: scan.last, text: txt.substring(scan.start, pos) }
                const ns = getTokenState(cls, txt, pos, cfg)
                const q = ns === State.InString ? txt[pos] : ''
                const o = ns === State.InBlock ? txt[pos] : ''
                const e = ns === State.InBlockCmt ? findBlockCmt(txt, pos, cfg) ?? '' : ''
                const pt = ns !== State.Default
                return { p: pos + cls.n, e: emit, s: { ...scan, state: ns, last: cls.t, start: pos, quote: q, open: o, end: e, partial: pt } }
            }

            const isFirstToken = scan.start === -1
            if(isFirstToken) {
                const ns = getTokenState(cls, txt, pos, cfg)
                const q = ns === State.InString ? txt[pos] : ''
                const o = ns === State.InBlock ? txt[pos] : ''
                const e = ns === State.InBlockCmt ? findBlockCmt(txt, pos, cfg) ?? '' : ''
                return { p: pos + cls.n, s: { ...scan, state: ns, last: cls.t, start: pos, quote: q, open: o, end: e } }
            }

            return { p: pos + cls.n, s: scan }
        }
    }
}

const JS_LIKE = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact'])
const SIG = new Set([TokenType.Assignment, TokenType.Colon, TokenType.Arrow, TokenType.Comment])

const tokenizeLine = (ln: { text: string }, cfg: LanguageSyntaxConfig, lang: string) => {
    const txt = ln.text, toks: Token[] = []
    let pos = 0, scan: Scan = { state: State.Default, quote: '', open: '', depth: 0, end: '', start: -1, last: TokenType.Invalid, partial: false }
    while(pos < txt.length) {
        const r = step(txt, pos, scan, cfg, toks)
        if(r.e) {
            const e = r.e.type === TokenType.Comma && toks.filter(t => t.type !== TokenType.Whitespace).length === 0
                ? { ...r.e, type: TokenType.CommaAsWord } : r.e
            toks.push(e)
        }
        pos = r.p; scan = r.s
    }
    if(scan.start !== -1) {
        let ft = scan.last
        if(scan.state === State.InString) {ft = TokenType.PartialString}
        else if(scan.state === State.InBlock) {ft = TokenType.PartialBlock}
        else if(scan.state === State.InBlockCmt) {ft = TokenType.Comment}
        toks.push({ type: ft, text: txt.substring(scan.start) })
    }
    if(JS_LIKE.has(lang)) {for(const t of toks) {if(t.type === TokenType.Word && t.text === 'from') {t.type = TokenType.From}}}
    const sgfntTokens: TokenType[] = []
    for(const t of toks) {if(SIG.has(t.type) && !sgfntTokens.includes(t.type)) {sgfntTokens.push(t.type)}}
    if(JS_LIKE.has(lang) && toks.some(t => t.type === TokenType.From) && !sgfntTokens.includes(TokenType.From)) {sgfntTokens.push(TokenType.From)}
    return { tokens: toks, sgfntTokens }
}

const hasPartial = (info: LineInfo): boolean =>
    info.tokens.some(t => t.type === TokenType.PartialBlock || t.type === TokenType.PartialString)

const sameIndent = (i1: LineInfo, i2: LineInfo): boolean => {
    const t1 = i1.tokens[0], t2 = i2.tokens[0]
    return t1?.type === TokenType.Whitespace ? t1.text === t2?.text : t2?.type !== TokenType.Whitespace
}

const intersect = (a: TokenType[], b: TokenType[]): TokenType[] => {
    const m: Record<string, boolean> = {}
    a.forEach(t => m[t as string] = true)
    return b.filter(t => m[t as string])
}

const collectRange = (
doc : vscode.TextDocument,  start: number,  end                         : number,  anchor : number,
lang: string,  overrides         : Record<string,  LanguageSyntaxConfig>,  indentImportant: boolean
)   : LineRange => {
    const tokenize = (ln: number): LineInfo => {
        const tl = doc.lineAt(ln)
        const { tokens, sgfntTokens } = tokenizeLine(tl, getLangConfig(lang, overrides), lang)
        return { line: tl, sgfntTokenType: TokenType.Invalid, sgfntTokens, tokens }
    }
    const anchorInfo = tokenize(anchor)
    const range: LineRange = { anchor, infos: [anchorInfo] }
    let types = anchorInfo.sgfntTokens

    if(!types.length || hasPartial(anchorInfo)) {return range}

    for(let i = anchor - 1; i >= start; --i) {
        const info = tokenize(i)
        if(hasPartial(info)) {break}
        const tt = intersect(types, info.sgfntTokens)
        if(!tt.length) {break}
        types = tt
        if(indentImportant && !sameIndent(anchorInfo, info)) {break}
        range.infos.unshift(info)
    }
    for(let i = anchor + 1; i <= end; ++i) {
        const info = tokenize(i)
        const tt = intersect(types, info.sgfntTokens)
        if(!tt.length) {break}
        types = tt
        if(indentImportant && !sameIndent(anchorInfo, info)) {break}
        if(hasPartial(info)) { range.infos.push(info); break }
        range.infos.push(info)
    }

    const sgt = types.includes(TokenType.Assignment) ? TokenType.Assignment : types[0]
    range.infos.forEach(i => i.sgfntTokenType = sgt!)
    return range
}

const onlyComments = (r: LineRange): boolean =>
    r.infos.every(i => i.tokens.filter(t => t.type !== TokenType.Whitespace).length === 1 && i.tokens[0]?.type === TokenType.Comment)

const calcIndent = (infos: LineInfo[]): string => {
    let min = Infinity,  wsType = ' '
    for(const i of infos) {
        min = Math.min(min, i.line.text.search(/\S/))
        if(i.tokens[0]?.type === TokenType.Whitespace) { wsType = i.tokens[0].text[0] ?? ' '; i.tokens.shift() }
        if(i.tokens.length > 1 && i.tokens[i.tokens.length - 1]?.type === TokenType.Whitespace) {i.tokens.pop()}
    }
    return wsType.repeat(min)
}

const calcFirstWord = (infos: LineInfo[]): number => {
    let max = 0
    for(const i of infos) {
        let cnt = 0
        for(const t of i.tokens) {
            if(t.type === i.sgfntTokenType) { cnt = -cnt; break }
            if(t.type !== TokenType.Block && t.type !== TokenType.Whitespace) {++cnt}
        }
        if(cnt < -1) {max = Math.max(max, i.tokens[0]?.text.length ?? 0)}
    }
    return max
}

const injectFirstWord = (infos: LineInfo[], len: number): void => {
    if(!len) {return}
    const wordSp = { type: TokenType.Insertion, text: ws(len + 1) }, oneSp = { type: TokenType.Insertion, text: ' ' }
    for(const i of infos) {
        let cnt = 0
        for(const t of i.tokens) {
            if(t.type === i.sgfntTokenType) { cnt = -cnt; break }
            if(t.type !== TokenType.Whitespace) {++cnt}
        }

        const isFirstWord = cnt === -1
        if(isFirstWord) {i.tokens.unshift(wordSp); continue}

        const isSecondWord = cnt < -1
        if(!isSecondWord) {continue}

        const needsSpace = i.tokens[1]?.type === TokenType.Whitespace
        if(needsSpace) {i.tokens[1] = oneSp; continue}

        const isCommaWord = i.tokens[0]?.type === TokenType.CommaAsWord
        if(isCommaWord) {i.tokens.splice(1, 0, oneSp); continue}

        if(i.tokens[0]?.text.length !== len) {
            const w = { type: TokenType.Insertion, text: ws(len - i.tokens[0].text.length) }
            i.tokens.splice(1, 0, w)
        }
    }
}

const rmPadWs = (infos: LineInfo[]): void => {
    for(const i of infos) {
        let j = 1
        while(j < i.tokens.length) {
            if(i.tokens[j]?.type === i.sgfntTokenType) {
                if(i.tokens[j - 1]?.type === TokenType.Whitespace) { i.tokens.splice(j - 1, 1); --j }
                if(i.tokens[j + 1]?.type === TokenType.Whitespace) {i.tokens.splice(j + 1, 1)}
            }
            ++j
        }
    }
}

const DEFAULT_STT: Record<string, number | number[]> = { colon: [0, 1], assignment: [1, 1], comment: 2, arrow: [1, 1], from: [1, 1] }

const formatComma = (cur: string, op: string, hasMore: boolean): string => cur + op + (hasMore ? ' ' : '')
const formatComment = (exceed: number): number => exceed + 1

const formatOperatorNegative = (cur: string, op: string, pad: string, stt: number[]): string => {
    if(stt[1] < 0) {
        let z = cur.length - 1
        while(z >= 0 && !REG_WS.test(cur[z] ?? '')) {--z}
        return cur.substring(0, z + 1) + pad + cur.substring(z + 1) + op
    }
    return cur + op + pad
}

const formatOperatorStandard = (cur: string, op: string, pad: string, stt: number[]): string => {
    let res = cur + pad + ws(stt[0]) + op
    if(stt[1] > 0) {res += ws(stt[1])}
    return res
}

const formatOperator = (cur: string, op: string, stt: number[], pad: string, isLast: boolean): string => {
    if(stt[0] < 0) {return formatOperatorNegative(cur, op, pad, stt)}
    return formatOperatorStandard(cur, op, pad, stt)
}

const buildLines = (range: LineRange, indent: string, firstWord: number, cfg: (k: string, v?: unknown) => unknown): string[] => {
    if(onlyComments(range)) {return range.infos.map(i => i.line.text)}

    const sttKey = String(range.infos[0].sgfntTokenType).toLowerCase()
    const stt = ((cfg('surroundSpace', {}) as Record<string, number[]>)?.[sttKey]) ?? DEFAULT_STT[sttKey]
    const commentCfg = ((cfg('surroundSpace', {}) as Record<string, number>)?.comment) ?? DEFAULT_STT.comment
    const opPad = cfg('operatorPadding', 'right') as string

    const infos = range.infos, size = infos.length
    injectFirstWord(infos, firstWord)
    rmPadWs(infos)

    const col: number[] = new Array(size).fill(0), res: string[] = new Array(size).fill(indent)
    let exceed = 0, maxOp = 0, maxCol = 0

    while(exceed < size) {
        let opSize = 0
        for(let l = 0; l < size; ++l) {
            const c = col[l], info = infos[l], tkCnt = info.tokens.length
            if(c === -1) {continue}
            let j = c, end = tkCnt, cur = res[l]
            if(tkCnt > 1 && info.tokens[tkCnt - 1]?.type === TokenType.Comment) {
                end = tkCnt > 2 && info.tokens[tkCnt - 2]?.type === TokenType.Whitespace ? tkCnt - 2 : tkCnt - 1
            }
            for(; j < end; ++j) {
                const t = info.tokens[j]
                if(t.type === info.sgfntTokenType || (t.type === TokenType.Comma && j !== 0)) {
                    opSize = Math.max(opSize, t.text.length)
                    maxCol = Math.max(maxCol, cur.length)
                    break
                }
                cur += t.text
            }
            res[l] = cur
            if(j === end) { ++exceed; col[l] = -1; info.tokens.splice(0, end) }
            else {col[l] = j}
        }

        for(let l = 0; l < size; ++l) {
            const i = col[l]
            if(i === -1) {continue}
            const info = infos[l], cur = res[l]
            let op = info.tokens[i]?.text ?? ''
            if(op.length < opSize) {op = opPad === 'right' ? ws(opSize - op.length) + op : op + ws(opSize - op.length)}
            const pad = maxCol > cur.length ? ws(maxCol - cur.length) : ''

            if(info.tokens[i]?.type === TokenType.Comma) {
                res[l] = formatComma(cur, op, i < info.tokens.length - 1)
                col[l] = i + 1
                continue
            }

            if(info.tokens.length === 1 && info.tokens[0]?.type === TokenType.Comment) {
                ++exceed
                continue
            }

            res[l] = formatOperator(cur, op, stt, pad, i < info.tokens.length - 1)
            col[l] = i + 1
        }
    }

    if(commentCfg < 0) {
        for(let l = 0; l < size; ++l) {for(const t of infos[l].tokens) {res[l] += t.text}}
    } else {
        let mx = 0
        for(const r of res) {mx = Math.max(mx, r.length)}
        for(let l = 0; l < size; ++l) {if(infos[l].tokens.length)
            {res[l] += ws(mx - res[l].length + commentCfg) + infos[l].tokens.pop()?.text}}
    }
    return res
}

const getConfig = (doc: vscode.TextDocument) => {
    const def = vscode.workspace.getConfiguration('betterAlign')
    let lng: Record<string,  unknown> | null = null
    try { lng = vscode.workspace.getConfiguration().get(`[${doc.languageId}]`) as Record<string, unknown> ?? null } catch { }
    return (k: string, v?: unknown) => lng ? (lng as Record<string, unknown>)[`betterAlign.${k}`] ?? def.get(k, v) : def.get(k, v)
}

const getOverrides = (cfg: (k: string, v?: unknown) => unknown) => cfg('languageConfigs', {}) as Record<string, LanguageSyntaxConfig>

const process = (ed: vscode.TextEditor): void => {
    const doc = ed.document
    const cfg = getConfig(doc)
    const overrides = getOverrides(cfg)
    const ranges: LineRange[] = []

    ed.selections.forEach(sel => {
        const indentImportant = cfg('indentBase', 'firstline') === 'dontchange'
        if(sel.isSingleLine) {
            ranges.push(collectRange(doc, 0, doc.lineCount - 1, sel.active.line, doc.languageId, overrides, indentImportant))
        } else {
            let start = sel.start.line,  end = sel.end.line
            while(true) {
                const res = collectRange(doc, start, end, start, doc.languageId, overrides, indentImportant)
                const last = res.infos[res.infos.length - 1]
                if(last.line.lineNumber > end) {break}
                if(res.infos[0]?.sgfntTokenType !== TokenType.Invalid) {ranges.push(res)}
                if(last.line.lineNumber === end) {break}
                start = last.line.lineNumber + 1
            }
        }
    })

    const outputs = ranges.map(r => {
        const indent = onlyComments(r) ? '' : calcIndent(r.infos)
        const firstWord = onlyComments(r) ? 0 : calcFirstWord(r.infos)
        return buildLines(r, indent, firstWord, cfg)
    })

    ed.edit(b => {
        for(let i = 0; i < ranges.length; ++i) {
            const infos = ranges[i].infos, last = infos[infos.length - 1].line
            const loc = new vscode.Range(infos[0].line.lineNumber, 0, last.lineNumber, last.text.length)
            const eol      = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
            const replaced = outputs[i].join(eol)
            if(doc.getText(loc) !== replaced) {b.replace(loc, replaced)}
        }
    })
}

export function activate(ctx: vscode.ExtensionContext) {
    let alignAfterEnter = vscode.workspace.getConfiguration('betterAlign').get<boolean>('alignAfterTypeEnter')
    ctx.subscriptions.push(
        vscode.commands.registerTextEditorCommand('vscode-better-align.align', process),
        vscode.workspace.onDidChangeTextDocument(e => {
            if(alignAfterEnter && e.contentChanges.some(c => c.text.includes('\n')))
                {vscode.commands.executeCommand('vscode-better-align.align')}
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if(e.affectsConfiguration('betterAlign'))
                {alignAfterEnter = vscode.workspace.getConfiguration('betterAlign').get<boolean>('alignAfterTypeEnter')}
        })
    )
}

export function deactivate() { }

export { ws, tokenizeLine, TokenType, LanguageSyntaxConfig, LineInfo, LineRange }