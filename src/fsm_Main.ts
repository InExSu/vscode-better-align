// ============================================================
// fsm_Main.ts - Pure Logic FSM Module (per AI Prompt_This.md)
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================

// ── 1. SHARED TYPES ───────────────────────────────────────────
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

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
export const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })
export const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ── 2. CONFIG ──────────────────────────────────────────────────
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

// ── 3. LANGUAGE RULES ──────────────────────────────────────────
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

export function languageRules_Detect(s_LangId: string, a_DefaultAlignChars: string[]): LanguageRules {
    return LANGUAGE_RULES[s_LangId]
        ? { ...LANGUAGE_RULES[s_LangId], alignChars: a_DefaultAlignChars }
        : { ...DEFAULT_LANGUAGE_RULES, alignChars: a_DefaultAlignChars }
}

// ── 4. NEW FSM API (per AI Prompt_This.md) ─────────────────────
export interface AlignToken {
    s_Char: string
    i_Pos: number
}

export interface AlignColumn {
    s_Char: string
    i_MaxPos: number
}

export interface SanitizeFlags {
    b_PreserveStrings: boolean
    b_PreserveComments: boolean
}

export interface FSMContext {
    lines           : string[]
    alignChars      : string[]
    preserveStrings : boolean
    preserveComments: boolean
}

export interface FSMResult {
    alignedLines: string[]
    changesApplied: boolean
}

export type FSMState = 'block_Find' | 'lines_Sanitize' | 'chars_Scan' | 'map_Normalize' | 'lines_Align' | 'result_Emit'

export type NS = {
    result: Result<unknown>
    s_Error: string
    config: typeof DEFAULT_CONFIG
    data: NSData
    [k: string]: unknown
}

export type NSData = {
    editor: unknown
    languageRules: LanguageRules | false
    blocks: LineBlock[]
    parsedLines: ParsedLine[][]
    alignedLines: string[][]
}

export function ns_Error(ns: NS): boolean { return ns.result.ok === false }
export function ns_SetError(ns: NS, s_Error: string): void { ns.result = err(s_Error); ns.s_Error = s_Error }

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

/**
 * Main FSM - a_FSM_Main
 * States                     : block_Find → lines_Sanitize → chars_Scan → map_Normalize → lines_Align → result_Emit
 */
export function a_FSM_Main(ctx: FSMContext): FSMResult {
    const stateCtx: FSMStateContext = {
        a_Lines: ctx.lines,
        a_AlignChars: ctx.alignChars,
        b_PreserveStrings: ctx.preserveStrings,
        b_PreserveComments: ctx.preserveComments,
        a_MaskedLines: [],
        a_RawMap: [],
        a_Columns: [],
        a_AlignedLines: [...ctx.lines],
        b_Changed: false,
    }

    let state: FSMState = 'block_Find'

    outerLoop: while(true) {
        switch(state) {
            case 'block_Find':
                state = fn_BlockFind(stateCtx)
                break
            case 'lines_Sanitize':
                state = fn_LinesSanitize(stateCtx)
                break
            case 'chars_Scan':
                state = fn_CharsScan(stateCtx)
                break
            case 'map_Normalize':
                state = fn_MapNormalize(stateCtx)
                break
            case 'lines_Align':
                state = fn_LinesAlign(stateCtx)
                break
            case 'result_Emit':
                break outerLoop
            default:
                fn_Unreachable(state as never)
        }
    }

    return { alignedLines: stateCtx.a_AlignedLines, changesApplied: stateCtx.b_Changed }
}

interface FSMStateContext {
    a_Lines: string[]
    a_AlignChars: string[]
    b_PreserveStrings: boolean
    b_PreserveComments: boolean
    a_MaskedLines: string[]
    a_RawMap: AlignToken[][]
    a_Columns: AlignColumn[]
    a_AlignedLines: string[]
    b_Changed: boolean
}

function fn_Unreachable(s_State: never): never {
    throw new Error(`Unhandled state: ${s_State}`)
}

function fn_BlockFind(ctx: FSMStateContext): FSMState {
    // Find blocks by indentation - integrated in a_Lines
    return 'lines_Sanitize'
}

function fn_LinesSanitize(ctx: FSMStateContext): FSMState {
    ctx.a_MaskedLines = lines_Sanitize(ctx.a_Lines, {
        b_PreserveStrings: ctx.b_PreserveStrings,
        b_PreserveComments: ctx.b_PreserveComments,
    })
    return 'chars_Scan'
}

function fn_CharsScan(ctx: FSMStateContext): FSMState {
    ctx.a_RawMap = map_BuildRaw(ctx.a_MaskedLines, ctx.a_AlignChars)
    return 'map_Normalize'
}

function fn_MapNormalize(ctx: FSMStateContext): FSMState {
    ctx.a_Columns = map_Normalize(ctx.a_RawMap)
    return ctx.a_Columns.length > 0 ? 'lines_Align' : 'result_Emit'
}

function fn_LinesAlign(ctx: FSMStateContext): FSMState {
    ctx.a_AlignedLines = lines_Align(ctx.a_Lines, ctx.a_Columns, ctx.a_RawMap)
    ctx.b_Changed = true
    return 'result_Emit'
}

// Pure functions per AI Prompt_This.md

export function lines_Sanitize(a_Lines: string[], flags: SanitizeFlags): string[] {
    const result: string[] = []
    for(const s_Line of a_Lines) {
        result.push(fn_SanitizeLine(s_Line, flags))
    }
    return result
}

function fn_SanitizeLine(s_Line: string, flags: SanitizeFlags): string {
    let s_Result = ''
    let i_Idx = 0

    while(i_Idx < s_Line.length) {
        // String delimiters
        if(flags.b_PreserveStrings) {
            for(const delim of ['"', "'", '`']) {
                if(s_Line.startsWith(delim, i_Idx)) {
                    const endIdx = fn_FindStringEnd(s_Line, i_Idx, delim)
                    s_Result += s_Line.slice(i_Idx, endIdx).replace(/./g, '\0')
                    i_Idx = endIdx
                    break
                }
            }
            if(i_Idx < s_Line.length && s_Line[i_Idx] === '\0') { continue }
        }

        // Block comments
        if(flags.b_PreserveComments) {
            if(s_Line.startsWith('/*', i_Idx)) {
                const endIdx = s_Line.indexOf('*/', i_Idx + 2)
                const end = endIdx >= 0 ? endIdx + 2 : s_Line.length
                s_Result += s_Line.slice(i_Idx, end).replace(/./g, '\0')
                i_Idx = end
                continue
            }
            if(s_Line.startsWith('//', i_Idx) || s_Line.startsWith('#', i_Idx)) {
                s_Result += s_Line.slice(i_Idx).replace(/./g, '\0')
                break
            }
        }

        s_Result += s_Line[i_Idx]
        i_Idx++
    }

    return s_Result
}

function fn_FindStringEnd(s_Line: string, i_Start: number, s_Delim: string): number {
    let i_Idx = i_Start + s_Delim.length
    while(i_Idx < s_Line.length) {
        if(s_Line[i_Idx] === '\\') { i_Idx += 2; continue }
        if(s_Line.startsWith(s_Delim, i_Idx)) { return i_Idx + s_Delim.length }
        i_Idx++
    }
    return s_Line.length
}

export function chars_FindGreedy(s_Masked: string, a_AlignChars: string[]): AlignToken[] {
    const a_Tokens: AlignToken[] = []
    const a_SortedChars = [...a_AlignChars].sort((a, b) => b.length - a.length)
    let i_Idx = 0

    while(i_Idx < s_Masked.length) {
        if(s_Masked[i_Idx] === '\0') { i_Idx++; continue }

        let b_Found = false
        for(const s_Char of a_SortedChars) {
            if(s_Masked.startsWith(s_Char, i_Idx)) {
                a_Tokens.push({ s_Char, i_Pos: i_Idx })
                i_Idx += s_Char.length
                b_Found = true
                break
            }
        }
        if(!b_Found) { i_Idx++ }
    }

    return a_Tokens
}

export function map_BuildRaw(a_MaskedLines: string[], a_AlignChars: string[]): AlignToken[][] {
    return a_MaskedLines.map(s_Line => chars_FindGreedy(s_Line, a_AlignChars))
}

export function map_Normalize(a_RawMap: AlignToken[][]): AlignColumn[] {
    if(a_RawMap.length === 0) { return [] }

    // Use max column count so that lines with more tokens can still be aligned
    // Lines with fewer tokens simply skip those columns in lines_Align
    const i_ColCount = Math.max(...a_RawMap.map(a_Row => a_Row.length))
    if(i_ColCount === 0) { return [] }

    const a_Columns: AlignColumn[] = []

    for(let i_Col = 0; i_Col < i_ColCount; i_Col++) {
        // Count occurrences of each character at this column
        const charCount = new Map<string, number>()
        for(const a_Row of a_RawMap) {
            if(a_Row[i_Col]) {
                const s_Char = a_Row[i_Col].s_Char
                charCount.set(s_Char, (charCount.get(s_Char) ?? 0) + 1)
            }
        }
        if(charCount.size === 0) { continue }

        // Find the most common character
        let s_DominantChar = ''
        let i_MaxCount = 0
        for(const [s_Char, count] of charCount) {
            if(count > i_MaxCount) {
                i_MaxCount = count
                s_DominantChar = s_Char
            }
        }

        // Only align if at least 2 rows share this character
        if(i_MaxCount < 2) { continue }

        // Find max position among rows with the dominant character
        let i_MaxPos = 0
        for(const a_Row of a_RawMap) {
            if(a_Row[i_Col] && a_Row[i_Col].s_Char === s_DominantChar) {
                i_MaxPos = Math.max(i_MaxPos, a_Row[i_Col].i_Pos)
            }
        }

        a_Columns.push({ s_Char: s_DominantChar, i_MaxPos })
    }

    return a_Columns
}

export function lines_Align(a_OrigLines: string[], a_Columns: AlignColumn[], a_RawMap: AlignToken[][]): string[] {
    if(a_Columns.length === 0) { return [...a_OrigLines] }

    return a_OrigLines.map((s_Line, i_LineIdx) => {
        let s_Result = ''
        let i_SrcPos = 0

        for(let i_ColIdx = 0; i_ColIdx < a_Columns.length; i_ColIdx++) {
            const col = a_Columns[i_ColIdx]
            const token = a_RawMap[i_LineIdx][i_ColIdx]

            if(token && token.s_Char === col.s_Char) {
                // Append raw text up to the token start
                s_Result += s_Line.slice(i_SrcPos, token.i_Pos)
                // Calculate padding from current result length to max position
                const i_CurrentPos = s_Result.length
                const i_Pad = col.i_MaxPos - i_CurrentPos
                if(i_Pad > 0) { s_Result += ' '.repeat(i_Pad) }
                // Append the alignment character
                s_Result += token.s_Char
                // Update source position past the token
                i_SrcPos = token.i_Pos + token.s_Char.length
            }
        }

        s_Result += s_Line.slice(i_SrcPos)
        return s_Result
    })
}

// ── 5. BLOCK FINDING (per AI Prompt_This.md) ────────────────────

export function blocks_Find(rawLines: string[], i_StartOffset: number, rules: LanguageRules, i_MaxBlockSize: number): LineBlock[] {

    const a_Blocks: LineBlock[] = []
    let s_State = GroupingState.WaitingForStart
    let o_CurBlock: LineBlock = { startLine: 0, lines: [] }, s_CurIndent = ''

    const fn_Flush = (): void => {
        if(o_CurBlock.lines.length > 0) { a_Blocks.push(o_CurBlock) }
        o_CurBlock = { startLine: 0, lines: [] }
        s_CurIndent = ''
    }
    const fn_IsBlankOrComment = (s_Raw: string): boolean => {
        const s_Trimmed = s_Raw.trim()
        return s_Trimmed === '' || rules.lineComments.some(s_Lc => s_Trimmed.startsWith(s_Lc))
    }
    const fn_GetIndent = (s_Raw: string): string => s_Raw.match(/^(\s*)/)?.[1] ?? ''

    for(let i_Idx = 0; i_Idx < rawLines.length; i_Idx++) {
        const s_Raw = rawLines[i_Idx]
        const s_Indent = fn_GetIndent(s_Raw)
        switch(s_State) {
            case GroupingState.WaitingForStart:
                if(fn_IsBlankOrComment(s_Raw)) { continue }
                s_CurIndent = s_Indent
                o_CurBlock = { startLine: i_StartOffset + i_Idx, lines: [s_Raw] }
                s_State = GroupingState.Accumulating
                break
            case GroupingState.Accumulating:
                if(fn_IsBlankOrComment(s_Raw)) {
                    fn_Flush()
                    s_State = GroupingState.WaitingForStart
                    continue
                }
                if(o_CurBlock.lines.length >= i_MaxBlockSize) {
                    fn_Flush()
                    s_CurIndent = s_Indent
                    o_CurBlock = { startLine: i_StartOffset + i_Idx, lines: [s_Raw] }
                    s_State = GroupingState.Accumulating
                } else {
                    o_CurBlock.lines.push(s_Raw)
                }
                break
            default:
                fn_Unreachable(s_State as never)
        }
    }
    fn_Flush()

    return a_Blocks
}

enum GroupingState {
    WaitingForStart = 'WaitingForStart',
    Accumulating = 'Accumulating',
}



// ── 6. PIPELINE FSM (per AI Prompt_This.md) ─────────────────────

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
            s_State = fn_ExecutePipelineState(s_State, ns,
                fn_ConfigLoad, fn_LanguageDetect, fn_BlockFind, fn_LinesParse, fn_AlignmentApply, fn_TextReplace, fn_Rwd)
            if(s_State === PipelineState.Done || s_State === PipelineState.Error) { break }
        }
    }
}

export function fn_ExecutePipelineState(
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
        default:
            return fn_Unreachable(s_State as never)
    }
}

// ── 7. COMPATIBILITY ALIASES ────────────────────────────────────

export function line_Parse(raw: string, rules: LanguageRules): ParsedLine {
    const a_AlignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const a_Markers: Marker[] = []

    const a_Masked = lines_Sanitize([raw], { b_PreserveStrings: true, b_PreserveComments: true })
    const tokens = chars_FindGreedy(a_Masked[0], a_AlignChars)

    for(const tok of tokens) {
        a_Markers.push({ symbol: tok.s_Char, startCol: tok.i_Pos })
    }

    return { raw, tokens: [{ kind: 'code', text: raw }], markers: a_Markers }
}

export function block_Align(parsedLines: ParsedLine[], i_MaxSpaces: number): string[] {
    if(parsedLines.length < 2) { return parsedLines.map(pl => pl.raw) }

    const ctx: FSMContext = {
        lines: parsedLines.map(pl => pl.raw),
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
        preserveStrings: true,
        preserveComments: true,
    }

    const result = a_FSM_Main(ctx)
    return result.alignedLines
}

export function positionMap_Build(parsedLines: ParsedLine[], i_MaxSpaces: number): Map<string, number> {
    const ctx: FSMContext = {
        lines: parsedLines.map(pl => pl.raw),
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
        preserveStrings: true,
        preserveComments: true,
    }

    const result = a_FSM_Main(ctx)
    const o_Map = new Map<string, number>()

    // Extract positions from aligned lines
    for(let i_Line = 0; i_Line < result.alignedLines.length; i_Line++) {
        const orig = parsedLines[i_Line].raw
        const aligned = result.alignedLines[i_Line]
        for(let i_Mk = 0; i_Mk < parsedLines[i_Line].markers.length; i_Mk++) {
            const origPos = parsedLines[i_Line].markers[i_Mk].startCol
            const alignedPos = aligned.indexOf(parsedLines[i_Line].markers[i_Mk].symbol, origPos)
            if(alignedPos > origPos && alignedPos - origPos <= i_MaxSpaces) {
                o_Map.set(`${i_Line}:${i_Mk}`, alignedPos)
            }
        }
    }

    return o_Map
}

export function positionMap_Apply(parsedLines: ParsedLine[], o_PosMap: Map<string, number>): string[] {
    return parsedLines.map((o_Pl, i_LineIdx) => {
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

export const parseLineIgnoringStrings = line_Parse
export const findLineBlocks           = blocks_Find
export const alignBlock               = block_Align
export const buildPairwisePositionMap = positionMap_Build
export const applyPositionMap         = positionMap_Apply
export const buildPipelineFSM         = pipeline_Build
export const detectLanguageRules      = languageRules_Detect
export const DEFAULT_DEFAULT_CONFIG   = DEFAULT_CONFIG