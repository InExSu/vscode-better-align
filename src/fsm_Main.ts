// ============================================================
// fsm_Main.ts
// Idempotent alignment FSM with structural depth tracking
// ============================================================

// ── 1. SHARED TYPES ───────────────────────────────────────────

export type LanguageRules = {
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
}

export type LineBlock = {
    startLine: number
    lines: string[]
}

export type ParsedLine = {
    raw: string
    tokens: Token[]
    markers: Marker[]
    originalMarkers?: Marker[]
}

export type Token =
    | { kind: 'code'; text: string }
    | { kind: 'string'; text: string }
    | { kind: 'comment'; text: string }

export type Marker = {
    symbol: string
    startCol: number
}

export type Result<T, E = string> =
    | { ok: true; value: T }
    | { ok: false; error: E }

export const ok = <T,>(v: T): Result<T> => ({
    ok: true,
    value: v,
})

export const err = <E,>(e: E): Result<never, E> => ({
    ok: false,
    error: e,
})

// ── 2. CONFIG ─────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
    b_Debug: false,

    defaultAlignChars: [
        '===',
        '!==',
        '<=>',
        '=>',
        '->',
        '==',
        '!=',
        '>=',
        '<=',
        '+=',
        '-=',
        '*=',
        '/=',
        '%=',
        '**=',
        ':',
        '{',
        '=',
        ',',
    ],

    defaultSeps: [
        '; ',
        ', ',
    ],

    maxBlockSize: 500,
    preserveComments: true,
    preserveStrings: true,
    alignMultilineBlocks: false,
    skipTemplates: true,
    greedyMatch: true,
    minColumns: 1,
    maxSpaces: 40,

    testData: {} as Record<string, unknown>,
}

// ── 3. LANGUAGE RULES ─────────────────────────────────────────

export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments: ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars: DEFAULT_CONFIG.defaultAlignChars,
}

export const LANGUAGE_RULES: Record<string, LanguageRules> = {
    typescript: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', "'", '`'],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },

    javascript: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', "'", '`'],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },

    python: {
        lineComments: ['#'],
        blockComments: [],
        stringDelimiters: ['"', "'"],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },

    rust: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"'],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },

    go: {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', '`'],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },

    lua: {
        lineComments: ['--'],
        blockComments: [{ start: '--[[', end: ']]' }],
        stringDelimiters: ['"', "'"],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },

    sql: {
        lineComments: ['--'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"', "'"],
        alignChars: DEFAULT_CONFIG.defaultAlignChars,
    },
}

export function languageRules_Detect(
    s_LangId: string,
    a_DefaultAlignChars: string[]
): LanguageRules {

    return LANGUAGE_RULES[s_LangId]
        ? {
            ...LANGUAGE_RULES[s_LangId],
            alignChars: a_DefaultAlignChars,
        }
        : {
            ...DEFAULT_LANGUAGE_RULES,
            alignChars: a_DefaultAlignChars,
        }
}

// ── 4. INTERNAL TYPES ─────────────────────────────────────────

type PatternMatch = {
    i_Pos: number
    s_Pattern: string
}

type SepMatch = {
    s_Sep: string
    i_Idx: number
}

type SegmentParsed = {
    s_Val: string
    s_Sep: string
    s_After: string
}

type LineSegment = {
    s_Key: string
    s_Anchor: string
    s_Val: string
    s_Sep: string
    s_After: string
    s_Tail: string
}

type WidthsResult = {
    a_WidthsKey: number[]
    a_WidthsVal: number[]
}

type BlockSplitState = {
    a_Blocks: number[][]
    a_BlockCurrent: number[]
    s_KeyCurrent: string | null
}

type DepthState = {
    i_BraceDepth: number
    i_ParenDepth: number
    i_BracketDepth: number
    i_AngleDepth: number
}

type FSMStateContext = {
    a_LinesAll: string[]
    a_AlignChars: string[]
    a_Seps: string[]
    a_Blocks: number[][]
    a_LinesResult: string[]
    b_Changed: boolean
}

// ── 5. DEPTH TRACKING ─────────────────────────────────────────

function depthState_Create(): DepthState {
    return {
        i_BraceDepth: 0,
        i_ParenDepth: 0,
        i_BracketDepth: 0,
        i_AngleDepth: 0,
    }
}

function depthState_IsTopLevel(o_Ds: DepthState): boolean {
    return (
        o_Ds.i_ParenDepth === 0 &&
        o_Ds.i_BracketDepth === 0 &&
        o_Ds.i_AngleDepth === 0
    )
}

function depthState_Advance(
    o_Ds: DepthState,
    ch: string
): void {

    switch(ch) {

        case '{':
            o_Ds.i_BraceDepth++
            break

        case '}':
            o_Ds.i_BraceDepth = Math.max(0, o_Ds.i_BraceDepth - 1)
            break

        case '(':
            o_Ds.i_ParenDepth++
            break

        case ')':
            o_Ds.i_ParenDepth = Math.max(0, o_Ds.i_ParenDepth - 1)
            break

        case '[':
            o_Ds.i_BracketDepth++
            break

        case ']':
            o_Ds.i_BracketDepth = Math.max(0, o_Ds.i_BracketDepth - 1)
            break

        case '<':
            o_Ds.i_AngleDepth++
            break

        case '>':
            o_Ds.i_AngleDepth = Math.max(0, o_Ds.i_AngleDepth - 1)
            break
    }
}

// ── 6. PATTERN MATCHING ───────────────────────────────────────

function pattern_MatchAt(
    s_Line: string,
    i_Pos: number,
    a_Patterns: string[]
): string | null {

    for(const s_Pat of a_Patterns) {
        if(s_Line.startsWith(s_Pat, i_Pos)) {
            return s_Pat
        }
    }

    return null
}

/**
 * Top-level only pattern matching.
 * Ignores nested type literals / arrays / generics.
 */

function patternMatches_Find(
    s_Line: string,
    a_Patterns: string[]
): PatternMatch[] {

    const a_Sorted = [...a_Patterns]
        .sort((a, b) => b.length - a.length)

    const a_Result: PatternMatch[] = []

    const o_Depth = depthState_Create()

    let i = 0

    while(i < s_Line.length) {

        const s_Match = pattern_MatchAt(
            s_Line,
            i,
            a_Sorted
        )

        if(
            s_Match &&
            depthState_IsTopLevel(o_Depth)
        ) {

            a_Result.push({
                i_Pos: i,
                s_Pattern: s_Match,
            })

            for(const ch of s_Match) {
                depthState_Advance(o_Depth, ch)
            }

            i += s_Match.length
            continue
        }

        depthState_Advance(o_Depth, s_Line[i])

        i++
    }

    return a_Result
}

function patternMatches_ToKey(
    a_Pats: PatternMatch[]
): string {

    return a_Pats
        .map(o_P => o_P.s_Pattern)
        .join('\0')
}

// ── 7. SEPARATOR SEARCH ───────────────────────────────────────

function sep_Find(
    s_Str: string,
    i_From: number,
    a_Seps: string[]
): SepMatch | null {

    let o_Best: SepMatch | null = null

    for(const s_Sep of a_Seps) {

        const i_Idx = s_Str.indexOf(
            s_Sep,
            i_From
        )

        if(
            i_Idx !== -1 &&
            (
                o_Best === null ||
                i_Idx < o_Best.i_Idx
            )
        ) {
            o_Best = {
                s_Sep,
                i_Idx,
            }
        }
    }

    return o_Best
}

// ── 8. SEGMENT PARSING ────────────────────────────────────────

function segment_Parse(
    s_Line: string,
    i_From: number,
    i_To: number,
    a_Seps: string[]
): SegmentParsed {

    const s_Raw = s_Line
        .slice(i_From, i_To)
        .trim()

    const o_Found = sep_Find(
        s_Raw,
        0,
        a_Seps
    )

    if(!o_Found) {
        return {
            s_Val: s_Raw.trim(),
            s_Sep: '',
            s_After: '',
        }
    }

    return {
        s_Val: s_Raw
            .slice(0, o_Found.i_Idx)
            .trim(),

        s_Sep: o_Found.s_Sep,

        s_After: s_Raw
            .slice(o_Found.i_Idx + o_Found.s_Sep.length)
            .trim(),
    }
}

function segments_OfLine(
    s_Line: string,
    a_Pats: PatternMatch[],
    i_Count: number,
    a_Seps: string[]
): LineSegment[] {

    const a_Result: LineSegment[] = []

    let i_EndPrev = 0

    for(let j = 0; j < i_Count; j++) {

        const o_Pat = a_Pats[j]

        const s_Key = s_Line
            .slice(i_EndPrev, o_Pat.i_Pos)
            .trim()

        const s_Anchor = o_Pat.s_Pattern

        i_EndPrev =
            o_Pat.i_Pos +
            o_Pat.s_Pattern.length

        const i_PosNext =
            j + 1 < i_Count
                ? a_Pats[j + 1].i_Pos
                : s_Line.length

        const o_Seg = segment_Parse(
            s_Line,
            i_EndPrev,
            i_PosNext,
            a_Seps
        )

        i_EndPrev = i_PosNext

        a_Result.push({
            s_Key,
            s_Anchor,
            s_Val: o_Seg.s_Val,
            s_Sep: o_Seg.s_Sep,
            s_After: o_Seg.s_After,
            s_Tail: '',
        })
    }

    if(a_Result.length > 0) {
        a_Result[a_Result.length - 1].s_Tail =
            s_Line
                .slice(i_EndPrev)
                .trimEnd()
    }

    return a_Result
}

// ── 9. WIDTH MEASUREMENT ──────────────────────────────────────

function widths_Measure(
    a_Lines: string[],
    a_PatternsPerLine: PatternMatch[][],
    i_Count: number,
    a_Seps: string[]
): WidthsResult {

    const a_WidthsKey =
        new Array<number>(i_Count).fill(0)

    const a_WidthsVal =
        new Array<number>(i_Count).fill(0)

    for(let r = 0; r < a_Lines.length; r++) {

        const a_Segs = segments_OfLine(
            a_Lines[r],
            a_PatternsPerLine[r],
            i_Count,
            a_Seps
        )

        for(let j = 0; j < i_Count; j++) {

            a_WidthsKey[j] = Math.max(
                a_WidthsKey[j],
                a_Segs[j].s_Key.length
            )

            a_WidthsVal[j] = Math.max(
                a_WidthsVal[j],
                a_Segs[j].s_Val.length
            )
        }
    }

    return {
        a_WidthsKey,
        a_WidthsVal,
    }
}

// ── 10. RENDER ────────────────────────────────────────────────

function segment_Render(
    o_Seg: LineSegment,
    i_WKey: number,
    i_WVal: number,
    b_IsLast: boolean
): string {

    const s_Key =
        o_Seg.s_Key.padEnd(i_WKey)

    const s_Val =
        o_Seg.s_Val.length > 0
            ? ' ' + o_Seg.s_Val.padEnd(i_WVal)
            : ''

    const s_Sep =
        o_Seg.s_Sep.length > 0
            ? o_Seg.s_Sep
            : ''

    const s_After =
        o_Seg.s_After.length > 0
            ? o_Seg.s_After
            : ''

    const s_Rendered =
        s_Key +
        o_Seg.s_Anchor +
        s_Val +
        s_Sep +
        s_After

    return b_IsLast
        ? s_Rendered + o_Seg.s_Tail
        : s_Rendered
}

function line_Render(
    s_Line: string,
    a_Pats: PatternMatch[],
    i_Count: number,
    a_WidthsKey: number[],
    a_WidthsVal: number[],
    a_Seps: string[]
): string {

    const a_Segs = segments_OfLine(
        s_Line,
        a_Pats,
        i_Count,
        a_Seps
    )

    return a_Segs
        .map((o_Seg, j) =>
            segment_Render(
                o_Seg,
                a_WidthsKey[j],
                a_WidthsVal[j],
                j === i_Count - 1
            )
        )
        .join('')
}

// ── 11. BLOCK PROCESSING ──────────────────────────────────────

function block_Process(
    a_Indices: number[],
    a_LinesAll: string[],
    a_Patterns: string[],
    a_Seps: string[]
): string[] {

    const a_Lines =
        a_Indices.map(i => a_LinesAll[i])

    if(a_Indices.length === 1) {
        return a_Lines
    }

    const a_PatternsPerLine =
        a_Lines.map(s_L =>
            patternMatches_Find(
                s_L,
                a_Patterns
            )
        )

    const i_Count =
        a_PatternsPerLine[0].length

    if(i_Count === 0) {
        return a_Lines
    }

    const {
        a_WidthsKey,
        a_WidthsVal,
    } = widths_Measure(
        a_Lines,
        a_PatternsPerLine,
        i_Count,
        a_Seps
    )

    return a_Lines.map((s_Line, r) =>
        line_Render(
            s_Line,
            a_PatternsPerLine[r],
            i_Count,
            a_WidthsKey,
            a_WidthsVal,
            a_Seps
        )
    )
}

// ── 12. BLOCK SPLITTING ───────────────────────────────────────

function blocks_Split(
    a_LinesAll: string[],
    a_Patterns: string[]
): number[][] {

    let o_State: BlockSplitState = {
        a_Blocks: [],
        a_BlockCurrent: [],
        s_KeyCurrent: null,
    }

    for(let i = 0; i < a_LinesAll.length; i++) {

        if(a_LinesAll[i].trim() === '') {
            o_State = blockSplitState_OnEmpty(o_State)
            continue
        }

        const s_Key = patternMatches_ToKey(
            patternMatches_Find(
                a_LinesAll[i],
                a_Patterns
            )
        )

        o_State = blockSplitState_OnLine(
            o_State,
            i,
            s_Key
        )
    }

    return blockSplitState_Flush(o_State)
        .a_Blocks
}

function blockSplitState_Flush(
    o_State: BlockSplitState
): BlockSplitState {

    if(o_State.a_BlockCurrent.length === 0) {
        return o_State
    }

    return {
        a_Blocks: [
            ...o_State.a_Blocks,
            o_State.a_BlockCurrent,
        ],

        a_BlockCurrent: [],
        s_KeyCurrent: null,
    }
}

function blockSplitState_OnEmpty(
    o_State: BlockSplitState
): BlockSplitState {

    return blockSplitState_Flush(o_State)
}

function blockSplitState_OnLine(
    o_State: BlockSplitState,
    i: number,
    s_Key: string
): BlockSplitState {

    if(s_Key === o_State.s_KeyCurrent) {

        return {
            ...o_State,
            a_BlockCurrent: [
                ...o_State.a_BlockCurrent,
                i,
            ],
        }
    }

    const o_Flushed =
        blockSplitState_Flush(o_State)

    return {
        ...o_Flushed,
        a_BlockCurrent: [i],
        s_KeyCurrent: s_Key,
    }
}

// ── 13. MAIN FSM ──────────────────────────────────────────────

export interface FSMContext {
    lines: string[]
    alignChars: string[]
    seps: string[]
    preserveStrings: boolean
    preserveComments: boolean
    maxSpaces: number
}

export interface FSMResult {
    alignedLines: string[]
    changesApplied: boolean
}

export type FSMState =
    | 'blocks_Split'
    | 'blocks_Process'
    | 'result_Emit'

export function a_FSM_Main(
    o_Ctx: FSMContext
): FSMResult {

    const o_Sc: FSMStateContext = {
        a_LinesAll: o_Ctx.lines,
        a_AlignChars: o_Ctx.alignChars,
        a_Seps: o_Ctx.seps,
        a_Blocks: [],
        a_LinesResult: [...o_Ctx.lines],
        b_Changed: false,
    }

    let s_State: FSMState = 'blocks_Split'

    outerLoop: while(true) {

        switch(s_State) {

            case 'blocks_Split':
                o_Sc.a_Blocks = blocks_Split(
                    o_Sc.a_LinesAll,
                    o_Sc.a_AlignChars
                )

                s_State = 'blocks_Process'
                break

            case 'blocks_Process':

                for(const a_Block of o_Sc.a_Blocks) {

                    const a_Aligned = block_Process(
                        a_Block,
                        o_Sc.a_LinesAll,
                        o_Sc.a_AlignChars,
                        o_Sc.a_Seps
                    )

                    for(let i = 0; i < a_Block.length; i++) {

                        if(
                            o_Sc.a_LinesResult[a_Block[i]]
                            !==
                            a_Aligned[i]
                        ) {

                            o_Sc.a_LinesResult[a_Block[i]] =
                                a_Aligned[i]

                            o_Sc.b_Changed = true
                        }
                    }
                }

                s_State = 'result_Emit'
                break

            case 'result_Emit':
                break outerLoop

            default:
                fn_Unreachable(s_State as never)
        }
    }

    return {
        alignedLines: o_Sc.a_LinesResult,
        changesApplied: o_Sc.b_Changed,
    }
}

function fn_Unreachable(
    s_State: never
): never {

    throw new Error(
        `Unhandled FSM state: ${s_State}`
    )
}

// ── 14. ENTRY POINT ───────────────────────────────────────────

export function text_AlignByBlocks(
    s_Input: string,
    a_Patterns: string[],
    a_Seps: string[] =
        DEFAULT_CONFIG.defaultSeps
): string {

    const a_LinesAll =
        s_Input.split('\n')

    const a_Blocks = blocks_Split(
        a_LinesAll,
        a_Patterns
    )

    const a_LinesResult = [...a_LinesAll]

    for(const a_Block of a_Blocks) {

        const a_Aligned = block_Process(
            a_Block,
            a_LinesAll,
            a_Patterns,
            a_Seps
        )

        for(let i = 0; i < a_Block.length; i++) {
            a_LinesResult[a_Block[i]] =
                a_Aligned[i]
        }
    }

    return a_LinesResult.join('\n')
}
