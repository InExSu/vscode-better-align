// ============================================================
// fsm_Main.ts - Pure Logic FSM Module
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// Alignment model: block-local key/val alignment per doc §2
// ============================================================

// ── 1. SHARED TYPES ───────────────────────────────────────────

export type LanguageRules = {
    lineComments:     string[]
    blockComments:    { start: string; end: string }[]
    stringDelimiters:  string[]      
    alignChars      :        string[]
}

export type LineBlock = { startLine: number; lines: string[] }

export type ParsedLine = {
    raw             :               string
    tokens          :            Token[]  
    markers         :           Marker[]  
    originalMarkers?:  Marker[]           
}

export type Token =
    |{  kind:  'code'   ;    text:  string }
    |{  kind:  'string' ;  text:  string }
    |{  kind:  'comment'; text:  string }

export type Marker = { symbol: string; startCol: number }

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
export const ok  = <T,>(v: T): Result<T>         => ({ ok: true,  value: v })
export const err = <E,>(e: E): Result<never, E>  => ({ ok: false, error: e })

// ── 2. CONFIG ──────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
    b_Debug:            false,
    defaultAlignChars:  ['===', '!==', '<=>', '=>', '->', '==', '!=', '>=', '<=',
                         '+=',  '-=',  '*=',  '/=', '%=', '**=', ':', '{', '=', ','],
    defaultSeps:        ['; ', ', '],
    maxBlockSize        :        500  , 
    preserveComments    :    true     , 
    preserveStrings     :     true    , 
    alignMultilineBlocks:  false      , 
    skipTemplates       :       true  , 
    greedyMatch         :         true, 
    minColumns          :          1  , 
    maxSpaces           :           40, 
    testData:           {} as Record<string, unknown>,
}

// ── 3. LANGUAGE RULES ──────────────────────────────────────────

export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments:     ['//'],
    blockComments:    [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars:       DEFAULT_CONFIG.defaultAlignChars,
}

export const LANGUAGE_RULES: Record<string, LanguageRules> = {
    typescript: {  lineComments:  ['//'],  blockComments:  [{  start:  '/*',  end:  '*/' }],  stringDelimiters:  ['"',  "'",  '`'],  alignChars:  DEFAULT_CONFIG.defaultAlignChars }, 
    javascript: {  lineComments:  ['//'],  blockComments:  [{  start:  '/*',  end:  '*/' }],  stringDelimiters:  ['"',  "'",  '`'],  alignChars:  DEFAULT_CONFIG.defaultAlignChars }, 
    python:     { lineComments: ['#'],  blockComments: [],                            stringDelimiters: ['"', "'"],      alignChars: DEFAULT_CONFIG.defaultAlignChars },
    rust:       { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"'],            alignChars: DEFAULT_CONFIG.defaultAlignChars },
    go : {  lineComments:  ['//'],  blockComments:  [{  start:  '/*'  ,  end:  '*/' }],  stringDelimiters:  ['"',  '`'],        alignChars:  DEFAULT_CONFIG.defaultAlignChars }, 
    lua: {  lineComments:  ['--'],  blockComments:  [{  start:  '--[[',  end:  ']]' }],  stringDelimiters:  ['"',  "'"],      alignChars  :  DEFAULT_CONFIG.defaultAlignChars }, 
    sql: {  lineComments:  ['--'],  blockComments:  [{  start:  '/*'  ,  end:  '*/' }],  stringDelimiters:  ['"',  "'"],        alignChars:  DEFAULT_CONFIG.defaultAlignChars }, 
}

export function languageRules_Detect(s_LangId: string, a_DefaultAlignChars: string[]): LanguageRules {
    return LANGUAGE_RULES[s_LangId]
        ? { ...LANGUAGE_RULES[s_LangId], alignChars: a_DefaultAlignChars }
        : { ...DEFAULT_LANGUAGE_RULES,   alignChars: a_DefaultAlignChars }
}

// ── 4. PRIMITIVE PATTERN MATCHING (§2.2) ──────────────────────

/** Жадный поиск: возвращает первый паттерн из списка, начинающийся в pos. */
function pattern_MatchAt(s_Line: string, i_Pos: number, a_Patterns: string[]): string | null {
    for (const s_Pat of a_Patterns)
        {if (s_Line.startsWith(s_Pat, i_Pos)) {return s_Pat}}
    return null
}

/**
 * Вектор признаков строки P(f) — жадный поиск слева направо,
 * непересекающиеся вхождения. (§2.2)
 */
function patternMatches_Find(s_Line: string, a_Patterns: string[]): PatternMatch[] {
    // Сортируем по убыванию длины для корректного жадного матча
    const a_Sorted = [...a_Patterns].sort((a, b) => b.length - a.length)
    const a_Result: PatternMatch[] = []
    let i = 0
    while (i < s_Line.length) {
        const s_Matched = pattern_MatchAt(s_Line, i, a_Sorted)
        if (s_Matched) {
            a_Result.push({ i_Pos: i, s_Pattern: s_Matched })
            i += s_Matched.length
        } else {
            i++
        }
    }
    return a_Result
}

/** Ключ блока: сериализованный вектор признаков строки. */
function patternMatches_ToKey(a_Pats: PatternMatch[]): string {
    return a_Pats.map(p => p.s_Pattern).join('\0')
}

/** Ищет первый разделитель из списка seps начиная с позиции i_From. */
function sep_Find(s_Str: string, i_From: number, a_Seps: string[]): SepMatch | null {
    let o_Best: SepMatch | null = null
    for (const s_Sep of a_Seps) {
        const i_Idx = s_Str.indexOf(s_Sep, i_From)
        if (i_Idx !== -1 && (o_Best === null || i_Idx < o_Best.i_Idx))
            {o_Best = { s_Sep, i_Idx }}
    }
    return o_Best
}

// ── 5. SEGMENT PARSING (§2.3) ─────────────────────────────────

/**
 * Парсит фрагмент строки [i_From..i_To) на val + sep + after.
 * val — всё до первого sep (trimEnd), after — остаток после sep.
 */
function segment_Parse(
    s_Line:   string  , 
    i_From:   number  , 
    i_To  :     number, 
    a_Seps:  string[]
): SegmentParsed {
    const s_Raw = s_Line.slice(i_From, i_To)
    const o_Found = sep_Find(s_Raw, 0, a_Seps)
    if (!o_Found) {return { s_Val: s_Raw.trimEnd(), s_Sep: '', s_After: '' }}
    return {
        s_Val:   s_Raw.slice(0, o_Found.i_Idx).trimEnd(),
        s_Sep  :    o_Found.s_Sep                                  , 
        s_After:  s_Raw.slice(o_Found.i_Idx + o_Found.s_Sep.length), 
    }
}

/**
 * Разбивает строку на сегменты по найденным паттернам.
 * Каждый сегмент: key (до якоря) + anchor + val (до sep/след. якоря) + sep + after.
 * Последний сегмент получает tail (всё после последнего якоря).
 */
function segments_OfLine(
    s_Line :     string        , 
    a_Pats :     PatternMatch[], 
    i_Count:    number         , 
    a_Seps:    string[]
): LineSegment[] {
    const a_Result: LineSegment[] = []
    let i_EndPrev = 0

    for (let j = 0; j < i_Count; j++) {
        const o_Pat    = a_Pats[j]
        const s_Key    = s_Line.slice(i_EndPrev, o_Pat.i_Pos).trimEnd()
        const s_Anchor=  o_Pat.s_Pattern                     
        i_EndPrev     =  o_Pat.i_Pos + o_Pat.s_Pattern.length

        const i_PosNext = j + 1 < i_Count ? a_Pats[j + 1].i_Pos : s_Line.length
        const o_Seg     = segment_Parse(s_Line, i_EndPrev, i_PosNext, a_Seps)
        i_EndPrev       = i_PosNext

        a_Result.push({ s_Key: s_Key, s_Anchor: s_Anchor, s_Val: o_Seg.s_Val, s_Sep: o_Seg.s_Sep, s_After: o_Seg.s_After, s_Tail: '' })
    }

    if (a_Result.length > 0)
        {a_Result[a_Result.length - 1].s_Tail = s_Line.slice(i_EndPrev)}

    return a_Result
}

// ── 6. WIDTH MEASUREMENT (§2.3) ───────────────────────────────

/**
 * Вычисляет W_key[j] и W_val[j] — максимальные ширины по всем строкам блока.
 */
function widths_Measure(
    a_Lines          :           string[], 
    a_PatternsPerLine:  PatternMatch[][] , 
    i_Count          :           number  , 
    a_Seps:           string[]
): WidthsResult {
    const a_WidthsKey=  new Array<number>(i_Count).fill(0)
    const a_WidthsVal=  new Array<number>(i_Count).fill(0)

    for (let r = 0; r < a_Lines.length; r++) {
        const a_Segs = segments_OfLine(a_Lines[r], a_PatternsPerLine[r], i_Count, a_Seps)
        for (let j = 0; j < i_Count; j++) {
            a_WidthsKey[j]=  Math.max(a_WidthsKey[j],  a_Segs[j].s_Key.length)
            a_WidthsVal[j]=  Math.max(a_WidthsVal[j],  a_Segs[j].s_Val.length)
        }
    }

    return { a_WidthsKey, a_WidthsVal }
}

// ── 7. RENDER (§2.3) ──────────────────────────────────────────

/**
 * Рендерит один сегмент:
 * padEnd(key, W_key) + anchor + ' ' + padEnd(val, W_val) + sep + after [+ tail если последний]
 */
function segment_Render(
    o_Seg :       LineSegment, 
    i_WKey:      number      , 
    i_WVal:      number      , 
    b_IsLast:   boolean
): string {
    const s_Rendered =
        o_Seg.s_Key.padEnd(i_WKey) + o_Seg.s_Anchor + ' ' +
        o_Seg.s_Val.padEnd(i_WVal) + o_Seg.s_Sep    + o_Seg.s_After
    return b_IsLast ? s_Rendered + o_Seg.s_Tail : s_Rendered
}

/** Рендерит строку целиком по всем сегментам. */
function line_Render(
    s_Line     :       string        , 
    a_Pats     :       PatternMatch[], 
    i_Count    :      number         , 
    a_WidthsKey:  number[]           , 
    a_WidthsVal:  number[]           , 
    a_Seps:      string[]
): string {
    const a_Segs = segments_OfLine(s_Line, a_Pats, i_Count, a_Seps)
    return a_Segs
        .map((o_Seg, j) => segment_Render(o_Seg, a_WidthsKey[j], a_WidthsVal[j], j === i_Count - 1))
        .join('')
}

// ── 8. BLOCK PROCESSING (§2.1, §2.3) ─────────────────────────

/**
 * Обрабатывает один блок строк с одинаковым вектором признаков.
 * Блок длиной 1 не выравнивается (возвращается как есть).
 */
function block_Process(
    a_Indices :   number[], 
    a_LinesAll:  string[] , 
    a_Patterns:  string[] , 
    a_Seps:     string[]
): string[] {
    const a_Lines = a_Indices.map(i => a_LinesAll[i])
    if (a_Indices.length === 1) {return a_Lines}

    const a_PatternsPerLine = a_Lines.map(s_L => patternMatches_Find(s_L, a_Patterns))
    const i_Count = a_PatternsPerLine[0].length
    if (i_Count === 0) {return a_Lines}

    const { a_WidthsKey, a_WidthsVal } = widths_Measure(a_Lines, a_PatternsPerLine, i_Count, a_Seps)

    return a_Lines.map((s_Line, r) =>
        line_Render(s_Line, a_PatternsPerLine[r], i_Count, a_WidthsKey, a_WidthsVal, a_Seps)
    )
}

// ── 9. BLOCK SPLITTING FSM (§2.1) ─────────────────────────────

/**
 * Разбивает массив строк на блоки по совпадению вектора признаков P(f).
 * Пустые строки разрывают блок. Строки с отличным вектором образуют блок длины 1.
 * Реализовано как конечный автомат с guard clauses.
 */
function blocks_Split(a_LinesAll: string[], a_Patterns: string[]): number[][] {
    let o_State: BlockSplitState = { a_Blocks: [], a_BlockCurrent: [], s_KeyCurrent: null }

    for (let i = 0; i < a_LinesAll.length; i++) {
        if (a_LinesAll[i].trim() === '') {
            o_State = blockSplitState_OnEmpty(o_State)
            continue
        }
        const s_Key = patternMatches_ToKey(patternMatches_Find(a_LinesAll[i], a_Patterns))
        o_State = blockSplitState_OnLine(o_State, i, s_Key)
    }

    return blockSplitState_Flush(o_State).a_Blocks
}

function blockSplitState_Flush(o_State: BlockSplitState): BlockSplitState {
    if (o_State.a_BlockCurrent.length === 0) {return o_State}
    return {
        a_Blocks:       [...o_State.a_Blocks, o_State.a_BlockCurrent],
        a_BlockCurrent:  []    , 
        s_KeyCurrent  :    null, 
    }
}

function blockSplitState_OnEmpty(o_State: BlockSplitState): BlockSplitState {
    return blockSplitState_Flush(o_State)
}

function blockSplitState_OnLine(o_State: BlockSplitState, i: number, s_Key: string): BlockSplitState {
    if (s_Key === o_State.s_KeyCurrent)
        {return { ...o_State, a_BlockCurrent: [...o_State.a_BlockCurrent, i] }}
    const o_Flushed = blockSplitState_Flush(o_State)
    return { ...o_Flushed, a_BlockCurrent: [i], s_KeyCurrent: s_Key }
}

// ── 10. MAIN FSM API ──────────────────────────────────────────

export interface FSMContext {
    lines           :            string[]                                
    alignChars      :       string[]                                     
    seps            :             string[]                               
    preserveStrings :  boolean  // зарезервировано для будущей маскировки
    preserveComments:  boolean // зарезервировано                        
    maxSpaces       :        number   // зарезервировано                 
}

export interface FSMResult {
    alignedLines  :   string[]
    changesApplied:  boolean  
}

export type FSMState =
    | 'blocks_Split'
    | 'blocks_Process'
    | 'result_Emit'

interface FSMStateContext {
    a_LinesAll   :     string[]    
    a_AlignChars :   string[]      
    a_Seps       :         string[]
    a_Blocks     :       number[][]
    a_LinesResult:  string[]       
    b_Changed    :      boolean    
}

/**
 * Главная машина состояний выравнивания.
 * States: blocks_Split → blocks_Process → result_Emit
 */
export function a_FSM_Main(o_Ctx: FSMContext): FSMResult {
    const o_Sc: FSMStateContext = {
        a_LinesAll   :     o_Ctx.lines   , 
        a_AlignChars :   o_Ctx.alignChars, 
        a_Seps       :         o_Ctx.seps, 
        a_Blocks     :       []          , 
        a_LinesResult:  [...o_Ctx.lines] , 
        b_Changed    :      false        , 
    }

    let s_State: FSMState = 'blocks_Split'

    outerLoop: while (true) {
        switch (s_State) {
            case 'blocks_Split'  :    s_State=  fn_BlocksSplit(o_Sc)  ;   break
            case 'blocks_Process':  s_State  =  fn_BlocksProcess(o_Sc); break
            case 'result_Emit':     break outerLoop                            
            default           :                fn_Unreachable(s_State as never)
        }
    }

    return { alignedLines: o_Sc.a_LinesResult, changesApplied: o_Sc.b_Changed }
}

function fn_BlocksSplit(o_Sc: FSMStateContext): FSMState {
    o_Sc.a_Blocks = blocks_Split(o_Sc.a_LinesAll, o_Sc.a_AlignChars)
    return 'blocks_Process'
}

function fn_BlocksProcess(o_Sc: FSMStateContext): FSMState {
    for (const a_Block of o_Sc.a_Blocks) {
        const a_Aligned = block_Process(a_Block, o_Sc.a_LinesAll, o_Sc.a_AlignChars, o_Sc.a_Seps)
        for (let i = 0; i < a_Block.length; i++) {
            if (o_Sc.a_LinesResult[a_Block[i]] !== a_Aligned[i]) {
                o_Sc.a_LinesResult[a_Block[i]]=  a_Aligned[i]
                o_Sc.b_Changed                =  true        
            }
        }
    }
    return 'result_Emit'
}

function fn_Unreachable(s_State: never): never {
    throw new Error(`Unhandled FSM state: ${s_State}`)
}

// ── 11. STRING SANITIZER ──────────────────────────────────────
// Зарезервировано: маскирует строковые литералы и комментарии
// для безопасного поиска паттернов внутри кода.

export interface SanitizeFlags {
    b_PreserveStrings :   boolean
    b_PreserveComments:  boolean 
}

export function lines_Sanitize(a_Lines: string[], o_Flags: SanitizeFlags): string[] {
    return a_Lines.map(s_Line => fn_SanitizeLine(s_Line, o_Flags))
}

function fn_SanitizeLine(s_Line: string, o_Flags: SanitizeFlags): string {
    let s_Result=  ''
    let i_Idx   =  0 

    while (i_Idx < s_Line.length)     { 
        if (o_Flags.b_PreserveStrings){ 
            let b_MatchedStr = false
            for (const s_Delim of ['"', "'", '`']) {
                if (!s_Line.startsWith(s_Delim, i_Idx)) {continue}
                const i_End = fn_FindStringEnd(s_Line, i_Idx, s_Delim)
                s_Result    += '\0'.repeat(i_End - i_Idx)
                i_Idx       =  i_End
                b_MatchedStr=  true 
                break
            }
            if (b_MatchedStr) {continue}
        }

        if (o_Flags.b_PreserveComments && s_Line.startsWith('/*', i_Idx)) {
            const i_EndIdx = s_Line.indexOf('*/', i_Idx + 2)
            const i_End    = i_EndIdx >= 0 ? i_EndIdx + 2 : s_Line.length
            s_Result += '\0'.repeat(i_End - i_Idx)
            i_Idx     = i_End
            continue
        }

        if (o_Flags.b_PreserveComments) {
            if (s_Line.startsWith('//', i_Idx) || s_Line.startsWith('#', i_Idx)) {
                s_Result += '\0'.repeat(s_Line.length - i_Idx)
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
    while (i_Idx < s_Line.length) {
        if (s_Line[i_Idx] === '\\') { i_Idx += 2; continue }
        if (s_Line.startsWith(s_Delim, i_Idx)) {return i_Idx + s_Delim.length}
        i_Idx++
    }
    return s_Line.length
}

// ── 12. BLOCK FINDING (legacy — по отступу) ───────────────────
// Сохранён для обратной совместимости с VSCode-расширением.

enum GroupingState {
    WaitingForStart=  'WaitingForStart', 
    Accumulating   =  'Accumulating'   , 
}

export function blocks_Find(
    a_RawLines   :     string[]        , 
    i_StartOffset:  number             , 
    o_Rules      :        LanguageRules, 
    i_MaxBlockSize: number
): LineBlock[] {
    const a_Blocks:   LineBlock[] = []
    let   s_State                  = GroupingState.WaitingForStart
    let   o_CurBlock: LineBlock    = { startLine: 0, lines: [] }

    const fn_Flush = (): void => {
        if (o_CurBlock.lines.length > 0) {a_Blocks.push(o_CurBlock)}
        o_CurBlock = { startLine: 0, lines: [] }
    }

    const fn_IsBlankOrComment = (s_Raw: string): boolean => {
        const s_Trimmed = s_Raw.trim()
        return s_Trimmed === '' || o_Rules.lineComments.some(s_Lc => s_Trimmed.startsWith(s_Lc))
    }

    for (let i_Idx = 0; i_Idx < a_RawLines.length; i_Idx++) {
        const s_Raw = a_RawLines[i_Idx]

        switch (s_State) {
            case GroupingState.WaitingForStart:
                if (fn_IsBlankOrComment(s_Raw)) {continue}
                o_CurBlock = { startLine: i_StartOffset + i_Idx, lines: [s_Raw] }
                s_State    = GroupingState.Accumulating
                break

            case GroupingState.Accumulating:
                if (fn_IsBlankOrComment(s_Raw)) {
                    fn_Flush()
                    s_State = GroupingState.WaitingForStart
                    continue
                }
                if (o_CurBlock.lines.length >= i_MaxBlockSize) {
                    fn_Flush()
                    o_CurBlock = { startLine: i_StartOffset + i_Idx, lines: [s_Raw] }
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

// ── 13. PIPELINE FSM ──────────────────────────────────────────

export type NS = {
    result :   Result<unknown>      
    s_Error:  string                
    config :   typeof DEFAULT_CONFIG
    data   :     NSData             
    [k: string]: unknown
}

export type NSData = {
    editor       :        unknown        
    languageRules:  LanguageRules | false
    blocks       :         LineBlock[]   
    parsedLines  :    ParsedLine[][]     
    alignedLines :   string[][]          
}

export function ns_Error(o_Ns: NS): boolean { return o_Ns.result.ok === false }
export function ns_SetError(o_Ns: NS, s_Error: string): void {
    o_Ns.result =  err(s_Error)
    o_Ns.s_Error=  s_Error     
}

export enum PipelineState {
    Idle          =  'Idle'          , 
    LoadConfig    =  'LoadConfig'    , 
    DetectLanguage=  'DetectLanguage', 
    FindBlocks    =  'FindBlocks'    , 
    ParseLines    =  'ParseLines'    , 
    Align         =  'Align'         , 
    ReplaceText   =  'ReplaceText'   , 
    Done          =  'Done'          , 
    Error         =  'Error'         , 
}

export type Decorator = (o_Ns: NS) => void

export function pipeline_Build(
    fn_ConfigLoad    :       Decorator , 
    fn_LanguageDetect:   Decorator     , 
    fn_BlockFind     :        Decorator, 
    fn_LinesParse    :       Decorator , 
    fn_AlignmentApply:   Decorator     , 
    fn_TextReplace   :      Decorator  , 
    fn_Rwd: (fn: Decorator, o_Ns: NS) => void
): (o_Ns: NS) => void {
    return function pipelineFSM(o_Ns: NS): void {
        let s_State = PipelineState.Idle

        mainLoop: while (true) {
            s_State = fn_ExecutePipelineState(
                s_State, o_Ns,
                fn_ConfigLoad,  fn_LanguageDetect,  fn_BlockFind  ,        
                fn_LinesParse,  fn_AlignmentApply,  fn_TextReplace,  fn_Rwd
            )
            if (s_State === PipelineState.Done || s_State === PipelineState.Error) {break mainLoop}
        }
    }
}

export function fn_ExecutePipelineState(
    s_State          :            PipelineState, 
    o_Ns             :               NS        , 
    fn_ConfigLoad    :      Decorator          , 
    fn_LanguageDetect:  Decorator              , 
    fn_BlockFind     :       Decorator         , 
    fn_LinesParse    :      Decorator          , 
    fn_AlignmentApply:  Decorator              , 
    fn_TextReplace   :     Decorator           , 
    fn_Rwd: (fn: Decorator, o_Ns: NS) => void
): PipelineState {
    switch (s_State) {
        case PipelineState.Idle:           return PipelineState.LoadConfig
        case PipelineState.LoadConfig    :      fn_Rwd(fn_ConfigLoad         ,      o_Ns) ; return ns_Error(o_Ns) ? PipelineState.Error :  PipelineState.DetectLanguage
        case PipelineState.DetectLanguage:  fn_Rwd(fn_LanguageDetect         ,  o_Ns)     ; return ns_Error(o_Ns) ? PipelineState.Error :  PipelineState.FindBlocks    
        case PipelineState.FindBlocks    :      fn_Rwd(fn_BlockFind          ,       o_Ns); return ns_Error(o_Ns) ? PipelineState.Error :  PipelineState.ParseLines    
        case PipelineState.ParseLines    :      fn_Rwd(fn_LinesParse         ,      o_Ns) ; return ns_Error(o_Ns) ? PipelineState.Error :  PipelineState.Align         
        case PipelineState.Align         :           fn_Rwd(fn_AlignmentApply,  o_Ns)     ; return ns_Error(o_Ns) ? PipelineState.Error :  PipelineState.ReplaceText   
        case PipelineState.ReplaceText   :     fn_Rwd(fn_TextReplace         ,     o_Ns)  ; return ns_Error(o_Ns) ? PipelineState.Error :  PipelineState.Done          
        case PipelineState.Done :                                                                   
        case PipelineState.Error:           return s_State                                          
        default                 :                            return fn_Unreachable(s_State as never)
    }
}

// ── 14. COMPATIBILITY API ─────────────────────────────────────
// Публичные функции, используемые VSCode-расширением.

export function line_Parse(s_Raw: string, o_Rules: LanguageRules): ParsedLine {
    const a_AlignChars = [...o_Rules.alignChars].sort((a, b) => b.length - a.length)
    const a_Masked     = lines_Sanitize([s_Raw], { b_PreserveStrings: true, b_PreserveComments: true })
    const a_Pats       = patternMatches_Find(a_Masked[0], a_AlignChars)
    const a_Markers: Marker[] = a_Pats.map(o_Tok => ({ symbol: o_Tok.s_Pattern, startCol: o_Tok.i_Pos }))
    return { raw: s_Raw, tokens: [{ kind: 'code', text: s_Raw }], markers: a_Markers }
}

export function block_Align(a_ParsedLines: ParsedLine[], _i_MaxSpaces: number): string[] {
    if (a_ParsedLines.length < 2) {return a_ParsedLines.map(o_Pl => o_Pl.raw)}

    const o_Ctx: FSMContext = {
        lines:            a_ParsedLines.map(o_Pl => o_Pl.raw),
        alignChars      :        DEFAULT_CONFIG.defaultAlignChars, 
        seps            :              DEFAULT_CONFIG.defaultSeps, 
        preserveStrings :   true                                 , 
        preserveComments:  true                                  , 
        maxSpaces       :         _i_MaxSpaces                   , 
    }

    return a_FSM_Main(o_Ctx).alignedLines
}

export function positionMap_Build(a_ParsedLines: ParsedLine[], i_MaxSpaces: number): Map<string, number> {
    const o_Ctx: FSMContext = {
        lines:            a_ParsedLines.map(o_Pl => o_Pl.raw),
        alignChars      :        DEFAULT_CONFIG.defaultAlignChars, 
        seps            :              DEFAULT_CONFIG.defaultSeps, 
        preserveStrings :   true                                 , 
        preserveComments:  true                                  , 
        maxSpaces       :         i_MaxSpaces                    , 
    }

    const o_FsmResult = a_FSM_Main(o_Ctx)
    const o_Map       = new Map<string, number>()

    for (let i_Line = 0; i_Line < o_FsmResult.alignedLines.length; i_Line++) {
        const s_Orig   =  a_ParsedLines[i_Line].raw       
        const s_Aligned=  o_FsmResult.alignedLines[i_Line]

        for (let i_Mk = 0; i_Mk < a_ParsedLines[i_Line].markers.length; i_Mk++) {
            const o_Marker =  a_ParsedLines[i_Line].markers[i_Mk]
            const i_OrigPos=  o_Marker.startCol                  
            const s_OrigPfx   = s_Orig.slice(0, i_OrigPos)
            const i_AlignedPos = fn_FindAlignedPos(s_Aligned, s_OrigPfx, o_Marker.symbol)

            if (i_AlignedPos > i_OrigPos && i_AlignedPos - i_OrigPos <= i_MaxSpaces)
                {o_Map.set(`${i_Line}:${i_Mk}`, i_AlignedPos)}
        }
    }

    return o_Map
}

/**
 * Точно находит позицию символа в выровненной строке по числу кодовых символов до него.
 */
function fn_FindAlignedPos(s_Aligned: string, s_OrigPrefix: string, s_Symbol: string): number {
    const i_CodeChars = s_OrigPrefix.replace(/\s+/g, '').length
    let   i_Count     = 0

    for (let i = 0; i < s_Aligned.length; i++) {
        if (s_Aligned[i] !== ' ') {i_Count++}
        if (i_Count === i_CodeChars && s_Aligned.startsWith(s_Symbol, i + 1))
            {return i + 1}
    }

    return -1
}

export function positionMap_Apply(a_ParsedLines: ParsedLine[], o_PosMap: Map<string, number>): string[] {
    return a_ParsedLines.map((o_Pl, i_LineIdx) => {
        let s_Out   =  ''
        let i_SrcPos=  0 

        for (let i_Mk = 0; i_Mk < o_Pl.markers.length; i_Mk++) {
            const o_Marker = o_Pl.markers[i_Mk]
            s_Out    += o_Pl.raw.slice(i_SrcPos, o_Marker.startCol)
            i_SrcPos  = o_Marker.startCol

            const s_Key = `${i_LineIdx}:${i_Mk}`
            if (o_PosMap.has(s_Key)) {
                const i_Pad = o_PosMap.get(s_Key)! - s_Out.length
                if (i_Pad > 0) {s_Out += ' '.repeat(i_Pad)}
            }

            s_Out    += o_Marker.symbol
            i_SrcPos  = o_Marker.startCol + o_Marker.symbol.length
        }

        s_Out += o_Pl.raw.slice(i_SrcPos)
        return s_Out
    })
}

// ── 15. ENTRY POINT ───────────────────────────────────────────

/**
 * text_AlignByBlocks — главная точка входа.
 * Принимает текст, выравнивает блоки по вектору признаков (§2.1).
 */
export function text_AlignByBlocks(
    s_Input   :     string, 
    a_Patterns:  string[] , 
    a_Seps:     string[] = DEFAULT_CONFIG.defaultSeps
): string {
    const a_LinesAll  = s_Input.split('\n')
    const a_Blocks    = blocks_Split(a_LinesAll, a_Patterns)
    const a_LinesResult = [...a_LinesAll]

    for (const a_Block of a_Blocks) {
        const a_Aligned = block_Process(a_Block, a_LinesAll, a_Patterns, a_Seps)
        for (let i = 0; i < a_Block.length; i++)
            {a_LinesResult[a_Block[i]] = a_Aligned[i]}
    }

    return a_LinesResult.join('\n')
}

// ── 16. COMPATIBILITY ALIASES ─────────────────────────────────

export const parseLineIgnoringStrings=  line_Parse          
export const findLineBlocks          =  blocks_Find         
export const alignBlock              =  block_Align         
export const buildPairwisePositionMap=  positionMap_Build   
export const applyPositionMap        =  positionMap_Apply   
export const buildPipelineFSM        =  pipeline_Build      
export const detectLanguageRules     =  languageRules_Detect
export const DEFAULT_DEFAULT_CONFIG  =  DEFAULT_CONFIG      

// ── 17. INTERNAL TYPES (module-private) ───────────────────────

type PatternMatch= {  i_Pos:  number; s_Pattern:  string }
type SepMatch    = {  s_Sep:  string; i_Idx:  number }

type SegmentParsed = { s_Val: string; s_Sep: string; s_After: string }

type LineSegment = {
    s_Key   :     string
    s_Anchor:  string   
    s_Val   :     string
    s_Sep   :     string
    s_After :   string  
    s_Tail  :    string 
}

type WidthsResult = { a_WidthsKey: number[]; a_WidthsVal: number[] }

type BlockSplitState = {
    a_Blocks      :        number[][]
    a_BlockCurrent:  number[]        
    s_KeyCurrent  :    string | null 
}