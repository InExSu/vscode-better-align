'use strict'
import * as vscode from 'vscode'

// ============================================================================
// TYPES
// ============================================================================

type AlignPoint = { pos: number; op: string }
type Block      = string[]

interface LineCommentMarkers {
    lineCommentPos : number
    blockCommentPos: number
}

interface LanguageConfig {
    lineComments                       : string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters                   : string[]
    alignChars                         : string[]
    multiCharOps                       : string[]
}

// ============================================================================
// LANGUAGE CONFIG
// ============================================================================

const DEFAULT_LANG             : Record<string, LanguageConfig> = {
    javascript                 : {
        lineComments           : ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters       : ['"', "'", '`'],
        alignChars             : [':', '{', '=', ','],
        multiCharOps           : ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
    },
    typescript                 : {
        lineComments           : ['//'],
        blockComments: [{ start: '/*', end: '*/' }]              ,
        stringDelimiters       : ['"', "'", '`']                 ,
        alignChars             : [':', '{', '=', ',']            ,
        multiCharOps           : ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
    }                                                            ,
    python                     : {
        lineComments           : ['#']                           ,
        blockComments          : []                              ,
        stringDelimiters       : ['"', "'"]                      ,
        alignChars             : ['=', ':', ',']                 ,
        multiCharOps           : ['==', '!=', '<='               , '>=']
    },
    php                        : {
        lineComments           : ['//', '#'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters       : ['"', "'", '`'],
        alignChars             : [':', '{', '=', ',', '->'],
        multiCharOps           : ['===', '!==', '==', '!=', '<=', '>=', '=>', '->', '<=>', '??']
    }
}
const FALLBACK                 : LanguageConfig = {
    lineComments               : ['//'],
    blockComments: [{ start    : '/*', end: '*/' }],
    stringDelimiters           : ['"', "'", '`'],
    alignChars                 : [':', '{', '=', ','],
    multiCharOps               : ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
}

function getLangConfig(lang: string): LanguageConfig {
    return DEFAULT_LANG[lang] ?? FALLBACK
}

// ============================================================================
// PURE: Split into blocks
// ============================================================================

function pure_SplitIntoBlocks(lines: string[]): Block[] {
    const blocks                              : Block[] = []
    let currentBlock                          : Block = []

    for(const line of lines) {
        switch(line.trim().length === 0) {
            case true: {
                switch(currentBlock.length > 0) {
                    case true: {
                        blocks.push(currentBlock)
                        currentBlock = []
                        break
                    }
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
// PURE: Extract comment markers
// ============================================================================

function pure_ExtractCommentMarkers(line: string, config: LanguageConfig): LineCommentMarkers {
    let lineCommentPos  = -1
    let blockCommentPos = -1

    for(const marker of config.lineComments) {
        const pos = line.indexOf(marker)
        switch(true) {
            case pos !== -1:
                switch(true) {
                    case lineCommentPos === -1:
                    case pos < lineCommentPos:
                        lineCommentPos = pos
                        break
                }
                break
        }
    }

    for(const block of config.blockComments) {
        const pos = line.indexOf(block.start)
        switch(true) {
            case pos !== -1:
                switch(true) {
                    case blockCommentPos === -1:
                    case pos < blockCommentPos:
                        blockCommentPos = pos
                        break
                }
                break
        }
    }

    return { lineCommentPos, blockCommentPos }
}

// ============================================================================
// PURE: Is inside string
// ============================================================================

function pure_IsInsideString(line: string, position: number, delimiters: string[]): boolean {
    let inString         = false
    let currentDelimiter = ''

    for(let i = 0; i <= position; i++) {
        const char     = line[i]!
        const prevChar = i > 0 ? line[i - 1]! : ''

        switch(true) {
            case prevChar === '\\':
                break
            case char === currentDelimiter:
                switch(inString) {
                    case true: {
                        inString = false
                        currentDelimiter = ''
                        break
                    }
                }
                break
            case inString:
                break
            case delimiters.includes(char):
                inString = true
                currentDelimiter = char
                break
        }
    }

    return inString
}

// ============================================================================
// PURE: Find block comment boundaries
// ============================================================================

function pure_FindBlockCommentStart(line: string, lineCommentPos: number, config: LanguageConfig): number {
    for(const block of config.blockComments) {
        const startPos = line.indexOf(block.start)
        switch(true) {
            case startPos !== -1:
                switch(true) {
                    case lineCommentPos === -1:
                    case startPos < lineCommentPos:
                        return startPos
                }
                break
        }
    }
    return -1
}

function pure_FindBlockCommentEnd(line: string, lineCommentPos: number, config: LanguageConfig): number {
    for(const block of config.blockComments) {
        const startPos = line.indexOf(block.start)
        switch(true) {
            case startPos !== -1:
                switch(true) {
                    case lineCommentPos !== -1:
                    case startPos >= lineCommentPos:
                        break
                }
                const endPos = line.indexOf(block.end, startPos + block.start.length)
                switch(endPos !== -1) {
                    case true: return endPos + block.end.length
                }
                break
        }
    }
    return -1
}

// ============================================================================
// PURE: Position validation
// ============================================================================

const enum PositionState {
    Valid             ,
    InsideLineComment ,
    InsideBlockComment,
    InsideString
}

function classifyPosition(
    line                                                   : string,
    pos                                                    : number,
    lineCommentPos                                         : number,
    blockStartPos                                          : number,
    blockEndPos                                            : number,
    delimiters                                             : string[]
)                                                          : PositionState {
    switch(true) {
        case lineCommentPos !== -1 && pos >= lineCommentPos:
            return PositionState.InsideLineComment
    }

    switch(true) {
        case blockStartPos !== -1 && blockEndPos !== -1 && pos >= blockStartPos && pos < blockEndPos:
            return PositionState.InsideBlockComment
    }

    switch(pure_IsInsideString(line, pos, delimiters)) {
        case true: return PositionState.InsideString
    }

    return PositionState.Valid
}

// ============================================================================
// PURE: Scan multi-char operators
// ============================================================================

function pure_ScanMultiCharOps(
    line          : string,
    lineCommentPos: number,
    config        : LanguageConfig
)                 : AlignPoint[] {
    const results : AlignPoint[] = []
    const multiCharOps = [...(config.multiCharOps || [])].sort((a, b) => b.length - a.length)
    const delimiters = config.stringDelimiters

    for(const op of multiCharOps) {
        let searchFrom = 0

        while(true) {
            const pos = line.indexOf(op, searchFrom)

            switch(pos) {
                case -1: {
                    break
                }
                default: {
                    const state = classifyPosition(
                        line,
                        pos,
                        lineCommentPos,
                        pure_FindBlockCommentStart(line, lineCommentPos, config),
                        pure_FindBlockCommentEnd(line, lineCommentPos, config),
                        delimiters
                    )

                    switch(state) {
                        case PositionState.Valid: {
                            results.push({ pos, op })
                            searchFrom = pos + op.length
                            break
                        }
                        default: {
                            searchFrom = pos + 1
                        }
                    }
                    break
                }
            }

            switch(pos) {
                case -1: break
                default: continue
            }
            break
        }
    }

    return results
}

// ============================================================================
// PURE: Scan single-char align points
// ============================================================================

function pure_ScanSingleCharAlignPoints(
    line          : string,
    alignChars    : string[],
    lineCommentPos: number,
    config        : LanguageConfig,
    taken?        : Set<number>
)                 : AlignPoint[] {
    const results : AlignPoint[] = []
    const delimiters = config.stringDelimiters

    for(let i = 0; i < line.length; i++) {
        switch(taken?.has(i)) {
            case true: continue
        }

        const char = line[i]!
        const state = classifyPosition(
            line                                                    ,
            i                                                       ,
            lineCommentPos                                          ,
            pure_FindBlockCommentStart(line, lineCommentPos, config),
            pure_FindBlockCommentEnd(line, lineCommentPos, config)  ,
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
// PURE: Find all align points
// ============================================================================

function pure_GetMultiCharOperatorPositions(
    line: string,
    lineCommentPos: number,
    config: LanguageConfig
): Set<number> {
    const taken = new Set<number>()
    const multiCharOps = [...(config.multiCharOps || [])].sort((a, b) => b.length - a.length)

    for(const op of multiCharOps) {
        let searchFrom = 0
        while(true) {
            const pos = line.indexOf(op, searchFrom)
            switch(pos) {
                case -1: break
                default: {
                    const state = classifyPosition(
                        line,
                        pos,
                        lineCommentPos,
                        pure_FindBlockCommentStart(line, lineCommentPos, config),
                        pure_FindBlockCommentEnd(line, lineCommentPos, config),
                        config.stringDelimiters
                    )
                    switch(state) {
                        case PositionState.Valid: {
                            for(let j = 0; j < op.length; j++) {
                                taken.add(pos + j)
                            }
                            searchFrom = pos + op.length
                            break
                        }
                        default:
                            searchFrom = pos + 1
                    }
                    break
                }
            }
            switch(pos) {
                case -1: break
                default: continue
            }
            break
        }
    }
    return taken
}

function pure_FindAlignPoints(
    line          : string                                                        ,
    alignChars    : string[]                                                      ,
    lineCommentPos: number                                                        ,
    config        : LanguageConfig
)                 : AlignPoint[] {
    const multi  = pure_ScanMultiCharOps(line, lineCommentPos                             , config)
    const taken  = pure_GetMultiCharOperatorPositions(line, lineCommentPos                , config)
    const single = pure_ScanSingleCharAlignPoints(line, alignChars, lineCommentPos, config, taken)

    const combined = [...multi, ...single]
    return combined.sort((a, b) => a.pos - b.pos)
}

// ============================================================================
// PURE: Extract operator sequence from align points
// ============================================================================

function pure_ExtractOperatorSequence(alignPoints: AlignPoint[]): string[] {
    return alignPoints.map(p => p.op)
}

function pure_FindCommonPrefix(sequences: string[][], minCoverage: number = 0.5): string[] {
    switch(sequences.length) {
        case 0: return []
    }

    const total = sequences.length
    const minCount = Math.ceil(total * minCoverage)
    const prefix: string[] = []

    const maxSeqLength = Math.max(...sequences.map(s => s.length))

    for(let i = 0; i < maxSeqLength; i++) {
        const counts = new Map<string, number>()
        let validCount = 0

        for(const seq of sequences) {
            switch(seq.length > i) {
                case true: {
                    const char = seq[i]!
                    counts.set(char, (counts.get(char) || 0) + 1)
                    validCount++
                    break
                }
            }
        }

        switch(validCount >= minCount) {
            case true: {
                const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
                const mostCommon = sorted[0]!

                switch(mostCommon[1] >= minCount) {
                    case true: prefix.push(mostCommon[0]); break
                    case false: return prefix
                }
                break
            }
            case false: return prefix
        }
    }

    return prefix
}

// ============================================================================
// PURE: Calculate align columns
// ============================================================================

function pure_CalculateAlignColumns(
    lines          : string[]  ,
    alignChars     : string[]  ,
    commonPrefix   : string[]  ,
    config         : LanguageConfig
)                  : Map<number, number>[] {
    const alignMaps: Map<number, number>[] = []

    for(const line of lines) {
        const                { lineCommentPos } = pure_ExtractCommentMarkers(line, config)
        const alignPoints = pure_FindAlignPoints(line, alignChars, lineCommentPos, config)
        const sequence = pure_ExtractOperatorSequence(alignPoints)

        const alignMap = new Map<number, number>()

        for(let prefixIndex = 0; prefixIndex < commonPrefix.length; prefixIndex++) {
            for(let opIndex = 0; opIndex < sequence.length; opIndex++) {
                switch(sequence[opIndex] === commonPrefix[prefixIndex]) {
                    case true: {
                        alignMap.set(prefixIndex, alignPoints[opIndex]!.pos)
                        break
                    }
                }
            }
        }

        alignMaps.push(alignMap)
    }

    return alignMaps
}

// ============================================================================
// PURE: Compute max columns
// ============================================================================

function pure_ComputeMaxColumns(alignMaps: Map<number, number>[]): Map<number, number> {
    const maxColumns = new Map<number                                        , number>()

    for(const alignMap of alignMaps) {
        for(const [idx, pos] of alignMap) {
            const current = maxColumns.get(idx) || 0
            switch(pos > current) {
                case true: maxColumns.set(idx, pos); break
            }
        }
    }

    return maxColumns
}

// ============================================================================
// PURE: Apply alignment
// ============================================================================

function pure_ApplyAlignment(
    line      : string,
    alignMap  : Map<number, number>,
    maxColumns: Map<number, number>,
    alignChars: string[]
)             : string {
    switch(alignMap.size) {
        case 0: return line
    }

    const sortedIndices = Array.from(alignMap.keys()).sort((a, b) => a - b)
    let result          = line
    let offset          = 0

    for(const idx of sortedIndices) {
        const originalPos = alignMap.get(idx)!
        const targetPos   = maxColumns.get(idx)!
        const currentPos  = originalPos + offset

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
// PURE: Filter pure comments
// ============================================================================

function pure_FilterPureComments(lines: string[], config: LanguageConfig): string[] {
    return lines.filter(line => {
        const trimmed = line.trim()
        for(const marker of config.lineComments) {
            switch(trimmed.startsWith(marker)) {
                case true: return false
            }
        }
        return true
    })
}

// ============================================================================
// MAIN ALIGN FUNCTION
// ============================================================================

function alignBlock(
    lines     : string[],
    config    : LanguageConfig
)             : string[] {
    switch(lines.length) {
        case 0: return []
        case 1: return [...lines]
    }

    const filteredBlock = pure_FilterPureComments(lines, config)
    switch(filteredBlock.length) {
        case 0: return [...lines]
    }

    const sequences: string[][] = []

    for(const line of filteredBlock) {
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, config)
        const alignPoints = pure_FindAlignPoints(line, config.alignChars, lineCommentPos, config)
        const sequence = pure_ExtractOperatorSequence(alignPoints)
        sequences.push(sequence)
    }

    const commonPrefix = pure_FindCommonPrefix(sequences)

    switch(commonPrefix.length) {
        case 0: return [...lines]
    }

    const alignMaps  = pure_CalculateAlignColumns(filteredBlock, config.alignChars, commonPrefix, config)
    const maxColumns = pure_ComputeMaxColumns(alignMaps)

    const alignedBlock: string[] = []
    for(let i = 0; i < filteredBlock.length; i++) {
        const aligned = pure_ApplyAlignment(filteredBlock[i]!, alignMaps[i]!, maxColumns, config.alignChars)
        alignedBlock.push(aligned)
    }

    return alignedBlock
}

function alignAll(lines: string[], config: LanguageConfig): string[] {
    const blocks = pure_SplitIntoBlocks(lines)
    const alignedBlocks = blocks.map(block => alignBlock(block, config))
    const result                                          : string[] = []

    for(let i = 0; i < alignedBlocks.length; i++) {
        result.push(...alignedBlocks[i]!)
        switch(i < alignedBlocks.length - 1) {
            case true: result.push(''); break
        }
    }

    return result
}

// ============================================================================
// EXPORTS (for testing)
// ============================================================================

export {
    pure_SplitIntoBlocks          ,
    pure_ExtractCommentMarkers    ,
    pure_IsInsideString           ,
    pure_FindBlockCommentStart    ,
    pure_FindBlockCommentEnd      ,
    pure_ScanMultiCharOps         ,
    pure_ScanSingleCharAlignPoints,
    pure_FindAlignPoints          ,
    pure_ExtractOperatorSequence  ,
    pure_FindCommonPrefix         ,
    pure_CalculateAlignColumns    ,
    pure_ComputeMaxColumns        ,
    pure_ApplyAlignment           ,
    pure_FilterPureComments       ,
    alignBlock                    ,
    alignAll                      ,
    AlignPoint                    ,
    Block                         ,
    LineCommentMarkers            ,
    LanguageConfig
}

// ============================================================================
// EXTENSION
// ============================================================================

export function activate(ctx: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Better Align')

    const logToChannel = (msg: string) => {
        outputChannel.show()
        outputChannel.appendLine(msg)
    }

    const alignCommand       = vscode.commands.registerTextEditorCommand(
        'vscode-better-align-columns.align',
        (editor: vscode.TextEditor) => {
            const doc        = editor.document
            const selections = editor.selections

            logToChannel('=== Align started ===')

            switch(selections.length) {
                case 0: {
                    logToChannel('No selection found')
                    vscode.window.showInformationMessage('No selection found')
                    return
                }
            }

            for(const sel of selections) {
                const startLine                                                                                           = sel.start.line
                const endLine                                                                                             = sel.end.line
                const isEmpty = sel.isEmpty || (startLine === endLine && sel.start.character === 0 && sel.end.character === doc.lineAt(endLine).text.length)

                switch(isEmpty) {
                    case true: {
                        const lineCount = doc.lineCount
                        const lines: string[] = []
                        for(let i = 0; i < lineCount; i++) {
                            const line = doc.lineAt(i)
                            lines.push(line.text)
                        }

                        logToChannel(`Processing full document (${lines.length} lines)`)

                        const langId = doc.languageId
                        const config = getLangConfig(langId)

                        const alignedLines = alignAll(lines, config)

                        const eol = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                        const text            = alignedLines.join(eol)

                        editor.edit((editBuilder: vscode.TextEditorEdit) => {
                            const range = new vscode.Range(
                                0, 0,
                                lineCount - 1, doc.lineAt(lineCount - 1).text.length
                            )
                            editBuilder.replace(range, text)
                        }).then((success: boolean) => {
                            switch(success) {
                                case true: {
                                    logToChannel('=== Done (full doc) ===')
                                    vscode.window.showInformationMessage(
                                        `Aligned ${alignedLines.length} line(s) in full document`
                                    )
                                    break
                                }
                                case false: {
                                    logToChannel('ERROR: Failed to write changes')
                                    vscode.window.showErrorMessage('Failed to write changes')
                                    break
                                }
                            }
                        })
                        break
                    }
                    default: {
                        const lines: string[] = []
                        for(let i = startLine; i <= endLine; i++) {
                            const line = doc.lineAt(i)
                            lines.push(line.text)
                        }

                        logToChannel(`Processing ${lines.length} lines (${startLine}-${endLine})`)

                        const langId = doc.languageId
                        const config = getLangConfig(langId)

                        const alignedLines = alignAll(lines, config)

                        const eol = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                        const text            = alignedLines.join(eol)

                        logToChannel(`Aligned ${alignedLines.length} lines`)

                        editor.edit((editBuilder: vscode.TextEditorEdit) => {
                            const range = new vscode.Range(
                                startLine, 0,
                                endLine, doc.lineAt(endLine).text.length
                            )
                            editBuilder.replace(range, text)
                        }).then((success: boolean) => {
                            switch(success) {
                                case true: {
                                    logToChannel('=== Done ===')
                                    vscode.window.showInformationMessage(
                                        `Aligned ${alignedLines.length} line(s)`
                                    )
                                    break
                                }
                                case false: {
                                    logToChannel('ERROR: Failed to write changes')
                                    vscode.window.showErrorMessage('Failed to write changes')
                                    break
                                }
                            }
                        })
                    }
                }
            }
        }
    )

    ctx.subscriptions.push(alignCommand, outputChannel)
}

export function deactivate() { }