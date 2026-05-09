import * as vscode from 'vscode'

// ============================================================================
// TYPE RESULT
// ============================================================================
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })
const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ============================================================================
// TYPE NS
// ============================================================================
type NS = { result: Result<any>; s_Error: string;[k: string]: any }
const ns_Error = (ns: NS): boolean => ns.result.ok === false
const ns_SetError = (ns: NS, e: string): void => { ns.result = err(e); ns.s_Error = e }

// ============================================================================
// RWD
// ============================================================================
const timers = new Map<string, number>()

function line(char: string, len: number = 60): string {
    return char.repeat(len)
}

function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`\n${line('═')}`)
    console.log(`▶  ${name}`)
    console.log(`${line('─')}`)
}

function decor_Finish(name: string): void {
    const start = timers.get(name)
    const duration = start ? (performance.now() - start).toFixed(2) : '?'
    console.log(`${line('─')}`)
    console.log(`◀  ${name} (${duration}ms)`)
    console.log(`${line('═')}\n`)
    timers.delete(name)
}

function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    decor_Start(fn.name)
    fn(ns)
    decor_Finish(fn.name)
}

function a_Chain(ns: NS): void {
    rwd(data_Load_Decor, ns)
    rwd(data_Validate_Decor, ns)
    rwd(data_Process_Decor, ns)
    rwd(data_Write_Decor, ns)
}

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
    b_Debug: false,
    defaultAlignChars: [':', '{', '=', ','],
    maxBlockSize: 500,
    preserveComments: true,
    preserveStrings: true,
    alignMultilineBlocks: false,
    skipTemplates: true,
    languageConfigs: {
        javascript: {
            lineComments: ['//'],
            blockComments: [{ start: '/*', end: '*/' }],
            stringDelimiters: ['"', "'", '`'],
            alignChars: [':', '{', '=', ','],
            multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
        },
        typescript: {
            lineComments: ['//'],
            blockComments: [{ start: '/*', end: '*/' }],
            stringDelimiters: ['"', "'", '`'],
            alignChars: [':', '{', '=', ','],
            multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
        },
        python: {
            lineComments: ['#'],
            blockComments: [{ start: '"""', end: '"""' }, { start: "'''", end: "'''" }],
            stringDelimiters: ['"', "'"],
            alignChars: ['=', ':', ','],
            multiCharOps: ['==', '!=', '<=', '>=']
        },
        php: {
            lineComments: ['//', '#'],
            blockComments: [{ start: '/*', end: '*/' }],
            stringDelimiters: ['"', "'", '`'],
            alignChars: [':', '{', '=', ',', '->'],
            multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->', '<=>', '??']
        }
    }
}

function NS_Container(cfg: typeof CONFIG): NS {
    return {
        result: ok({}),
        s_Error: '',
        config: cfg,
        data: {},
        selection: null,
        editor: null,
        languageId: '',
        blocks: [],
        alignedLines: []
    }
}

// ============================================================================
// PURE FUNCTIONS
// ============================================================================

/**
 * Pure : extracts line comments and block comments start positions
 */
function pure_ExtractCommentMarkers(line: string, languageConfig: any): { lineCommentPos: number; blockCommentPos: number } {
    let lineCommentPos = -1
    let blockCommentPos = -1

    for(const marker of languageConfig.lineComments) {
        const pos = line.indexOf(marker)
        if(pos !== -1 && (lineCommentPos === -1 || pos < lineCommentPos)) {
            lineCommentPos = pos
        }
    }

    for(const block of languageConfig.blockComments) {
        const pos = line.indexOf(block.start)
        if(pos !== -1 && (blockCommentPos === -1 || pos < blockCommentPos)) {
            blockCommentPos = pos
        }
    }

    return { lineCommentPos, blockCommentPos }
}

/**
 * Pure : checks if position is inside string literal
 */
function pure_IsInsideString(line: string, position: number, delimiters: string[]): boolean {
    let inString = false
    let currentDelimiter = ''

    for(let i = 0; i < position; i++) {
        const char = line[i]
        const prevChar = i > 0 ? line[i - 1] : ''

        if(delimiters.includes(char) && prevChar !== '\\') {
            if(!inString) {
                inString = true
                currentDelimiter = char
            } else if(char === currentDelimiter) {
                inString = false
                currentDelimiter = ''
            }
        }
    }

    return inString
}

/**
 * Pure : finds align character positions in line (ignoring strings and comments)
 */
function pure_FindMultiCharOps(line: string, lineCommentPos: number, languageConfig: any): { pos: number; op: string }[] {
    const results: { pos: number; op: string }[] = []
    const multiCharOps = languageConfig.multiCharOps || []
    const sortedOps = [...multiCharOps].sort((a: string, b: string) => b.length - a.length)

    for(const op of sortedOps) {
        let searchFrom = 0
        while(true) {
            const pos = line.indexOf(op, searchFrom)
            if(pos === -1) { break }
            if(lineCommentPos !== -1 && pos >= lineCommentPos) { break }
            if(pure_IsInsideString(line, pos, languageConfig.stringDelimiters)) {
                searchFrom = pos + 1
                continue
            }
            const startBlock = pure_FindBlockCommentStart(line, lineCommentPos, languageConfig)
            const endBlock = pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig)
            if(startBlock !== -1 && endBlock !== -1 && pos >= startBlock && pos < endBlock) {
                searchFrom = pos + 1
                continue
            }
            results.push({ pos, op })
            searchFrom = pos + op.length
        }
    }
    return results
}

// ============================================================================
// TYPES FOR ALIGNMENT
// ============================================================================
interface AlignPoint {
    pos: number
    op: string
}

// ============================================================================
// PURE FUNCTIONS: BLOCK COMMENT HELPERS
// ============================================================================
function pure_FindBlockCommentStart(line: string, lineCommentPos: number, languageConfig: any): number {
    for(const block of languageConfig.blockComments) {
        const startPos = line.indexOf(block.start)
        if(startPos !== -1 && (lineCommentPos === -1 || startPos < lineCommentPos)) {
            return startPos
        }
    }
    return -1
}

function pure_FindBlockCommentEnd(line: string, lineCommentPos: number, languageConfig: any): number {
    for(const block of languageConfig.blockComments) {
        const startPos = line.indexOf(block.start)
        if(startPos !== -1 && (lineCommentPos === -1 || startPos < lineCommentPos)) {
            const endPos = line.indexOf(block.end, startPos + block.start.length)
            if(endPos !== -1) {
                return endPos + block.end.length
            }
        }
    }
    return -1
}

// ============================================================================
// PURE FUNCTIONS: POSITION VALIDATION
// ============================================================================
enum PositionState {
    Valid,
    InsideLineComment,
    InsideBlockComment,
    InsideString
}

function classifyPosition(
    line: string,
    pos: number,
    lineCommentPos: number,
    blockStartPos: number,
    blockEndPos: number,
    delimiters: string[]
): PositionState {
    // Проверяем line comment
    switch(true) {
        case lineCommentPos !== -1 && pos >= lineCommentPos:
            return PositionState.InsideLineComment
    }

    // Проверяем block comment
    switch(true) {
        case blockStartPos !== -1 && blockEndPos !== -1 && pos >= blockStartPos && pos < blockEndPos:
            return PositionState.InsideBlockComment
    }

    // Проверяем string
    switch(pure_IsInsideString(line, pos, delimiters)) {
        case true: return PositionState.InsideString
    }

    return PositionState.Valid
}

// ============================================================================
// PURE FUNCTIONS: MULTI-CHAR OPERATOR SCANNER
// ============================================================================
function pure_ScanMultiCharOps(
    line: string,
    lineCommentPos: number,
    languageConfig: any
): { pos: number; op: string }[] {
    const results: { pos: number; op: string }[] = []
    const multiCharOps = languageConfig.multiCharOps || []
    const delimiters = languageConfig.stringDelimiters

    for(const op of multiCharOps) {
        let searchFrom = 0
        while(true) {
            const pos = line.indexOf(op, searchFrom)
            switch(pos) {
                case -1: break

                default: {
                    const state = classifyPosition(
                        line, pos, lineCommentPos,
                        pure_FindBlockCommentStart(line, lineCommentPos, languageConfig),
                        pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig),
                        delimiters
                    )
                    switch(state) {
                        case PositionState.Valid:
                            results.push({ pos, op })
                            searchFrom = pos + op.length
                            break
                        default:
                            searchFrom = pos + 1
                    }
                    break
                }
            }
        }
    }

    return results
}

// ============================================================================
// PURE FUNCTIONS: SINGLE CHAR ALIGN POINTS
// ============================================================================
function pure_ScanSingleCharAlignPoints(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    languageConfig: any
): AlignPoint[] {
    const results: AlignPoint[] = []
    const delimiters = languageConfig.stringDelimiters

    for(let i = 0; i < line.length; i++) {
        const char = line[i]
        const state = classifyPosition(
            line, i, lineCommentPos,
            pure_FindBlockCommentStart(line, lineCommentPos, languageConfig),
            pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig),
            delimiters
        )

        switch(state) {
            case PositionState.Valid: {
                switch(alignChars.includes(char)) {
                    case true: results.push({ pos: i, op: char }); break
                }
                break
            }
        }
    }

    return results
}

// ============================================================================
// PURE FUNCTIONS: FIND ALIGN POSITIONS (NUMBERS ONLY)
// ============================================================================
function pure_FindAlignPositions(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    languageConfig: any
): number[] {
    return pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig)
        .map(p => p.pos)
}

// ============================================================================
// PURE FUNCTIONS: EXTRACT CHAR SEQUENCE
// ============================================================================
/**
 * Pure : extracts sequence of operators at positions
 */
function pure_ExtractCharSequence(line: string, positions: number[]): string[] {
    const sequence: string[] = []
    for(const pos of positions) {
        if(pos < line.length) {
            sequence.push(line[pos])
        }
    }
    return sequence
}

// ============================================================================
// PURE FUNCTIONS: EXTRACT OPERATOR SEQUENCE FROM ALIGN POINTS
// ============================================================================
function pure_ExtractOperatorSequence(alignPoints: AlignPoint[]): string[] {
    return alignPoints.map(p => p.op)
}

// ============================================================================
// PURE FUNCTIONS: COMMON PREFIX FOR OPERATORS
// ============================================================================
function pure_FindCommonPrefix(sequences: string[][]): string[] {
    if(sequences.length === 0) { return [] }

    const minLength = Math.min(...sequences.map(s => s.length))
    const prefix: string[] = []

    for(let i = 0; i < minLength; i++) {
        const char = sequences[0][i]
        switch(sequences.every(seq => seq[i] === char)) {
            case true: prefix.push(char); break
            case false: break
        }
    }

    return prefix
}

// ============================================================================
// PURE FUNCTIONS: CALCULATE ALIGN COLUMNS
// ============================================================================
function pure_CalculateAlignColumns(
    lines: string[],
    alignChars: string[],
    commonPrefix: string[],
    languageConfig: any
): Map<number, number>[] {
    const alignMaps: Map<number, number>[] = []

    for(const line of lines) {
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, languageConfig)
        const alignPoints = pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig)
        const sequence = pure_ExtractOperatorSequence(alignPoints)

        const alignMap = new Map<number, number>()
        let prefixIndex = 0

        for(let i = 0; i < alignPoints.length && prefixIndex < commonPrefix.length; i++) {
            switch(sequence[i]) {
                case commonPrefix[prefixIndex]:
                    alignMap.set(prefixIndex, alignPoints[i].pos)
                    prefixIndex++
                    break
                default:
                    break
            }
        }

        alignMaps.push(alignMap)
    }

    return alignMaps
}

// ============================================================================
// PURE FUNCTIONS: COMPUTE MAX COLUMNS
// ============================================================================
function pure_ComputeMaxColumns(alignMaps: Map<number, number>[]): Map<number, number> {
    const maxColumns = new Map<number, number>()

    for(const alignMap of alignMaps) {
        for(const [idx, pos] of alignMap) {
            const current = maxColumns.get(idx) || 0
            switch(pos > current) {
                case true: maxColumns.set(idx, pos); break
                case false: break
            }
        }
    }

    return maxColumns
}

// ============================================================================
// PURE FUNCTIONS: APPLY ALIGNMENT
// ============================================================================
function pure_ApplyAlignment(
    line: string,
    alignMap: Map<number, number>,
    maxColumns: Map<number, number>,
    alignChars: string[]
): string {
    switch(alignMap.size) {
        case 0: return line
    }

    const sortedIndices = Array.from(alignMap.keys()).sort((a, b) => a - b)
    let result = line
    let offset = 0

    for(const idx of sortedIndices) {
        const originalPos = alignMap.get(idx)!
        const targetPos = maxColumns.get(idx)!
        const currentPos = originalPos + offset

        switch(currentPos < targetPos) {
            case true: {
                const spaces = ' '.repeat(targetPos - currentPos)
                result = result.slice(0, currentPos) + spaces + result.slice(currentPos)
                offset += spaces.length
                break
            }
        }
    }

    return result
}

// ============================================================================
// PURE FUNCTIONS: SPLIT INTO BLOCKS
// ============================================================================
function pure_SplitIntoBlocks(lines: string[]): string[][] {
    const blocks: string[][] = []
    let currentBlock: string[] = []

    for(const line of lines) {
        switch(line.trim().length === 0) {
            case true: {
                switch(currentBlock.length > 0) {
                    case true:
                        blocks.push(currentBlock)
                        currentBlock = []
                        break
                }
                break
            }
            case false: {
                currentBlock.push(line)
                break
            }
        }
    }

    switch(currentBlock.length > 0) {
        case true: blocks.push(currentBlock); break
    }

    return blocks
}

// ============================================================================
// PURE FUNCTIONS: FILTER PURE COMMENTS
// ============================================================================
function pure_FilterPureComments(lines: string[], languageConfig: any): string[] {
    return lines.filter(line => {
        const trimmed = line.trim()
        for(const marker of languageConfig.lineComments) {
            switch(trimmed.startsWith(marker)) {
                case true: return false
            }
        }
        return true
    })
}

// ============================================================================
// _DECOR FUNCTIONS
// ============================================================================
function data_Load_Decor(ns: NS): void {
    if(CONFIG.b_Debug) {
        ns.data = { ...ns.config.testData }
        ns.result = ok(ns.data)
        return
    }

    try {
        const editor = vscode.window.activeTextEditor
        if(!editor) { throw new Error('No active editor') }

        const selection = editor.selection
        const config = vscode.workspace.getConfiguration('codeAlign')

        ns.editor = editor
        ns.selection = selection
        ns.data.config = {
            alignChars: config.get('alignChars', CONFIG.defaultAlignChars),
            maxBlockSize: config.get('maxBlockSize', CONFIG.maxBlockSize),
            preserveComments: config.get('preserveComments', CONFIG.preserveComments),
            preserveStrings: config.get('preserveStrings', CONFIG.preserveStrings)
        }

        ns.result = ok(ns.data)
    } catch(e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Load failed')
    }
}

function data_Validate_Decor(ns: NS): void {
    if(CONFIG.b_Debug) {
        ns.languageId = 'javascript'
        ns.result = ok({})
        return
    }

    try {
        if(!ns.editor) { throw new Error('Editor not available') }

        ns.languageId = ns.editor.document.languageId
        const languageConfig = CONFIG.languageConfigs[ns.languageId as keyof typeof CONFIG.languageConfigs]

        if(!languageConfig) { throw new Error(`Unsupported language: ${ns.languageId}`) }

        ns.data.languageConfig = languageConfig
        ns.result = ok({})
    } catch(e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Validation failed')
    }
}

function data_Process_Decor(ns: NS): void {
    if(CONFIG.b_Debug) {
        const testLines = ['const x = 1;', 'const xx = 22;', 'const xxx = { a: 1, b: 2 };']
        ns.blocks = [testLines]
        ns.result = ok({})
        return
    }

    try {
        if(!ns.editor || !ns.selection) { throw new Error('Editor or selection not available') }

        const text = ns.editor.document.getText(ns.selection)
        const lines = text.split('\n')
        const rawBlocks = pure_SplitIntoBlocks(lines)

        ns.blocks = []
        const alignChars = ns.data.config.alignChars
        const languageConfig = ns.data.languageConfig

        for(const block of rawBlocks) {
            if(block.length > ns.data.config.maxBlockSize) {
                ns.blocks.push(block)
                continue
            }

            const filteredBlock = ns.data.config.preserveComments
                ? pure_FilterPureComments(block, languageConfig)
                : block

            if(filteredBlock.length === 0) {
                ns.blocks.push(block)
                continue
            }

            const sequences: string[][] = []

            for(const line of filteredBlock) {
                const { lineCommentPos } = pure_ExtractCommentMarkers(line, languageConfig)
                const alignPoints = pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig)
                const sequence = pure_ExtractOperatorSequence(alignPoints)
                sequences.push(sequence)
            }

            const commonPrefix = pure_FindCommonPrefix(sequences)

            if(commonPrefix.length === 0) {
                ns.blocks.push(block)
                continue
            }

            const alignMaps = pure_CalculateAlignColumns(filteredBlock, alignChars, commonPrefix, languageConfig)
            const maxColumns = pure_ComputeMaxColumns(alignMaps)

            const alignedBlock: string[] = []
            for(let i = 0; i < filteredBlock.length; i++) {
                const aligned = pure_ApplyAlignment(filteredBlock[i], alignMaps[i], maxColumns, alignChars)
                alignedBlock.push(aligned)
            }

            ns.blocks.push(alignedBlock)
        }

        ns.result = ok({})
    } catch(e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Processing failed')
    }
}

function data_Write_Decor(ns: NS): void {
    if(CONFIG.b_Debug) {
        console.log('Debug mode: skipping write')
        ns.result = ok({})
        return
    }

    try {
        if(!ns.editor || !ns.selection) { throw new Error('Editor or selection not available') }

        const alignedText = ns.blocks.map((block: string[]) => block.join('\n')).join('\n\n')

        ns.editor.edit((editBuilder: vscode.TextEditorEdit) => {
            editBuilder.replace(ns.selection!, alignedText)
        }).then((success: boolean) => {
            if(!success) { ns_SetError(ns, 'Failed to write changes') }
        })

        ns.result = ok({})
    } catch(e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Write failed')
    }
}

// ============================================================================
// ACTIVATE / DEACTIVATE
// ============================================================================
export function activate(context: vscode.ExtensionContext): void {
    const ns: NS = NS_Container(CONFIG)

    const alignSelection = vscode.commands.registerCommand('codeAlign.alignSelection', () => {
        a_Chain(ns)
        if(ns.s_Error) {
            vscode.window.showErrorMessage(ns.s_Error)
        } else {
            vscode.window.showInformationMessage('Code aligned successfully')
        }
    })

    context.subscriptions.push(alignSelection)
}

export function deactivate(): void { }