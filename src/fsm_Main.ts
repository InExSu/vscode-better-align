// ============================================================
// fsm_Main.ts
// Deterministic structural alignment engine
// Idempotent: F(F(x)) = F(x)
// ============================================================

// ── 1. TYPES ──────────────────────────────────────────────────

export type Pattern = string

export type PatternMatch = {
    pos    : number
    pattern: string
}

export type SepMatch = {
    sep: string
    idx: number
}

export type Segment = {
    key  : string
    val  : string
    sep  : string
    after: string
}

export type LineSegment = {
    key   : string
    anchor: string
    val   : string
    sep   : string
    after : string
    tail  : string
}

export type Widths = {
    widths_Key: number[]
    widths_Val: number[]
}

export type LineDecomposed = {
    indent: string
    body  : string
}

export type DepthState = {
    braceDepth  : number
    parenDepth  : number
    bracketDepth: number
    angleDepth  : number
}

export type LanguageRules = {
    lineComments    : string[]       
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]       
    alignChars      : string[]       
}

// ── 2. CONFIG ─────────────────────────────────────────────────

export const DEFAULT_CONFIG = {

    defaultAlignChars: [
        '===', 
        '!==', 
        '<=>', 
        '=>' , 
        '->' , 
        '==' , 
        '!=' , 
        '>=' , 
        '<=' , 
        '+=',
        '-=',
        '*=',
        '/=',
        '%=',
        '**=',
        ':',
        '=',
        ',',
    ],

    defaultSeps: [
        '; ', 
        ', ', 
    ]   , 
}

// ── 3. LANGUAGE RULES ─────────────────────────────────────────

export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments    : ['//']                          , 
    blockComments   : [{ start: '/*'                  , end: '*/' }], 
    stringDelimiters: ['"'                            , "'", '`'], 
    alignChars      : DEFAULT_CONFIG.defaultAlignChars, 
}

export function languageRules_Detect(
    _langId          : string, 
    defaultAlignChars: string[]
): LanguageRules {

    return {
        ...DEFAULT_LANGUAGE_RULES,
        alignChars: defaultAlignChars,
    }
}

// ── 4. LINE DECOMPOSITION ─────────────────────────────────────

export function line_Decompose(
    line: string
): LineDecomposed {

    let i = 0

    while(
        i < line.length &&
        (
            line[i] === ' ' ||
            line[i] === '\t'  
        )
    ) {
        i++
    }

    return {
        indent: line.slice(0 , i),
        body  : line.slice(i),    
    }
}

// ── 5. DEPTH TRACKING ─────────────────────────────────────────

function depth_Create(): DepthState {

    return {
        braceDepth  : 0, 
        parenDepth  : 0, 
        bracketDepth: 0, 
        angleDepth  : 0, 
    }
}

function depth_IsTopLevel(
    d: DepthState
): boolean {

    return (
        d.parenDepth   === 0 &&
        d.bracketDepth === 0 &&
        d.angleDepth   === 0   
    )
}

function depth_Advance(
    d : DepthState,
    ch: string     
): void {

    switch(ch) {

        case '{':
            d.braceDepth++
            return

        case '}':
            d.braceDepth =
                Math.max(0, d.braceDepth - 1)
            return

        case '(':
            d.parenDepth++
            return

        case ')':
            d.parenDepth =
                Math.max(0, d.parenDepth - 1)
            return

        case '[':
            d.bracketDepth++
            return

        case ']':
            d.bracketDepth =
                Math.max(0, d.bracketDepth - 1)
            return

        case '<':
            d.angleDepth++
            return

        case '>':
            d.angleDepth =
                Math.max(0, d.angleDepth - 1)
            return
    }
}

// ── 6. MASKING ────────────────────────────────────────────────

// function mask_StringsAndComments(
//     line: string
// ): string {

//     let result = ''

//     let i = 0

//     let inString: string | null = null

//     while(i < line.length) {

//         const ch = line[i]

//         if(inString !== null) {

//             if(ch === '\\') {
//                 result += '\0\0'
//                 i      += 2     
//                 continue
//             }

//             result += '\0'

//             if(ch === inString) { inString = null }

//             i++
//             continue
//         }

//         if(
//             ch === '"' || 
//             ch === '\'' ||
//             ch === '`'    
//         ) {
//             inString = ch
//             result += '\0'
//             i++
//             continue
//         }

//         if(
//             line.startsWith('//', i)
//         ) {
//             result += '\0'.repeat(
//                 line.length - i
//             )
//             break
//         }

//         result += ch
//         i++
//     }

//     return result
// }

function mask_StringsAndComments(
    line: string
): string {

    enum State {
        Normal = 0,
        InString, 
        InEscape, 
    }

    let result= ''          
    let state = State.Normal
    let quoteChar: string | null = null
    let i = 0

    while(i < line.length) {
        const ch = line[i]

        switch(state) {
            case State.Normal:
                // Комментарий?
                if(line.startsWith('//', i)) {
                    result += '\0'.repeat(line.length - i)
                    return result
                }

                // Обычный символ или начало строки?
                switch(ch) {
                    case '"' : 
                    case '\'': 
                    case '`' : 
                        state    = State.InString
                        quoteChar= ch            
                        result += '\0'
                        i++
                        break
                    default:
                        result += ch
                        i++
                        break
                }
                break

            case State.InString:
                switch(ch) {
                    case '\\':
                        state = State.InEscape
                        result += '\0\0'
                        i      += 2     
                        break
                    default:
                        switch(ch === quoteChar) {
                            case true:
                                state    = State.Normal
                                quoteChar= null        
                                result += '\0'
                                i++
                                break
                            case false:
                                result += '\0'
                                i++
                                break
                        }
                        break
                }
                break

            case State.InEscape:
                state = State.InString
                break
        }
    }

    return result
}

// ── 7. PATTERN MATCHING ───────────────────────────────────────

function pattern_MatchAt(
    line    : string,  
    pos     : number,  
    patterns: Pattern[]
): string | null {

    for(const p of patterns) {

        if(line.startsWith(p, pos)) { return p }
    }

    return null
}

export function patterns_Find(
    line         : string,   
    patterns     : Pattern[],
    initialDepth?: DepthState
): PatternMatch[] {

    const masked = mask_StringsAndComments(line)

    const sorted = [...patterns]
        .sort((a, b) => b.length - a.length)

    const depth = initialDepth || depth_Create()

    const result: PatternMatch[] = []

    let i = 0

    while(i < masked.length) {

        const matched =
            pattern_MatchAt(
                masked, 
                i     , 
                sorted
            )

        if(matched !== null) {

            const isInsideParens = depth.parenDepth > 0

            if(
                matched === ':' &&
                !isInsideParens &&
                i > 0 &&
                masked[i - 1] === ')'
            ) {
                depth_Advance(depth, masked[i])
                i++
                continue
            }

            if(!depth_IsTopLevel(depth) && !isInsideParens) {
                depth_Advance(depth, masked[i])
                i++
                continue
            }

            result.push({
                pos    : i      , 
                pattern: matched, 
            })

            for(const ch of matched) { depth_Advance(depth, ch) }

            i += matched.length
            continue
        }

        depth_Advance(depth, masked[i])

        i++
    }

    return result
}


export function patterns_ToKey(
    pats: PatternMatch[]
): string {

    return pats
        .map(p => p.pattern)
        .join('\0')
}

// ── 8. SEPARATORS ─────────────────────────────────────────────

function sep_Find(
    s   : string, 
    from: number, 
    seps: string[]
): SepMatch | null {

    let best: SepMatch | null = null

    for(const sep of seps) {

        const idx = s.indexOf(sep, from)

        if(
            idx !== -1 &&
            (
                best === null ||
                idx < best.idx
            )
        ) {

            best = {
                sep,
                idx,
            }
        }
    }

    return best
}

// ── 9. SEGMENT PARSING ────────────────────────────────────────

function segment_Parse(
    line: string, 
    from: number, 
    to  : number, 
    seps: string[]
): Segment {

    const raw =
        line
            .slice(from, to)
            .trim()

    const found =
        sep_Find(raw, 0, seps)

    if(found === null) {

        return {
            key: '',
            val: raw,
            sep: '',
            after: '',
        }
    }

    return {

        key: '',

        val:
            raw
                .slice(0, found.idx)
                .trim(),

        sep: found.sep,

        after:
            raw
                .slice(found.idx + found.sep.length)
                .trim(),
    }
}

function segments_OfLine(
    line : string,        
    pats : PatternMatch[],
    count: number,        
    seps : string[]       
): LineSegment[] {

    const result: LineSegment[] = []

    let endPrev = 0

    for(let j = 0; j < count; j++) {

        const pat = pats[j]

        const key =
            line
                .slice(endPrev, pat.pos)
                .trim()

        const anchor = pat.pattern

        endPrev =
            pat.pos +
            pat.pattern.length

        const nextPos =
            j + 1 < count
                ? pats[j + 1].pos
                : line.length

        const seg =
            segment_Parse(
                line   , 
                endPrev, 
                nextPos, 
                seps
            )

        endPrev = nextPos

        result.push({
            key   , 
            anchor, 
            val  : seg.val  , 
            sep  : seg.sep  , 
            after: seg.after, 
            tail : ''       , 
        })
    }

    if(result.length > 0) {

        result[result.length - 1].tail =
            line.slice(endPrev)
    }

    return result
}

// ── 10. WIDTHS ────────────────────────────────────────────────

function widths_Measure(
    lines           : LineDecomposed[],
    patterns_PerLine: PatternMatch[][],
    count           : number,          
    seps            : string[]         
): Widths {

    const widths_Key =
        new Array(count).fill(0)

    const widths_Val =
        new Array(count).fill(0)

    for(let r = 0; r < lines.length; r++) {

        const segs =
            segments_OfLine(
                lines[r].body      , 
                patterns_PerLine[r], 
                count              , 
                seps
            )

        for(let j = 0; j < count; j++) {

            widths_Key[j] =
                Math.max(
                    widths_Key[j],
                    segs[j].key.length
                )

            widths_Val[j] =
                Math.max(
                    widths_Val[j],
                    segs[j].val.length
                )
        }
    }

    return {
        widths_Key,
        widths_Val,
    }
}

// ── 11. RENDER ────────────────────────────────────────────────

function segment_Render(
    seg      : LineSegment,      
    width_Key: number     ,      
    width_Val: number     ,      
    is_Last  : boolean    ,      
    singlePat: boolean    = false
): string {

    const keyPad = singlePat ? width_Key + 1 : width_Key

    const rendered =

        seg.key.padEnd(keyPad) +
        seg.anchor +
        ' ' +
        seg.val.padEnd(width_Val) +
        seg.sep +
        seg.after

    return is_Last
        ? rendered + seg.tail
        : rendered
}

function line_Render(
    line      : string        ,      
    pats      : PatternMatch[],      
    count     : number        ,      
    widths_Key: number[]      ,      
    widths_Val: number[]      ,      
    seps      : string[]      ,      
    singlePat : boolean       = false
): string {

    const segs =
        segments_OfLine(
            line , 
            pats , 
            count, 
            seps
        )

    return segs
        .map((seg, j) =>
            segment_Render(
                seg          , 
                widths_Key[j], 
                widths_Val[j], 
                j === count - 1,
                singlePat
            )
        )
        .join('')
}

// ── 12. BLOCK PROCESSING ──────────────────────────────────────

function block_Process(
    indices  : number[], 
    lines_All: string[], 
    patterns : Pattern[],
    seps     : string[]  
): string[] {

    const lines =
        indices.map(i => lines_All[i])

    if(indices.length === 1) { return lines }

    const decomposed =
        lines.map(line_Decompose)

    let depth = depth_Create()

    const patterns_PerLine =
        decomposed.map(d => {
            const pats = patterns_Find(d.body, patterns, depth)

            for(let i = 0; i < d.body.length; i++) {
                depth_Advance(depth, d.body[i])
            }

            return pats
        })

    const hasPats = patterns_PerLine.some(p => p.length > 0)
    if(!hasPats) {
        return lines
    }

    const linesWithPats: number[] = []
    const patsWithPats: PatternMatch[][] = []

    patterns_PerLine.forEach((pats, i) => {
        if(pats.length > 0) {
            linesWithPats.push(i)
            patsWithPats.push(pats)
        }
    })

    const patCounts = patsWithPats.map(p => p.length)
    const count = Math.min(...patCounts)
    const allSingle = patCounts.every(c => c === 1)
    const hasMultiCharPat = patsWithPats.some(p => p[0].pattern.length > 1)
    const singlePat = allSingle && hasMultiCharPat

    if(count === 0) { return lines }

    const patsTruncated = patsWithPats.map(p => p.slice(0, count))

    if(count === 0) { return lines }

    const linesWithPatsBodies = linesWithPats.map(i => decomposed[i])

    const {
        widths_Key,
        widths_Val,
    } =
        widths_Measure(
            linesWithPatsBodies, 
            patsWithPats       , 
            count              , 
            seps
        )

    const result = [...lines]

    patsWithPats.forEach((pats, idx) => {
        const origIdx= linesWithPats[idx] 
        const line   = decomposed[origIdx]

        const rendered =
            line_Render(
                line.body , 
                pats      , 
                count     , 
                widths_Key, 
                widths_Val, 
                seps      , 
                singlePat
            )

        result[origIdx] = line.indent + rendered
    })

    return result
}

// ── 13. BLOCK SPLITTING ───────────────────────────────────────

type BlockState = {

    blocks: number[][]
    block_Current: number[]
    key_Current: string | null
    prevParenDepth: number
    prevBraceDepth: number
}

function blockState_FlushCurrent(
    state: BlockState
): BlockState {

    if(state.block_Current.length === 0) { return state }

    return {
        blocks: [
            ...state.blocks,
            state.block_Current,
        ],

        block_Current: [],

        key_Current: null,

        prevParenDepth: state.prevParenDepth,

        prevBraceDepth: state.prevBraceDepth,
    }
}

function blockState_OnEmpty(
    state: BlockState
): BlockState {

    return blockState_FlushCurrent(state)
}

function commonPrefix(a: string, b: string): string {
    let i = 0
    while(i < a.length && i < b.length && a[i] === b[i]) {
        i++
    }
    return a.slice(0, i)
}

function blockState_OnLine(
    state     : BlockState,
    i         : number,    
    key       : string,    
    parenDepth: number,    
    braceDepth: number     
): BlockState {

    const prefix = commonPrefix(key, state.key_Current || '')

    const parenDepthDecreased = parenDepth < state.prevParenDepth

    const prevEndsWithBrace = state.key_Current?.includes('{')
    const braceDepthDecreased = braceDepth < (state.prevBraceDepth || 0)

    const firstAnchorOf = (k: string) => k.split('\0')[0] || ''
    const currentFirst = firstAnchorOf(key)
    const prevFirst = firstAnchorOf(state.key_Current || '')
    const firstAnchorsMatch = currentFirst === prevFirst && currentFirst !== ''

    const prevEndsWithOpenBrace = (state.key_Current || '').endsWith('{')
    const prevHasEqualsAssignment = (state.key_Current || '').includes('=')
    const currentHasColonOnly = key.includes(':') && !key.includes('=')
    const isTopLevel = parenDepth === 0 && (state.prevParenDepth || 0) === 0



    const shouldSplitFromAssignment = prevHasEqualsAssignment && currentHasColonOnly && isTopLevel

    const shouldMerge =
        firstAnchorsMatch &&
        !shouldSplitFromAssignment &&
        !parenDepthDecreased &&
        !braceDepthDecreased &&
        !prevEndsWithBrace &&
        (state.prevParenDepth > 0 || parenDepth >= 0)

    if(shouldMerge) {

        return {
            ...state,

            block_Current: [
                ...state.block_Current,
                i,
            ],

            prevParenDepth: parenDepth,

            prevBraceDepth: braceDepth,
        }
    }

    const flushed =
        blockState_FlushCurrent(state)

    return {
        ...flushed,

        block_Current: [i],

        key_Current: key,

        prevParenDepth: parenDepth,

        prevBraceDepth: braceDepth,
    }
}

function blocks_Split(
    lines_All: string[],
    patterns : Pattern[]
): number[][] {

    let state: BlockState = {

        blocks: [],
        block_Current: [],
        key_Current: null,
        prevParenDepth: 0,
        prevBraceDepth: 0,
    }

    for(let i = 0; i < lines_All.length; i++) {

        if(lines_All[i].trim() === '') {

            state =
                blockState_OnEmpty(state)

            continue
        }

        const decomposed =
            line_Decompose(lines_All[i])

        const key =
            patterns_ToKey(
                patterns_Find(
                    decomposed.body,
                    patterns
                )
            )



        const lineParenDepth =
            (decomposed.body.match(/\(/g) || []).length -
            (decomposed.body.match(/\)/g) || []).length

        const lineBraceDepth =
            (decomposed.body.match(/\{/g) || []).length -
            (decomposed.body.match(/\}/g) || []).length

        const cumulativeParenDepth =
            state.prevParenDepth + lineParenDepth

        const cumulativeBraceDepth =
            (state.prevBraceDepth || 0) + lineBraceDepth

        state =
            blockState_OnLine(
                state               , 
                i                   , 
                key                 , 
                cumulativeParenDepth, 
                cumulativeBraceDepth
            )
    }

    return blockState_FlushCurrent(state)
        .blocks
}

// ── 14. ENTRY POINT ───────────────────────────────────────────

export function text_AlignByBlocks(
    input   : string   , 
    patterns: Pattern[], 
    seps    : string[] = 
        DEFAULT_CONFIG.defaultSeps
): string {

    const lines_All =
        input.split('\n')

    const blocks =
        blocks_Split(
            lines_All,
            patterns
        )

    const lines_Result =
        [...lines_All]

    for(const block of blocks) {

        const aligned =
            block_Process(
                block    , 
                lines_All, 
                patterns , 
                seps
            )

        for(let idx = 0; idx < block.length; idx++) {

            lines_Result[block[idx]] =
                aligned[idx]
        }
    }

    return lines_Result.join('\n')
}
