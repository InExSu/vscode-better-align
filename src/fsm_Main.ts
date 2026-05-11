// ============================================================
// fsm_Main.ts - Pure Logic FSM Module
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================

// ── 1. SHARED TYPES (no VS Code dependencies) ────────────────
export type LanguageRules = {
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
}

export type LineBlock = { startLine: number; lines: string[] }

export type ParsedLine = { raw: string; tokens: Token[]; markers: Marker[]; originalMarkers?: Marker[] }

export type Token =
    | { kind: 'code'; text: string }
    | { kind: 'string'; text: string }
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

/**
 * Detects language rules based on language ID.
 * @param langId - Language identifier (e.g., 'typescript', 'python')
 * @param defaultAlignChars - Default alignment characters to use
 * @returns Language rules for the detected language
 */
export function languageRules_Detect(s_LangId: string, a_DefaultAlignChars: string[]): LanguageRules {
    return LANGUAGE_RULES[s_LangId]
        ? { ...LANGUAGE_RULES[s_LangId], alignChars: a_DefaultAlignChars }
        : { ...DEFAULT_LANGUAGE_RULES, alignChars: a_DefaultAlignChars }
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

function fn_HandleStringDelim(raw: string, rules: LanguageRules, i_Idx: number, a_Tokens: Token[], fn_PushCode: (i_End: number) => void): { s_State: ScannerState; i_CodeStart: number } {
    const ch = raw[i_Idx]
    if(ch === '"' && rules.stringDelimiters.includes('"')) { fn_PushCode(i_Idx); return { s_State: ScannerState.StringDouble, i_CodeStart: i_Idx } }
    if(ch === "'" && rules.stringDelimiters.includes("'")) { fn_PushCode(i_Idx); return { s_State: ScannerState.StringSingle, i_CodeStart: i_Idx } }
    if(ch === '`' && rules.stringDelimiters.includes('`')) { fn_PushCode(i_Idx); return { s_State: ScannerState.TemplateBacktick, i_CodeStart: i_Idx } }
    return { s_State: ScannerState.CodeReading, i_CodeStart: 0 }
}

function fn_UpdateNestingDepth(ch: string | undefined, i_NestingDepth: number): number {
    if(!ch) { return i_NestingDepth }
    if(ch === '(' || ch === '[' || ch === '{') { return i_NestingDepth + 1 }
    if(ch === ')' || ch === ']' || ch === '}') { return Math.max(0, i_NestingDepth - 1) }
    if(ch === '<') { return i_NestingDepth + 1 }
    if(ch === '>') { return Math.max(0, i_NestingDepth - 1) }
    return i_NestingDepth
}

function fn_CheckBlockComment(raw: string, rules: LanguageRules, i_Idx: number, fn_PushCode: (i_End: number) => void): { b_Found: boolean; s_EndMarker: string; i_Advance: number } {
    for(const o_Bc of rules.blockComments) {
        if(raw.startsWith(o_Bc.start, i_Idx)) {
            fn_PushCode(i_Idx)
            return { b_Found: true, s_EndMarker: o_Bc.end, i_Advance: o_Bc.start.length }
        }
    }
    return { b_Found: false, s_EndMarker: '', i_Advance: 0 }
}

function fn_CheckLineComment(raw: string, rules: LanguageRules, i_Idx: number, a_Tokens: Token[], fn_PushCode: (i_End: number) => void): { b_Found: boolean } {
    for(const s_Lc of rules.lineComments) {
        if(raw.startsWith(s_Lc, i_Idx)) {
            fn_PushCode(i_Idx); a_Tokens.push({ kind: 'comment', text: raw.slice(i_Idx) })
            return { b_Found: true }
        }
    }
    return { b_Found: false }
}

function fn_FindAlignMarker(raw: string, a_AlignChars: string[], i_Idx: number, a_Markers: Marker[]): { b_Found: boolean; i_Advance: number } {
    for(const s_Ac of a_AlignChars) {
        if(raw.startsWith(s_Ac, i_Idx)) {
            if(s_Ac === '=' && i_Idx > 0 && (raw[i_Idx - 1] === '>' || (raw[i_Idx - 1] === ' ' && raw[i_Idx - 2] === '>'))) { return { b_Found: false, i_Advance: 1 } }
            if(!(s_Ac === ':' && i_Idx > 0 && raw[i_Idx - 1] === ')')) { a_Markers.push({ symbol: s_Ac, startCol: i_Idx }) }
            return { b_Found: true, i_Advance: s_Ac.length }
        }
    }
    return { b_Found: false, i_Advance: 0 }
}

/**
 * Parses a single line, ignoring strings and comments to find alignment markers.
 * @param raw - Raw line of code
 * @param rules - Language rules for parsing
 * @returns Parsed line with tokens and markers
 */
export function line_Parse(raw: string, rules: LanguageRules): ParsedLine {
    const a_AlignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const a_Tokens: Token[] = []
    const a_Markers: Marker[] = []
    let s_State = ScannerState.CodeReading
    let i_Idx = 0, i_CodeStart = 0, s_BlockEndMarker = '', i_NestingDepth = 0

    const fn_PushCode = (i_End: number): void => {
        if(i_End > i_CodeStart) { a_Tokens.push({ kind: 'code', text: raw.slice(i_CodeStart, i_End) }) }
    }

    mainLoop: while(i_Idx <= raw.length) {
        switch(s_State) {
            case ScannerState.CodeReading: {
                if(i_Idx >= raw.length) { fn_PushCode(i_Idx); break mainLoop }

                const o_BcResult = fn_CheckBlockComment(raw, rules, i_Idx, fn_PushCode)
                if(o_BcResult.b_Found) { i_CodeStart = i_Idx; s_BlockEndMarker = o_BcResult.s_EndMarker; s_State = ScannerState.BlockComment; i_Idx += o_BcResult.i_Advance; continue mainLoop }

                const o_LcResult = fn_CheckLineComment(raw, rules, i_Idx, a_Tokens, fn_PushCode)
                if(o_LcResult.b_Found) { s_State = ScannerState.CommentDone; break mainLoop }

                const o_StringResult = fn_HandleStringDelim(raw, rules, i_Idx, a_Tokens, fn_PushCode)
                if(o_StringResult.s_State !== ScannerState.CodeReading) { i_CodeStart = o_StringResult.i_CodeStart; s_State = o_StringResult.s_State; i_Idx++; continue mainLoop }

                i_NestingDepth = fn_UpdateNestingDepth(raw[i_Idx], i_NestingDepth)
                if(i_NestingDepth === 0) {
                    const o_MarkerResult = fn_FindAlignMarker(raw, a_AlignChars, i_Idx, a_Markers)
                    if(o_MarkerResult.b_Found) { i_Idx += o_MarkerResult.i_Advance; continue mainLoop }
                }
                i_Idx++; break
            }
            case ScannerState.StringDouble:
                case ScannerState.StringSingle:
                case ScannerState.TemplateBacktick: {
                    const s_Delim = s_State === ScannerState.StringDouble ? '"' : s_State === ScannerState.StringSingle ? "'" : '`'
                    if(i_Idx >= raw.length) { a_Tokens.push({ kind: 'string', text: raw.slice(i_CodeStart) }); break mainLoop }
                    if(raw[i_Idx] === '\\') { i_Idx += 2; continue mainLoop }
                    if(raw[i_Idx] === s_Delim) {
                        i_Idx++; a_Tokens.push({ kind: 'string', text: raw.slice(i_CodeStart, i_Idx) }); i_CodeStart = i_Idx
                        s_State = ScannerState.CodeReading; continue mainLoop
                    }
                    i_Idx++; break
                }
            case ScannerState.BlockComment: {
                if(i_Idx >= raw.length) { a_Tokens.push({ kind: 'comment', text: raw.slice(i_CodeStart) }); break mainLoop }
                if(raw.startsWith(s_BlockEndMarker, i_Idx)) {
                    i_Idx += s_BlockEndMarker.length; a_Tokens.push({ kind: 'comment', text: raw.slice(i_CodeStart, i_Idx) }); i_CodeStart = i_Idx
                    s_State = ScannerState.CodeReading; continue mainLoop
                }
                i_Idx++; break
            }
            default:
                break mainLoop
        }
    }
    return { raw, tokens: a_Tokens, markers: a_Markers, originalMarkers: [...a_Markers] }
}

// ── 6. A3 — BLOCK GROUPING FSM (PascalCase states) ──────────────
export enum GroupingState {
    WaitingForStart = 'WaitingForStart',
    Accumulating = 'Accumulating',
}

/**
 * Groups raw lines into blocks based on indentation.
 * @param rawLines - Array of raw line strings
 * @param startOffset - Line number offset for the first line
 * @param rules - Language rules for parsing
 * @param maxBlockSize - Maximum number of lines per block
 * @returns Array of line blocks
 */
export function blocks_Find(rawLines: string[], i_StartOffset: number, rules: LanguageRules, i_MaxBlockSize: number): LineBlock[] {
    const a_Blocks: LineBlock[] = []
    let s_State = GroupingState.WaitingForStart
    let o_CurBlock: LineBlock = { startLine: 0, lines: [] }, s_CurIndent = ''

    const fn_Flush = (): void => {
        if(o_CurBlock.lines.length > 1) { a_Blocks.push(o_CurBlock) }
        o_CurBlock = { startLine: 0, lines: [] }
        s_CurIndent = ''
    }
    const fn_IsBlankOrComment = (s_Raw: string): boolean => {
        const s_Trimmed = s_Raw.trim(); return s_Trimmed === '' || rules.lineComments.some(s_Lc => s_Trimmed.startsWith(s_Lc))
    }
    const fn_GetIndent = (s_Raw: string): string => s_Raw.match(/^(\s*)/)?.[1] ?? ''

    outer: for(let i_Idx = 0; i_Idx < rawLines.length; i_Idx++) {
        const s_Raw = rawLines[i_Idx]
        const s_Indent = fn_GetIndent(s_Raw)
        switch(s_State) {
            case GroupingState.WaitingForStart:
                if(fn_IsBlankOrComment(s_Raw)) { continue }
                s_CurIndent = s_Indent; o_CurBlock = { startLine: i_StartOffset + i_Idx, lines: [s_Raw] }
                s_State = GroupingState.Accumulating; break
            case GroupingState.Accumulating:
                if(fn_IsBlankOrComment(s_Raw)) { fn_Flush(); continue }
                if(s_Indent !== s_CurIndent || o_CurBlock.lines.length >= i_MaxBlockSize) {
                    fn_Flush()
                    s_CurIndent = s_Indent
                    o_CurBlock = { startLine: i_StartOffset + i_Idx, lines: [s_Raw] }
                    s_State = GroupingState.Accumulating
                } else {
                    o_CurBlock.lines.push(s_Raw)
                }
                break
        }
    }
    fn_Flush(); return a_Blocks
}

// ── 7. A4 — PROPAGATION FSM (PascalCase states) ───────────────
export enum PropagationState {
    FindingSeries = 'FindingSeries',
    Accumulating = 'Accumulating',
}

/**
 * Propagates position values across consecutive lines with the same marker.
 * @param parsedLines - Parsed lines to process
 * @param posMap - Position map to update
 * @param mk - Marker index to propagate
 */
export function positions_Propagate(parsedLines: ParsedLine[], o_PosMap: Map<string, number>, i_Mk: number): void {
    let s_State = PropagationState.FindingSeries, i_StartOfSeries = 0, i_EndOfSeries = 0
    const fn_ApplyMax = (): void => {
        let i_Max = 0
        for(let i = i_StartOfSeries; i <= i_EndOfSeries; i++) { i_Max = Math.max(i_Max, o_PosMap.get(`${i}:${i_Mk}`) ?? 0) }
        if(i_Max > 0) { for(let i = i_StartOfSeries; i <= i_EndOfSeries; i++) { const s_Key = `${i}:${i_Mk}`; if(o_PosMap.has(s_Key)) { o_PosMap.set(s_Key, i_Max) } } }
    }
    for(let i_Idx = 0; i_Idx < parsedLines.length; i_Idx++) {
        switch(s_State) {
            case PropagationState.FindingSeries:
                if(parsedLines[i_Idx].markers[i_Mk] !== undefined) { i_StartOfSeries = i_EndOfSeries = i_Idx; s_State = PropagationState.Accumulating }
                break
            case PropagationState.Accumulating: {
                const s_Cur = parsedLines[i_Idx].markers[i_Mk]?.symbol, s_Last = parsedLines[i_EndOfSeries].markers[i_Mk]?.symbol
                if(s_Cur !== undefined && s_Cur === s_Last) { i_EndOfSeries = i_Idx }
                else { fn_ApplyMax(); s_State = PropagationState.FindingSeries; if(parsedLines[i_Idx].markers[i_Mk] !== undefined) { i_StartOfSeries = i_EndOfSeries = i_Idx; s_State = PropagationState.Accumulating } }
                break
            }
        }
    }
    if(s_State === PropagationState.Accumulating) { fn_ApplyMax() }
}

/**
 * Builds a map of positions for each marker, calculating max column for alignment.
 * @param parsedLines - Parsed lines with markers
 * @param maxSpaces - Maximum number of spaces to add
 * @returns Map of line:markerIndex to target column position
 */
export function positionMap_Build(parsedLines: ParsedLine[], i_MaxSpaces: number): Map<string, number> {
    if(parsedLines.length < 2) { return new Map() }

    const ctx = fn_CreateContext(parsedLines)
    let s_State = PositionMapState.Collect

    while(s_State !== PositionMapState.Done) {
        s_State = fn_ExecuteState(s_State, ctx, parsedLines, i_MaxSpaces)
    }

    return ctx.o_PosMap
}

enum PositionMapState {
    Collect = 'Collect',
    ProcessSymbols = 'ProcessSymbols',
    Propagate = 'Propagate',
    Done = 'Done',
}

interface PositionMapContext {
    o_PosMap: Map<string, number>
    b_HasOriginal: boolean
    o_SymbolToMarkers: Map<string, { lineIdx: number; mk: number; startCol: number }[]>
    i_LineIdx: number
    i_SymbolIdx: number
}

function fn_CreateContext(parsedLines: ParsedLine[]): PositionMapContext {
    return {
        o_PosMap: new Map(),
        b_HasOriginal: parsedLines.some(pl => pl.originalMarkers !== undefined),
        o_SymbolToMarkers: new Map(),
        i_LineIdx: 0,
        i_SymbolIdx: 0,
    }
}

function fn_ExecuteState(
    s_State: PositionMapState,
    ctx: PositionMapContext,
    parsedLines: ParsedLine[],
    i_MaxSpaces: number
): PositionMapState {
    switch(s_State) {
        case PositionMapState.Collect:
            return fn_HandleCollect(ctx, parsedLines)
        case PositionMapState.ProcessSymbols:
            return fn_HandleProcessSymbols(ctx, parsedLines, i_MaxSpaces)
        case PositionMapState.Propagate:
            return fn_HandlePropagate(ctx, parsedLines)
        case PositionMapState.Done:
            return PositionMapState.Done
    }
}

function fn_HandleCollect(ctx: PositionMapContext, a_Pls: ParsedLine[]): PositionMapState {
    const b_Finished = ctx.i_LineIdx >= a_Pls.length
    if(b_Finished) { return PositionMapState.ProcessSymbols }

    const o_Line = a_Pls[ctx.i_LineIdx]
    const b_HasOriginalMarkers = ctx.b_HasOriginal && !!o_Line.originalMarkers
    const a_Markers = b_HasOriginalMarkers ? (o_Line.originalMarkers || o_Line.markers) : o_Line.markers
    fn_CollectMarkersForLine(ctx, a_Markers)
    ctx.i_LineIdx++

    return PositionMapState.Collect
}

function fn_CollectMarkersForLine(ctx: PositionMapContext, a_Markers: Marker[]): void {
    for(let i_Mk = 0; i_Mk < a_Markers.length; i_Mk++) {
        const o_Marker = a_Markers[i_Mk]
        const s_Key = o_Marker.symbol
        if(!ctx.o_SymbolToMarkers.has(s_Key)) { ctx.o_SymbolToMarkers.set(s_Key, []) }
        ctx.o_SymbolToMarkers.get(s_Key)!.push({ lineIdx: ctx.i_LineIdx, mk: i_Mk, startCol: o_Marker.startCol })
    }
}

function fn_HandleProcessSymbols(ctx: PositionMapContext, parsedLines: ParsedLine[], i_MaxSpaces: number): PositionMapState {
    const a_Symbols = Array.from(ctx.o_SymbolToMarkers.keys())
    if(ctx.i_SymbolIdx >= a_Symbols.length) {
        return PositionMapState.Propagate
    }

    const a_Markers = ctx.o_SymbolToMarkers.get(a_Symbols[ctx.i_SymbolIdx])!
    fn_ProcessSymbol(ctx, parsedLines, i_MaxSpaces, a_Markers)
    ctx.i_SymbolIdx++
    return PositionMapState.ProcessSymbols
}

function fn_ProcessSymbol(
    ctx: PositionMapContext,
    parsedLines: ParsedLine[],
    i_MaxSpaces: number,
    a_Markers: { lineIdx: number; mk: number; startCol: number }[]
): void {
    if(a_Markers.length < 2) { return }

    const i_MaxCol = Math.max(...a_Markers.map(m => m.startCol))
    for(const { lineIdx, mk, startCol } of a_Markers) {
        if(startCol >= i_MaxCol) { continue }
        if(fn_IsGteOperator(parsedLines[lineIdx].raw, startCol)) { continue }

        const i_Target = Math.min(i_MaxCol, startCol + i_MaxSpaces)
        if(i_Target > startCol) { ctx.o_PosMap.set(`${lineIdx}:${mk}`, i_Target) }
    }
}

function fn_IsGteOperator(s_Raw: string, i_StartCol: number): boolean {
    return s_Raw.substr(i_StartCol, 2) === '>=' && s_Raw[i_StartCol - 1] !== '>'
}

function fn_HandlePropagate(ctx: PositionMapContext, parsedLines: ParsedLine[]): PositionMapState {
    for(const s_Symbol of Array.from(ctx.o_SymbolToMarkers.keys())) {
        const a_Markers = ctx.o_SymbolToMarkers.get(s_Symbol)!
        const a_Mks = Array.from(new Set(a_Markers.map(m => m.mk)))
        for(const i_Mk of a_Mks) {
            const a_MarkersWithSameMk = a_Markers.filter(m => m.mk === i_Mk)
            if(a_MarkersWithSameMk.length >= 2) {
                positions_Propagate(parsedLines, ctx.o_PosMap, i_Mk)
            }
        }
    }
    return PositionMapState.Done
}

// ── 8. APPLY POSITION MAP — FIXED ─────────────────────────────
/**
 * Applies the position map to reconstruct aligned lines.
 * @param parsedLines - Parsed lines with markers
 * @param posMap - Position map with target columns
 * @returns Array of aligned line strings
 */
export function positionMap_Apply(parsedLines: ParsedLine[], o_PosMap: Map<string, number>): string[] {
    return parsedLines.map((o_Pl: ParsedLine, i_LineIdx: number) => {
        let s_Out = '', i_SrcPos = 0
        for(let i_Mk = 0; i_Mk < o_Pl.markers.length; i_Mk++) {
            const o_Marker = o_Pl.markers[i_Mk]
            s_Out += o_Pl.raw.slice(i_SrcPos, o_Marker.startCol)
            i_SrcPos = o_Marker.startCol
            const s_Key = `${i_LineIdx}:${i_Mk}`
            if(o_PosMap.has(s_Key)) {
                const i_Target = o_PosMap.get(s_Key)
                const i_Pad = i_Target! - s_Out.length
                if(i_Pad > 0) { s_Out += ' '.repeat(i_Pad) }
            }
            s_Out += o_Marker.symbol
            i_SrcPos = o_Marker.startCol + o_Marker.symbol.length
        }
        s_Out += o_Pl.raw.slice(i_SrcPos)
        return s_Out
    })
}

export function block_Align(parsedLines: ParsedLine[], i_MaxSpaces: number): string[] {
    if(parsedLines.length < 2) { return parsedLines.map(pl => pl.raw) }
    return fn_BuildAndApply(parsedLines, i_MaxSpaces)
}

function fn_BuildAndApply(parsedLines: ParsedLine[], i_MaxSpaces: number): string[] {
    const o_PosMap = positionMap_Build(parsedLines, i_MaxSpaces)
    if(o_PosMap.size === 0) { return parsedLines.map(pl => pl.raw) }
    return positionMap_Apply(parsedLines, o_PosMap)
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

/** Checks if the NooShere has an error. */
export function ns_Error(ns: NS): boolean { return ns.result.ok === false }
export function ns_SetError(ns: NS, s_Error: string): void { ns.result = err(s_Error); ns.s_Error = s_Error }

export function pipeline_Build(
    fn_ConfigLoad: Decorator,
    fn_LanguageDetect: Decorator,
    fn_BlockFind: Decorator,
    fn_LinesParse: Decorator,
    fn_AlignmentApply: Decorator,
    fn_TextReplace: Decorator,
    fn_Rwd: (fn: Decorator, ns: NS) => void
): (ns: NS) => void {
    return function pipelineFSM(ns: NS): void {
        let s_State = PipelineState.Idle

        mainLoop: while(true) {
            s_State = fn_ExecutePipelineState(s_State, ns, fn_ConfigLoad, fn_LanguageDetect, fn_BlockFind, fn_LinesParse, fn_AlignmentApply, fn_TextReplace, fn_Rwd)
            if(s_State === PipelineState.Done || s_State === PipelineState.Error) { break }
        }
    }
}

function fn_ExecutePipelineState(
    s_State: PipelineState,
    ns: NS,
    fn_ConfigLoad: Decorator,
    fn_LanguageDetect: Decorator,
    fn_BlockFind: Decorator,
    fn_LinesParse: Decorator,
    fn_AlignmentApply: Decorator,
    fn_TextReplace: Decorator,
    fn_Rwd: (fn: Decorator, ns: NS) => void
): PipelineState {
    switch(s_State) {
        case PipelineState.Idle:
            return PipelineState.LoadConfig
        case PipelineState.LoadConfig:
            fn_Rwd(fn_ConfigLoad, ns)
            return ns_Error(ns) ? PipelineState.Error : PipelineState.DetectLanguage
        case PipelineState.DetectLanguage:
            fn_Rwd(fn_LanguageDetect, ns)
            return ns_Error(ns) ? PipelineState.Error : PipelineState.FindBlocks
        case PipelineState.FindBlocks:
            fn_Rwd(fn_BlockFind, ns)
            return ns_Error(ns) ? PipelineState.Error : PipelineState.ParseLines
        case PipelineState.ParseLines:
            fn_Rwd(fn_LinesParse, ns)
            return ns_Error(ns) ? PipelineState.Error : PipelineState.Align
        case PipelineState.Align:
            fn_Rwd(fn_AlignmentApply, ns)
            return ns_Error(ns) ? PipelineState.Error : PipelineState.ReplaceText
        case PipelineState.ReplaceText:
            fn_Rwd(fn_TextReplace, ns)
            return ns_Error(ns) ? PipelineState.Error : PipelineState.Done
        case PipelineState.Done:
        case PipelineState.Error:
            return s_State
    }
}

// Backward compatibility aliases
export const parseLineIgnoringStrings = line_Parse
export const findLineBlocks = blocks_Find
export const alignBlock = block_Align
export const buildPairwisePositionMap = positionMap_Build
export const applyPositionMap = positionMap_Apply
export const buildPipelineFSM = pipeline_Build
export const detectLanguageRules = languageRules_Detect
export const DEFAULT_DEFAULT_CONFIG = DEFAULT_CONFIG