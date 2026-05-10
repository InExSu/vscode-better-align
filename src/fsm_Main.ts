// ============================================================
// fsm_Main.ts - Pure Logic FSM Module
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================

// ── 1. SHARED TYPES (no VS Code dependencies) ────────────────
export type LanguageRules = {
    lineComments    : string[]
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars      : string[]
}

export type LineBlock = { startLine: number; lines: string[] }

export type ParsedLine = { raw: string; tokens: Token[]; markers: Marker[]; originalMarkers?: Marker[] }

export type Token =
    | { kind: 'code'; text   : string }
    | { kind: 'string'; text : string }
    | { kind: 'comment'; text: string }

export type Marker = { symbol: string; startCol: number }

// ── 2. RESULT TYPE ─────────────────────────────────────────────
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
export const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })
export const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ── 3. CONFIG ──────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
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
    testData: {} as Record<string, unknown>,
}

// ── 4. LANGUAGE RULES ──────────────────────────────────────────
export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments: ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars: DEFAULT_CONFIG.defaultAlignChars,
}

export const LANGUAGE_RULES: Record<string, LanguageRules> = {
    typescript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: DEFAULT_CONFIG.defaultAlignChars },
    javascript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: DEFAULT_CONFIG.defaultAlignChars },
    python: { lineComments: ['#'], blockComments: [], stringDelimiters: ['"', "'"], alignChars: DEFAULT_CONFIG.defaultAlignChars },
    rust: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"'], alignChars: DEFAULT_CONFIG.defaultAlignChars },
    go: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', '`'], alignChars: DEFAULT_CONFIG.defaultAlignChars },
    lua: { lineComments: ['--'], blockComments: [{ start: '--[[', end: ']]' }], stringDelimiters: ['"', "'"], alignChars: DEFAULT_CONFIG.defaultAlignChars },
    sql: { lineComments: ['--'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'"], alignChars: DEFAULT_CONFIG.defaultAlignChars },
}

export function detectLanguageRules(langId: string, defaultAlignChars: string[]): LanguageRules {
    return LANGUAGE_RULES[langId]
        ? { ...LANGUAGE_RULES[langId], alignChars: defaultAlignChars }
        : { ...DEFAULT_LANGUAGE_RULES, alignChars: defaultAlignChars }
}

// ── 5. A2 — SCANNER FSM (PascalCase states) ───────────────────
export enum ScannerState {
    CodeReading = 'CodeReading',
    StringDouble = 'StringDouble',
    StringSingle = 'StringSingle',
    TemplateBacktick = 'TemplateBacktick',
    BlockComment = 'BlockComment',
    CommentDone = 'CommentDone',
}

export function parseLineIgnoringStrings(raw: string, rules: LanguageRules): ParsedLine {
    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const tokens: Token[] = []
    const markers: Marker[] = []
    let state = ScannerState.CodeReading
    let i = 0, codeStart = 0, blockEndMarker = '', nestingDepth = 0

    const pushCode = (end: number): void => {
        if(end > codeStart) { tokens.push({ kind: 'code', text: raw.slice(codeStart, end) }) }
    }

    mainLoop: while(i <= raw.length) {
        switch(state) {
            case ScannerState.CodeReading: {
                if(i >= raw.length) { pushCode(i); break mainLoop }
                for(const bc of rules.blockComments) {
                    if(raw.startsWith(bc.start, i)) {
                        pushCode(i); codeStart = i; blockEndMarker = bc.end
                        state = ScannerState.BlockComment; i += bc.start.length; continue mainLoop
                    }
                }
                for(const lc of rules.lineComments) {
                    if(raw.startsWith(lc, i)) {
                        pushCode(i); tokens.push({ kind: 'comment', text: raw.slice(i) })
                        state = ScannerState.CommentDone; break mainLoop
                    }
                }
                const ch = raw[i]
                if(ch === '"' && rules.stringDelimiters.includes('"')) { pushCode(i); codeStart = i; state = ScannerState.StringDouble; i++; continue mainLoop }
                if(ch === "'" && rules.stringDelimiters.includes("'")) { pushCode(i); codeStart = i; state = ScannerState.StringSingle; i++; continue mainLoop }
                if(ch === '`' && rules.stringDelimiters.includes('`')) { pushCode(i); codeStart = i; state = ScannerState.TemplateBacktick; i++; continue mainLoop }
                if(ch === '(' || ch === '[' || ch === '{') { nestingDepth++; i++; continue mainLoop }
                if(ch === ')' || ch === ']' || ch === '}') { nestingDepth = Math.max(0, nestingDepth - 1); i++; continue mainLoop }
                if(nestingDepth <= 1) {
                    for(const ac of alignChars) {
                        if(raw.startsWith(ac, i)) {
                            if(!(ac === ':' && i > 0 && raw[i - 1] === ')')) { markers.push({ symbol: ac, startCol: i }) }
                            i += ac.length; continue mainLoop
                        }
                    }
                }
                i++; break
            }
            case ScannerState.StringDouble:
            case ScannerState.StringSingle:
            case ScannerState.TemplateBacktick: {
                const delim = state === ScannerState.StringDouble ? '"' : state === ScannerState.StringSingle ? "'" : '`'
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break mainLoop }
                if(raw[i] === '\\') { i += 2; continue mainLoop }
                if(raw[i] === delim) {
                    i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i
                    state = ScannerState.CodeReading; continue mainLoop
                }
                i++; break
            }
            case ScannerState.BlockComment: {
                if(i >= raw.length) { tokens.push({ kind: 'comment', text: raw.slice(codeStart) }); break mainLoop }
                if(raw.startsWith(blockEndMarker, i)) {
                    i += blockEndMarker.length; tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) }); codeStart = i
                    state = ScannerState.CodeReading; continue mainLoop
                }
                i++; break
            }
            default:
                break mainLoop
        }
    }
    return { raw, tokens, markers, originalMarkers: [...markers] }
}

// ── 6. A3 — BLOCK GROUPING FSM (PascalCase states) ──────────────
export enum GroupingState {
    WaitingForStart = 'WaitingForStart',
    Accumulating = 'Accumulating',
}

export function findLineBlocks(rawLines: string[], startOffset: number, rules: LanguageRules, maxBlockSize: number): LineBlock[] {
    const blocks: LineBlock[] = []
    let state = GroupingState.WaitingForStart
    let curBlock: LineBlock = { startLine: 0, lines: [] }, curIndent = ''

    const flush = (): void => {
        if(curBlock.lines.length > 1) { blocks.push(curBlock) }
        curBlock = { startLine: 0, lines: [] }
        curIndent = ''
    }
    const isBlankOrComment = (r: string): boolean => {
        const t = r.trim(); return t === '' || rules.lineComments.some(lc => t.startsWith(lc))
    }
    const getIndent = (r: string): string => r.match(/^(\s*)/)?.[1] ?? ''

    outer: for(let idx = 0; idx < rawLines.length; idx++) {
        const raw = rawLines[idx]
        const indent = getIndent(raw)
        switch(state) {
            case GroupingState.WaitingForStart:
                if(isBlankOrComment(raw)) { continue }
                curIndent = indent; curBlock = { startLine: startOffset + idx, lines: [raw] }
                state = GroupingState.Accumulating; break
            case GroupingState.Accumulating:
                if(isBlankOrComment(raw)) { flush(); continue }
                if(indent !== curIndent || curBlock.lines.length >= maxBlockSize) {
                    flush()
                    curIndent = indent
                    curBlock = { startLine: startOffset + idx, lines: [raw] }
                    state = GroupingState.Accumulating
                } else {
                    curBlock.lines.push(raw)
                }
                break
        }
    }
    flush(); return blocks
}

// ── 7. A4 — PROPAGATION FSM (PascalCase states) ───────────────
export enum PropagationState {
    FindingSeries = 'FindingSeries',
    Accumulating = 'Accumulating',
}

export function propagatePositions(parsedLines: ParsedLine[], posMap: Map<string, number>, mk: number): void {
    let state = PropagationState.FindingSeries, startOfSeries = 0, endOfSeries = 0
    const applyMax = (): void => {
        let max = 0
        for(let i = startOfSeries; i <= endOfSeries; i++) { max = Math.max(max, posMap.get(`${i}:${mk}`) ?? 0) }
        if(max > 0) { for(let i = startOfSeries; i <= endOfSeries; i++) { const k = `${i}:${mk}`; if(posMap.has(k)) { posMap.set(k, max) } } }
    }
    for(let i = 0; i < parsedLines.length; i++) {
        switch(state) {
            case PropagationState.FindingSeries:
                if(parsedLines[i].markers[mk] !== undefined) { startOfSeries = endOfSeries = i; state = PropagationState.Accumulating }
                break
            case PropagationState.Accumulating: {
                const cur = parsedLines[i].markers[mk]?.symbol, last = parsedLines[endOfSeries].markers[mk]?.symbol
                if(cur !== undefined && cur === last) { endOfSeries = i }
                else { applyMax(); state = PropagationState.FindingSeries; if(parsedLines[i].markers[mk] !== undefined) { startOfSeries = endOfSeries = i; state = PropagationState.Accumulating } }
                break
            }
        }
    }
    if(state === PropagationState.Accumulating) { applyMax() }
}

export function buildPairwisePositionMap(parsedLines: ParsedLine[], maxSpaces: number): Map<string, number> {
    const posMap = new Map<string, number>()
    if(parsedLines.length < 2) { return posMap }
    
    const hasOriginal = parsedLines.some(pl => pl.originalMarkers !== undefined)
    
    const symbolToMarkers = new Map<string, { lineIdx: number; mk: number; startCol: number }[]>()
    
    for(let lineIdx = 0; lineIdx < parsedLines.length; lineIdx++) {
        const pl = parsedLines[lineIdx]
        const markers = hasOriginal ? (pl.originalMarkers || pl.markers) : pl.markers
        
        for(let mk = 0; mk < markers.length; mk++) {
            const m = markers[mk]
            const key = m.symbol
            if(!symbolToMarkers.has(key)) {
                symbolToMarkers.set(key, [])
            }
            symbolToMarkers.get(key)!.push({ lineIdx, mk, startCol: m.startCol })
        }
    }
    
    for(const symbol of Array.from(symbolToMarkers.keys())) {
        const markers = symbolToMarkers.get(symbol)!
        if(markers.length < 2) { continue }
        
        const maxCol = Math.max(...markers.map(m => m.startCol))
        
        for(const { lineIdx, mk, startCol } of markers) {
            if(startCol >= maxCol) { continue }
            const target = Math.min(maxCol, startCol + maxSpaces)
            if(target > startCol) {
                posMap.set(`${lineIdx}:${mk}`, target)
            }
        }
    }
    
    for(const symbol of Array.from(symbolToMarkers.keys())) {
        const markers = symbolToMarkers.get(symbol)!
        const mks = Array.from(new Set(markers.map(m => m.mk)))
        for(const mk of mks) {
            const markersWithSameMk = markers.filter(m => m.mk === mk)
            if(markersWithSameMk.length < 2) { continue }
            propagatePositions(parsedLines, posMap, mk)
        }
    }
    
return posMap
}

export function applyPositionMap(parsedLines: ParsedLine[], posMap: Map<string, number>): string[] {
    return parsedLines.map((pl, lineIdx) => {
        let out = '', srcPos = 0
        for(let mk = 0; mk < pl.markers.length; mk++) {
            const marker = pl.markers[mk]
            out += pl.raw.slice(srcPos, marker.startCol)
            srcPos = marker.startCol
            const key = `${lineIdx}:${mk}`
            const target = posMap.get(key)
            if(target !== undefined) {
                if(target > out.length) {
                    out += ' '.repeat(target - out.length)
                } else if(target < out.length) {
                    out = out.slice(0, target)
                }
            }
            out += marker.symbol
            srcPos = marker.startCol + marker.symbol.length
        }
        out += pl.raw.slice(srcPos)
        return out
    })
}

export function alignBlock(parsedLines: ParsedLine[], maxSpaces: number): string[] {
    if(parsedLines.length < 2) { return parsedLines.map(pl => pl.raw) }
    return buildAndApply(parsedLines, maxSpaces)
}

function buildAndApply(parsedLines: ParsedLine[], maxSpaces: number): string[] {
    const posMap = buildPairwisePositionMap(parsedLines, maxSpaces)
    if(posMap.size === 0) { return parsedLines.map(pl => pl.raw) }
    return applyPositionMap(parsedLines, posMap)
}

// ── 9. PIPELINE FSM ───────────────────────────────────────────
export enum PipelineState {
    Idle = 'Idle',
    LoadConfig = 'LoadConfig',
    DetectLanguage = 'DetectLanguage',
    FindBlocks = 'FindBlocks',
    ParseLines = 'ParseLines',
    Align = 'Align',
    ReplaceText = 'ReplaceText',
    Done = 'Done',
    Error = 'Error',
}

export type Decorator = (ns: NS) => void
export type NS = {
    result: Result<unknown>
    s_Error: string
    config: typeof DEFAULT_CONFIG
    data: NSData
    [k: string]: unknown
}

export type NSData = {
    editor: unknown // VS Code specific, set by extension
    languageRules: LanguageRules | false
    blocks: LineBlock[]
    parsedLines: ParsedLine[][]
    alignedLines: string[][]
}

export function ns_Error(ns: NS): boolean { return ns.result.ok === false }
export function ns_SetError(ns: NS, e: string): void { ns.result = err(e); ns.s_Error = e }

export function buildPipelineFSM(
    config_Load_Decor: Decorator,
    language_Detect_Decor: Decorator,
    block_Find_Decor: Decorator,
    lines_Parse_Decor: Decorator,
    alignment_Apply_Decor: Decorator,
    text_Replace_Decor: Decorator,
    rwd: (fn: Decorator, ns: NS) => void
): (ns: NS) => void {
    return function pipelineFSM(ns: NS): void {
        let state = PipelineState.Idle

        mainLoop: while(true) {
            switch(state) {
                case PipelineState.Idle:
                    state = PipelineState.LoadConfig; break
                case PipelineState.LoadConfig:
                    rwd(config_Load_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.DetectLanguage; break
                case PipelineState.DetectLanguage:
                    rwd(language_Detect_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.FindBlocks; break
                case PipelineState.FindBlocks:
                    rwd(block_Find_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.ParseLines; break
                case PipelineState.ParseLines:
                    rwd(lines_Parse_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.Align; break
                case PipelineState.Align:
                    rwd(alignment_Apply_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.ReplaceText; break
                case PipelineState.ReplaceText:
                    rwd(text_Replace_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.Done; break
                case PipelineState.Done:
                case PipelineState.Error:
                    break mainLoop
            }
        }
    }
}
