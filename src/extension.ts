// ============================================================
// Code.Align.Columns — VS Code Extension
// ============================================================

// ── 1. IMPORTS ───────────────────────────────────────────────
import * as vscode from 'vscode'

// ── 2. RESULT TYPE ───────────────────────────────────────────
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })
const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ── 3. NS TYPE ───────────────────────────────────────────────
type NS = {
    result : Result<unknown>
    s_Error: string
    config : typeof CONFIG
    data   : NSData;
    [k     : string]: unknown
}

type NSData = {
    editor       : vscode.TextEditor | false
    languageRules: LanguageRules | false
    blocks       : LineBlock[]
    parsedLines  : ParsedLine[][]
    commonPrefix : string[][]
    alignedLines : string[][]
}

type LanguageRules = {
    lineComments    : string[]
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars      : string[]
}

type LineBlock = {
    startLine: number
    lines    : string[]
}

type ParsedLine = {
    raw    : string
    tokens : Token[]
    markers: Marker[]
}

type Token =
    | { kind: 'code'; text   : string }
    | { kind: 'string'; text : string }
    | { kind: 'comment'; text: string }

type Marker = {
    symbol  : string
    startCol: number
}

const ns_Error = (ns: NS): boolean => ns.result.ok === false
const ns_SetError = (ns: NS, e: string): void => {
    ns.result  = err(e)
    ns.s_Error = e
}

// ── 4. RWD + a_Chain ─────────────────────────────────────────
const timers = new Map<string, number>()
const line = (ch: string): string => ch.repeat(50)

function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`
${line('═')}`)
    console.log(`▶  ${name}`)
    console.log(`${line('─')}`)
}

function decor_Finish(name: string): void {
    const start    = timers.get(name)
    const duration = start ? (performance.now() - start).toFixed(2) : '?'
    console.log(`${line('─')}`)
    console.log(`◀  ${name} (${duration}ms)`)
    console.log(`${line('═')}
`)
    timers.delete(name)
}

function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    decor_Start(fn.name)
    fn(ns)
    decor_Finish(fn.name)
}

function a_Chain(ns: NS): void {
    rwd(config_Load_Decor    , ns)
    rwd(language_Detect_Decor, ns)
    rwd(block_Find_Decor     , ns)
    rwd(lines_Parse_Decor    , ns)
    rwd(pattern_Compute_Decor, ns)
    rwd(alignment_Apply_Decor, ns)
    rwd(text_Replace_Decor   , ns)
}

// ── 5. CONFIG ────────────────────────────────────────────────
const CONFIG = {
    b_Debug          : false,
    defaultAlignChars: ['===', '!==', '<=>', '=>', '->', '==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '%=', '**=', ':', '{', '=', ','],
    maxBlockSize     : 500 ,
    preserveComments : true,
    preserveStrings  : true,
    alignMultilineBlocks: false,
    skipTemplates    : true,
    greedyMatch      : true,
    minColumns       : 1   ,
    maxSpaces        : 10  ,
    testData: {} as Record<string, unknown>,
}

// ── 6. NS_Container ──────────────────────────────────────────
function NS_Container(cfg: typeof CONFIG): NS {
    return {
        result: ok({}),
        s_Error: '',
        config : cfg,
        data: {
            editor       : false,
            languageRules: false,
            blocks       : []   ,
            parsedLines  : []   ,
            commonPrefix : []   ,
            alignedLines : []   ,
        }          ,
        ...cfg.testData,
    }
}

// ── 7. LANGUAGE RULES MAP ─────────────────────────────────────
const LANGUAGE_RULES: Record<string, LanguageRules> = {
    typescript: {
        lineComments    : ['//']      ,
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"'        , "'", '`'],
        alignChars      : CONFIG.defaultAlignChars,
    },
    javascript: {
        lineComments    : ['//']      ,
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"'        , "'", '`'],
        alignChars      : CONFIG.defaultAlignChars,
    },
    python: {
        lineComments    : ['#']    ,
        blockComments   : []       ,
        stringDelimiters: ['"'     , "'"],
        alignChars      : CONFIG.defaultAlignChars,
    },
    rust: {
        lineComments    : ['//']      ,
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"']       ,
        alignChars      : CONFIG.defaultAlignChars,
    },
    go: {
        lineComments    : ['//']      ,
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"'        , '`'],
        alignChars      : CONFIG.defaultAlignChars,
    },
    lua: {
        lineComments    : ['--']      ,
        blockComments: [{ start: '--[[', end: ']]' }],
        stringDelimiters: ['"'        , "'"],
        alignChars      : CONFIG.defaultAlignChars,
    },
    sql: {
        lineComments    : ['--']      ,
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: ['"'        , "'"],
        alignChars      : CONFIG.defaultAlignChars,
    },
}

const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments    : ['//']      ,
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'        , "'", '`'],
    alignChars      : CONFIG.defaultAlignChars,
}

// ── 8. _DECOR FUNCTIONS ───────────────────────────────────────

/**
 * Load configuration from VS Code settings or use defaults.
 */
function config_Load_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.languageRules = DEFAULT_LANGUAGE_RULES
        return
    }
    try {
        const vsConfig   = vscode.workspace.getConfiguration('codeAlign')
        const alignChars = vsConfig.get<string[]>('alignChars', ns.config.defaultAlignChars)
        const loadedCfg  = loadConfig(vsConfig, alignChars, ns.config)
        ns.config        = { ...ns.config, ...loadedCfg }
        ns.result        = ok(ns.config)
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

/**
 * Detect the current editor language and load its rules.
 */
function language_Detect_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.languageRules = DEFAULT_LANGUAGE_RULES
        return
    }
    try {
        const editor        = vscode.window.activeTextEditor
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        ns.data.editor      = editor
        const langId        = editor.document.languageId
        ns.data.languageRules = detectLanguageRules(langId, ns.config.defaultAlignChars)
        ns.result           = ok(ns.data.languageRules)
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

/**
 * Find blocks of consecutive non-empty lines with the same indentation
 * within the current selection or whole document.
 */
function block_Find_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.blocks = (ns['testBlocks'] as LineBlock[] | undefined) ?? []
        ns.result      = ok(ns.data.blocks)
        return
    }
    try {
        const editor    = ns.data.editor
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        const rules     = ns.data.languageRules
        if(!rules) { ns_SetError(ns, 'No language rules'); return }
        const doc       = editor.document
        const selection = editor.selection

        let startLine, endLine
        if(selection.isEmpty) {
            const activeLine    = selection.active.line
            const initialIndent = doc.lineAt(activeLine).text.match(/^\s*/)?.[0] ?? ''

            startLine = activeLine
            while(startLine > 0) {
                const prevLine = doc.lineAt(startLine - 1)
                if(prevLine.isEmptyOrWhitespace || (prevLine.text.match(/^\s*/)?.[0] ?? '') !== initialIndent) {
                    break
                }
                startLine--
            }

            endLine = activeLine
            while(endLine < doc.lineCount - 1) {
                const nextLine = doc.lineAt(endLine + 1)
                if(nextLine.isEmptyOrWhitespace || (nextLine.text.match(/^\s*/)?.[0] ?? '') !== initialIndent) {
                    break
                }
                endLine++
            }
        } else {
            startLine = selection.start.line
            endLine   = selection.end.line
        }

        const rawLines = extractRawLines(doc    , startLine, endLine)
        ns.data.blocks = findLineBlocks(rawLines, startLine, rules, ns.config.maxBlockSize)
        ns.result = ok(ns.data.blocks)
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

/**
 * Parse each line in each block, extracting tokens and alignment markers.
 */
function lines_Parse_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.parsedLines = (ns['testParsedLines'] as ParsedLine[][] | undefined) ?? []
        ns.result           = ok(ns.data.parsedLines)
        return
    }
    try {
        const rules         = ns.data.languageRules
        if(!rules) { ns_SetError(ns, 'No language rules'); return }
        ns.data.parsedLines = ns.data.blocks.map(block =>
            block.lines.map(raw => parseLineIgnoringStrings(raw, rules))
        )
        ns.result = ok(ns.data.parsedLines)
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

/**
 * Compute the common prefix of marker sequences for each block.
 */
function pattern_Compute_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.commonPrefix = (ns['testCommonPrefix'] as string[][] | undefined) ?? []
        ns.result           = ok(ns.data.commonPrefix)
        return
    }
    try {
        ns.data.commonPrefix = ns.data.parsedLines.map(blockLines => {
            const sequences = blockLines.map(pl => pl.markers.map(m => m.symbol))
            return findDominantPrefix(sequences)
        })
        ns.result = ok(ns.data.commonPrefix)
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

/**
 * Apply alignment spacing to each block according to the common prefix.
 */
function alignment_Apply_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.alignedLines = (ns['testAlignedLines'] as string[][] | undefined) ?? []
        ns.result           = ok(ns.data.alignedLines)
        return
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map((blockLines, bi) => {
            const prefix = ns.data.commonPrefix[bi]
            if(prefix.length === 0) { return blockLines.map(pl => pl.raw) }
            return alignBlock(blockLines, prefix, ns.config.maxSpaces)
        })
        ns.result = ok(ns.data.alignedLines)
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

/**
 * Replace original lines in the editor with the aligned versions.
 */
function text_Replace_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.result = ok('debug-no-replace')
        return
    }
    try {
        const editor = ns.data.editor
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        applyEditorReplacements(editor, ns.data.blocks, ns.data.alignedLines)
        ns.result    = ok('replaced')
    } catch(e) {
        ns_SetError(ns, (e as Error).message)
    }
}

// ── 9. PURE FUNCTIONS ─────────────────────────────────────────

// ── loadConfig ────────────────────────────────────────────────
/** Load and merge VS Code settings with defaults. */
function loadConfig(
    vsConfig  : vscode.WorkspaceConfiguration,
    alignChars: string[]          ,
    defaults: typeof CONFIG
): Partial<typeof CONFIG> {
    return {
        defaultAlignChars: alignChars,
        maxBlockSize    : vsConfig.get<number>('maxBlockSize', defaults.maxBlockSize),
        preserveComments: vsConfig.get<boolean>('preserveComments', defaults.preserveComments),
        preserveStrings : vsConfig.get<boolean>('preserveStrings', defaults.preserveStrings),
        maxSpaces       : vsConfig.get<number>('maxSpaces'   , defaults.maxSpaces),
        greedyMatch     : vsConfig.get<boolean>('greedyMatch', defaults.greedyMatch),
    }
}

// ── detectLanguageRules ───────────────────────────────────────
/** Return language parsing rules for the given VS Code language identifier. */
function detectLanguageRules(langId: string, defaultAlignChars: string[]): LanguageRules {
    const rules = LANGUAGE_RULES[langId]
    if(rules) { return { ...rules, alignChars: defaultAlignChars } }
    return { ...DEFAULT_LANGUAGE_RULES, alignChars: defaultAlignChars }
}

// ── extractRawLines ───────────────────────────────────────────
/** Extract raw text lines from a VS Code document between two line indices. */
function extractRawLines(doc: vscode.TextDocument, start: number, end: number): string[] {
    const out: string[] = []
    for(let i = start; i <= end; i++) {
        out.push(doc.lineAt(i).text)
    }
    return out
}

// ── findLineBlocks ────────────────────────────────────────────
/**
 * Group consecutive non-empty lines with identical indentation into blocks.
 * Lines that are pure comments are ignored (not added to blocks).
 *
 * FSM states:
 *   idle_Waiting    — looking for the start of a new block
 *   block_Building  — accumulating lines into the current block
 */
function findLineBlocks(
    rawLines   : string[],
    startOffset: number ,
    rules      : LanguageRules,
    maxBlockSize: number
): LineBlock[] {
    // states: idle_Waiting | block_Building
    type State = 'idle_Waiting' | 'block_Building'

    const blocks: LineBlock[] = []
    let state   : State       = 'idle_Waiting'
    let curBlock: LineBlock   = { startLine: 0, lines: [] }
    let curIndent = ''

    const flush = (): void => {
        if(curBlock.lines.length > 1) { blocks.push(curBlock) }
        curBlock = { startLine: 0, lines: [] }
        state = 'idle_Waiting'
    }

    const isBlankOrComment = (raw: string): boolean => {
        const trimmed = raw.trim()
        if(trimmed === '') { return true }
        for(const lc of rules.lineComments) {
            if(trimmed.startsWith(lc)) { return true }
        }
        return false
    }

    const getIndent = (raw: string): string => {
        const m = raw.match(/^(\s*)/)
        return m ? m[1] : ''
    }

    outerLoop: for(let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i]

        switch(state) {
            case 'idle_Waiting': {
                if(isBlankOrComment(raw)) { continue outerLoop }
                curIndent = getIndent(raw)
                curBlock  = { startLine: startOffset + i, lines: [raw] }
                state     = 'block_Building'
                break
            }
            case 'block_Building': {
                if(isBlankOrComment(raw)) { flush(); continue outerLoop }
                const indent = getIndent(raw)
                if(indent !== curIndent || curBlock.lines.length >= maxBlockSize) {
                    flush()
                    // re-process this line as a potential new block start
                    curIndent = indent
                    curBlock  = { startLine: startOffset + i, lines: [raw] }
                    state     = 'block_Building'
                } else {
                    curBlock.lines.push(raw)
                }
                break
            }
        }
    }
    flush()
    return blocks
}

// ── parseLineIgnoringStrings ──────────────────────────────────
/**
 * Tokenise a line and locate alignment markers, skipping string literals
 * and line/block comments.
 *
 * FSM states:
 *   code_Reading       — scanning normal code
 *   string_Double      — inside "..." string
 *   string_Single      — inside '...' string
 *   template_Backtick  — inside `...` template literal
 *   lineComment_Done   — line comment found; stop scanning
 *   blockComment_Open  — inside block comment
 */
function parseLineIgnoringStrings(raw: string, rules: LanguageRules): ParsedLine {
    type State =
        | 'code_Reading'
        | 'string_Double'
        | 'string_Single'
        | 'template_Backtick'
        | 'lineComment_Done'
        | 'blockComment_Open'

    // Sort align chars longest-first for greedy matching
    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const tokens : Token[]  = []
    const markers: Marker[] = []

    let state: State = 'code_Reading'
    let i           = 0
    let codeStart   = 0
    let blockCommentEnd = ''

    const pushCode = (end: number): void => {
        if(end > codeStart) { tokens.push({ kind: 'code', text: raw.slice(codeStart, end) }) }
    }

    outerLoop: while(i <= raw.length) {
        switch(state) {

            case 'code_Reading': {
                if(i >= raw.length) { pushCode(i); break outerLoop }

                // Check for block comment start
                let foundBlock = false
                for(const bc of rules.blockComments) {
                    if(raw.startsWith(bc.start, i)) {
                        pushCode(i)
                        codeStart       = i
                        blockCommentEnd = bc.end
                        state           = 'blockComment_Open'
                        i += bc.start.length
                        foundBlock      = true
                        break
                    }
                }
                if(foundBlock) { continue outerLoop }

                // Check for line comment start
                let foundLine = false
                for(const lc of rules.lineComments) {
                    if(raw.startsWith(lc, i)) {
                        pushCode(i)
                        tokens.push({ kind: 'comment', text: raw.slice(i) })
                        state     = 'lineComment_Done'
                        foundLine = true
                        break
                    }
                }
                if(foundLine) { break outerLoop }

                // Check for string delimiters
                const ch = raw[i]
                if(ch === '"' && rules.stringDelimiters.includes('"')) {
                    pushCode(i); codeStart = i; state = 'string_Double'; i++; continue outerLoop
                }
                if(ch === "'" && rules.stringDelimiters.includes("'")) {
                    pushCode(i); codeStart = i; state = 'string_Single'; i++; continue outerLoop
                }
                if(ch === '`' && rules.stringDelimiters.includes('`')) {
                    pushCode(i); codeStart = i; state = 'template_Backtick'; i++; continue outerLoop
                }

                // Greedy match alignment chars
                let foundMarker = false
                for(const ac of alignChars) {
                    if(raw.startsWith(ac, i)) {
                        markers.push({ symbol: ac, startCol: i })
                        i += ac.length
                        foundMarker = true
                        break
                    }
                }
                if(!foundMarker) { i++ }
                break
            }

            case 'string_Double': {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break outerLoop }
                if(raw[i] === '') { i += 2; continue outerLoop }
                if(raw[i] === '"') { i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i; state = 'code_Reading'; continue outerLoop }
                i++
                break
            }

            case 'string_Single': {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break outerLoop }
                if(raw[i] === '') { i += 2; continue outerLoop }
                if(raw[i] === "'") { i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i; state = 'code_Reading'; continue outerLoop }
                i++
                break
            }

            case 'template_Backtick': {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break outerLoop }
                if(raw[i] === '') { i += 2; continue outerLoop }
                if(raw[i] === '`') { i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i; state = 'code_Reading'; continue outerLoop }
                i++
                break
            }

            case 'blockComment_Open': {
                if(i >= raw.length) { tokens.push({ kind: 'comment', text: raw.slice(codeStart) }); break outerLoop }
                if(raw.startsWith(blockCommentEnd, i)) {
                    i += blockCommentEnd.length
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) })
                    codeStart = i
                    state     = 'code_Reading'
                    continue outerLoop
                }
                i++
                break
            }

            case 'lineComment_Done':
                break outerLoop
        }
    }

    return { raw, tokens, markers }
}

// ── findAlignCharsGreedy ──────────────────────────────────────
/**
 * Find alignment marker positions in a raw code string using greedy left-to-right
 * matching, skipping string literals and comments.
 *
 * (Thin wrapper around parseLineIgnoringStrings for external use / testing.)
 */
function findAlignCharsGreedy(code: string, alignChars: string[], rules: LanguageRules): Marker[] {
    const rulesWithChars: LanguageRules = { ...rules, alignChars }
    return parseLineIgnoringStrings(code, rulesWithChars).markers
}

// ── findDominantPrefix ────────────────────────────────────────
/**
 * Given an array of marker-symbol sequences, find the most frequent
 * non-empty sequence to use as the alignment prefix.
 */
function findDominantPrefix(sequences: string[][]): string[] {
    if(sequences.length === 0) { return [] }

    const counts = new Map<string, { sequence: string[], count: number }>()
    for(const seq of sequences) {
        if(seq.length === 0) { continue }
        const key      = JSON.stringify(seq)
        const existing = counts.get(key)
        if(existing) {
            existing.count++
        } else {
            counts.set(key, { sequence: seq, count: 1 })
        }
    }

    if(counts.size === 0) { return [] }

    let dominantSeq: string[] = []
    let maxCount = 0
    for(const { sequence, count } of counts.values()) {
        if(count > maxCount) {
            maxCount    = count
            dominantSeq = sequence
        }
    }

    return dominantSeq
}

// ── computeColumnPositionsWithLength ─────────────────────────
/**
 * For each marker position in the common prefix                 , compute the maximum column
 * (start position) at which that marker appears across all lines, taking
 * into account that earlier markers may have been padded.
 *
 * Returns an array of target column positions (one per prefix entry).
 */
function computeColumnPositionsWithLength(
    parsedLines: ParsedLine[],
    prefix     : string[]    ,
    maxSpaces: number
): number[] {
    const positions: number[] = new Array(prefix.length).fill(0)

    for(const pl of parsedLines) {
        // We only care about lines whose marker sequence starts with the prefix
        const lineSymbols = pl.markers.map(m => m.symbol)
        if(!prefixMatches(lineSymbols, prefix)) { continue }

        for(let pi = 0; pi < prefix.length; pi++) {
            const col = pl.markers[pi].startCol
            if(col > positions[pi]) { positions[pi] = col }
        }
    }

    // Clamp: never add more than maxSpaces per marker
    for(let pi = 0; pi < positions.length; pi++) {
        const minCol = parsedLines
            .filter(pl => prefixMatches(pl.markers.map(m => m.symbol), prefix))
            .reduce((acc, pl) => Math.min(acc, pl.markers[pi].startCol), Infinity)
        const cap = minCol + maxSpaces
        if(positions[pi] > cap) { positions[pi] = cap }
    }

    return positions
}

/** Check that lineSymbols starts with prefix. */
function prefixMatches(lineSymbols: string[], prefix: string[]): boolean {
    if(lineSymbols.length < prefix.length) { return false }
    for(let i = 0; i < prefix.length; i++) {
        if(lineSymbols[i] !== prefix[i]) { return false }
    }
    return true
}

// ── applySpacingRespectingMultichar ──────────────────────────
/**
 * Rewrite a single parsed line by inserting spaces before each marker in the
 * common prefix so that its start column reaches `targetCols[pi]`.
 * Markers beyond the prefix and content after them are appended as-is.
 */
function applySpacingRespectingMultichar(
    pl    : ParsedLine,
    prefix: string[],
    targetCols: number[]
): string {
    if(!prefixMatches(pl.markers.map(m => m.symbol), prefix)) { return pl.raw }

    let out    = ''
    let srcPos = 0 // current position in pl.raw

    for(let pi = 0; pi < prefix.length; pi++) {
        const marker    = pl.markers[pi]
        const targetCol = targetCols[pi]
        // Append everything before this marker
        out += pl.raw.slice(srcPos, marker.startCol)
        srcPos = marker.startCol
        // Current length of out is the current column of this marker
        const curCol = out.length
        if(targetCol > curCol) {
            out += ' '.repeat(targetCol - curCol)
        }
        // Append the marker itself
        out += pl.raw.slice(marker.startCol, marker.startCol + marker.symbol.length)
        srcPos = marker.startCol + marker.symbol.length
    }

    // Append the rest of the line
    out += pl.raw.slice(srcPos)
    return out
}

// ── alignBlock ───────────────────────────────────────────────
/**
 * Align all lines in a block according to their common prefix.
 * Lines that don't start with the prefix are returned unchanged.
 */
function alignBlock(
    parsedLines: ParsedLine[],
    prefix     : string[]    ,
    maxSpaces: number
): string[] {
    if(prefix.length === 0) { return parsedLines.map(pl => pl.raw) }
    const targetCols = computeColumnPositionsWithLength(parsedLines, prefix, maxSpaces)
    return parsedLines.map(pl => applySpacingRespectingMultichar(pl, prefix, targetCols))
}

// ── applyEditorReplacements ───────────────────────────────────
/** Apply aligned lines back into the VS Code editor document. */
function applyEditorReplacements(
    editor: vscode.TextEditor,
    blocks: LineBlock[]      ,
    alignedLines: string[][]
): void {
    editor.edit(editBuilder => {
        for(let bi = 0; bi < blocks.length; bi++) {
            const block   = blocks[bi]
            const aligned = alignedLines[bi]
            for(let li    = 0; li < block.lines.length; li++) {
                const lineIdx = block.startLine + li
                const range   = editor.document.lineAt(lineIdx).range
                editBuilder.replace(range, aligned[li])
            }
        }
    })
}

// ── 10. ACTIVATE / DEACTIVATE ─────────────────────────────────

/** Activate the extension and register commands. */
export function activate(context: vscode.ExtensionContext): void {
    const runAlign = (): void => {
        const ns: NS = NS_Container(CONFIG)
        a_Chain(ns)
        if(ns.s_Error) {
            vscode.window.showErrorMessage(`Code.Align: ${ns.s_Error}`)
        } else {
            vscode.window.showInformationMessage('Code aligned successfully')
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-better-align-columns.align', runAlign),
        vscode.commands.registerCommand('CodeAlign.AlignBlock'          , runAlign),
        vscode.commands.registerCommand('CodeAlign.Configure', () => {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'codeAlign'
            )
        })
    )
}

/** Deactivate the extension. */
export function deactivate(): void { }

// ── EXPORTS FOR TESTING ───────────────────────────────────────
export {
    ok          , err,
    NS_Container,
    a_Chain     ,
    findAlignCharsGreedy,
    findDominantPrefix,
    computeColumnPositionsWithLength,
    applySpacingRespectingMultichar,
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock  ,
    detectLanguageRules,
    prefixMatches,
    DEFAULT_LANGUAGE_RULES,
    CONFIG      ,
    LanguageRules,
    ParsedLine  ,
    Marker      ,
}
