'use strict'
import * as vscode from 'vscode'

// ============================================================================
// RESULT TYPE
// ============================================================================

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })
const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ============================================================================
// NS
// ============================================================================

type NS = {
    result: Result<any>
    s_Error: string
    config: typeof CONFIG
    data: {
        editor: vscode.TextEditor | null
        lines: string[]
        blocks: string[][]
        parsedLines: AlignPoint[][][]
        commonPrefix: string[][]
        alignedText: string
    }
}

const ns_Error = (ns: NS): boolean => ns.result.ok === false
const ns_SetError = (ns: NS, e: string): void => {
    ns.result = err(e)
    ns.s_Error = e
}

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
    b_Debug: false,
    defaultAlignChars: [':', '{', '=', ',', '===', '!==', '==', '!=', '<=', '>=', '=>', '->', '+=', '-=', '*=', '/=', '<<=', '>>=', '>>>='],
    maxBlockSize: 500,
    preserveComments: true,
    preserveStrings: true,
    skipTemplates: true,
    greedyMatch: true,
    stringDelimiters: ['"', "'", '`']
}

// ============================================================================
// TYPES
// ============================================================================

type AlignPoint = { pos: number; op: string }
type Block = string[]

interface LanguageConfig {
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
    multiCharOps: string[]
}

// ============================================================================
// NS_CONTAINER
// ============================================================================

function NS_Container(cfg: typeof CONFIG): NS {
    return {
        result: ok({}),
        s_Error: '',
        config: cfg,
        data: {
            editor: null,
            lines: [],
            blocks: [],
            parsedLines: [],
            commonPrefix: [],
            alignedText: ''
        }
    }
}

// ============================================================================
// RWD & CHAIN
// ============================================================================

function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    fn(ns)
}

function a_Chain(ns: NS): void {
    rwd(editor_Get, ns)
    rwd(lines_Collect, ns)
    rwd(blocks_Split, ns)
    rwd(lines_Parse, ns)
    rwd(pattern_Compute, ns)
    rwd(alignment_Apply, ns)
    rwd(text_Replace, ns)
}

// ============================================================================
// PURE: Find if position is inside string
// ============================================================================

/**
 * States: default_Scanning, string_Opening, string_Reading, string_Closing
 */
function pure_IsInsideString(line: string, pos: number, delimiters: string[]): boolean {
    let state: 'default_Scanning' | 'string_Opening' | 'string_Reading' | 'string_Closing' = 'default_Scanning'
    let delimiter = ''

    outerLoop: while(true) {
        switch(state) {
            case 'default_Scanning': {
                if(pos <= 0) { break outerLoop }
                const ch = line[pos - 1]
                if(delimiters.includes(ch)) {
                    state = 'string_Opening'
                }
                pos--
                continue
            }
            case 'string_Opening': {
                delimiter = line[pos - 1]
                state = 'string_Reading'
                pos--
                continue
            }
            case 'string_Reading': {
                if(pos <= 0) { break outerLoop }
                const ch = line[pos - 1]
                if(ch === delimiter) {
                    state = 'string_Closing'
                }
                pos--
                continue
            }
            case 'string_Closing': {
                break outerLoop
            }
        }
    }

    return state === 'string_Closing'
}

// ============================================================================
// PURE: Find align points with greedy matching
// ============================================================================

/**
 * States: scan_Scanning, scan_MultiChar, scan_SingleChar
 */
function pure_FindAlignPoints(line: string, config: LanguageConfig): AlignPoint[] {
    const results: AlignPoint[] = []
    const takenPositions = new Set<number>()

    const sortedOps = [...config.multiCharOps].sort((a, b) => b.length - a.length)

    outerLoop: while(true) {
        let foundPos = -1
        let foundOp = ''

        for(const op of sortedOps) {
            const pos = line.indexOf(op)
            if(pos !== -1) {
                if(!pure_IsInsideString(line, pos, config.stringDelimiters)) {
                    const overlaps = takenPositions.has(pos)
                    if(!overlaps) {
                        foundPos = pos
                        foundOp = op
                        break
                    }
                }
            }
        }

        if(foundPos === -1) { break }

        for(let i = 0; i < foundOp.length; i++) {
            takenPositions.add(foundPos + i)
        }
        results.push({ pos: foundPos, op: foundOp })
    }

    for(let i = 0; i < line.length; i++) {
        if(takenPositions.has(i)) { continue }
        if(pure_IsInsideString(line, i, config.stringDelimiters)) { continue }

        const ch = line[i]
        if(config.alignChars.includes(ch)) {
            results.push({ pos: i, op: ch })
            takenPositions.add(i)
        }
    }

    return results.sort((a, b) => a.pos - b.pos)
}

// ============================================================================
// PURE: Extract feature sequence (emoji separator)
// ============================================================================

function pure_ExtractSequence(alignPoints: AlignPoint[]): string[] {
    return alignPoints.map(p => p.op)
}

// ============================================================================
// PURE: Find common prefix
// ============================================================================

/**
 * States: prefix_Init, prefix_Compare, prefix_Collect, prefix_Finish
 */
function pure_FindCommonPrefix(sequences: string[][], minCoverage: number = 0.5): string[][] {
    if(sequences.length === 0) { return [] }

    const total = sequences.length
    const minCount = Math.ceil(total * minCoverage)
    const prefix: string[][] = []

    const maxSeqLength = Math.max(...sequences.map(s => s.length))

    let seqIdx = 0
    outerPrefixLoop: while(seqIdx < maxSeqLength) {
        const counts = new Map<string, number>()

        let validCount = 0
        for(const seq of sequences) {
            if(seq.length > seqIdx) {
                const char = seq[seqIdx]
                counts.set(char, (counts.get(char) || 0) + 1)
                validCount++
            }
        }

        if(validCount < minCount) { break }

        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
        if(sorted.length === 0) { break }

        const [mostCommon, count] = sorted[0]

        if(count < minCount) { break }

        const currentPrefix: string[] = []
        for(const seq of sequences) {
            if(seq.length > seqIdx && seq[seqIdx] === mostCommon) {
                if(currentPrefix.length === 0) {
                    currentPrefix.push(...prefix.slice(-1)[0] || [])
                }
            }
        }

        prefix.push([...(prefix.length > 0 ? prefix[prefix.length - 1] : []), mostCommon])
        seqIdx++
    }

    return prefix.length > 0 ? [prefix[prefix.length - 1]] : []
}

// ============================================================================
// PURE: Split into blocks
// ============================================================================

function pure_SplitIntoBlocks(lines: string[]): Block[] {
    const blocks: Block[] = []
    let currentBlock: Block = []

    let idx = 0
    outerLoop: while(idx < lines.length) {
        const line = lines[idx]
        switch(line.trim().length === 0) {
            case true: {
                if(currentBlock.length > 0) {
                    blocks.push(currentBlock)
                    currentBlock = []
                }
                break
            }
            case false: {
                currentBlock.push(line)
                break
            }
        }
        idx++
    }

    if(currentBlock.length > 0) {
        blocks.push(currentBlock)
    }

    return blocks
}

// ============================================================================
// PURE: Align block
// ============================================================================

/**
 * States: align_Init, align_Collect, align_Compute, align_Apply, align_Finish
 */
function pure_AlignBlock(lines: string[], config: LanguageConfig): string[] {
    if(lines.length === 0) { return [] }
    if(lines.length === 1) { return [...lines] }

    const allAlignPoints: AlignPoint[][] = []
    for(const line of lines) {
        const points = pure_FindAlignPoints(line, config)
        allAlignPoints.push(points)
    }

    const sequences = allAlignPoints.map(p => pure_ExtractSequence(p))
    const prefixResult = pure_FindCommonPrefix(sequences)

    if(prefixResult.length === 0) { return [...lines] }

    const maxSlot = Math.max(...allAlignPoints.map(p => p.length))
    if(maxSlot === 0) { return [...lines] }

    const slotPositions: number[][] = Array.from({ length: maxSlot }, () => [])

    for(const points of allAlignPoints) {
        for(let slot = 0; slot < maxSlot; slot++) {
            const p = points[slot]
            slotPositions[slot].push(p ? p.pos : -1)
        }
    }

    const alignedLines = lines.map((line, lineIdx) => {
        const points = allAlignPoints[lineIdx]
        let result = line
        let offset = 0

        let slot = 0
        outerSlotLoop: while(slot < maxSlot) {
            const slotMax = Math.max(...slotPositions[slot].filter(p => p !== -1))
            const thisPoint = points[slot]

            if(thisPoint === undefined) {
                slot++
                continue
            }

            const currentPos = thisPoint.pos + offset

            if(currentPos < slotMax) {
                const targetPos = slotMax
                let canAlign = true

                for(let p = thisPoint.pos; p < targetPos; p++) {
                    if(pure_IsInsideString(line, p, config.stringDelimiters)) {
                        canAlign = false
                        break
                    }
                }

                if(canAlign) {
                    const spaces = ' '.repeat(targetPos - currentPos)
                    result = result.slice(0, currentPos) + spaces + result.slice(currentPos)
                    offset += targetPos - currentPos
                }
            }

            slot++
        }

        return result
    })

    return alignedLines
}

// ============================================================================
// PURE: Align all
// ============================================================================

function pure_AlignAll(lines: string[], config: LanguageConfig): string[] {
    const blocks = pure_SplitIntoBlocks(lines)
    const result: string[] = []

    let blockIdx = 0
    outerBlockLoop: while(blockIdx < blocks.length) {
        const aligned = pure_AlignBlock(blocks[blockIdx], config)
        result.push(...aligned)
        if(blockIdx < blocks.length - 1) {
            result.push('')
        }
        blockIdx++
    }

    return result
}

// ============================================================================
// _DECOR: editor_Get
// ============================================================================

function editor_Get(ns: NS): void {
    const editor = vscode.window.activeTextEditor ?? null
    ns.data.editor = editor
    if(!editor) {
        ns_SetError(ns, 'No active editor')
        return
    }
    ns.result = ok(editor)
}

// ============================================================================
// _DECOR: lines_Collect
// ============================================================================

function lines_Collect(ns: NS): void {
    if(CONFIG.b_Debug) { return }
    const editor = ns.data.editor
    if(!editor) {
        ns_SetError(ns, 'No editor')
        return
    }
    const lines: string[] = []
    for(let i = 0; i < editor.document.lineCount; i++) {
        lines.push(editor.document.lineAt(i).text)
    }
    ns.data.lines = lines
    ns.result = ok(lines)
}

// ============================================================================
// _DECOR: blocks_Split
// ============================================================================

function blocks_Split(ns: NS): void {
    const lines = ns.data.lines
    const config = ns.config
    const langConfig: LanguageConfig = {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: config.stringDelimiters,
        alignChars: config.defaultAlignChars,
        multiCharOps: config.defaultAlignChars
    }
    const blocks = pure_SplitIntoBlocks(lines)
    ns.data.blocks = blocks
    ns.result = ok(blocks)
}

// ============================================================================
// _DECOR: lines_Parse
// ============================================================================

function lines_Parse(ns: NS): void {
    const blocks = ns.data.blocks
    const config = ns.config
    const langConfig: LanguageConfig = {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: config.stringDelimiters,
        alignChars: config.defaultAlignChars,
        multiCharOps: config.defaultAlignChars
    }
    const parsedLines: AlignPoint[][][] = []

    let blockIdx = 0
    outerBlockLoop: while(blockIdx < blocks.length) {
        const blockPoints: AlignPoint[][] = []
        for(const line of blocks[blockIdx]) {
            blockPoints.push(pure_FindAlignPoints(line, langConfig))
        }
        parsedLines.push(blockPoints)
        blockIdx++
    }

    ns.data.parsedLines = parsedLines
    ns.result = ok(parsedLines)
}

// ============================================================================
// _DECOR: pattern_Compute
// ============================================================================

function pattern_Compute(ns: NS): void {
    const parsedLines = ns.data.parsedLines
    const sequences = parsedLines.map(block =>
        block.map(points => pure_ExtractSequence(points))
    )

    const allPrefixes: string[][] = []
    for(const blockSeq of sequences) {
        const prefix = pure_FindCommonPrefix(blockSeq)
        allPrefixes.push(...prefix)
    }

    ns.data.commonPrefix = allPrefixes
    ns.result = ok(allPrefixes)
}

// ============================================================================
// _DECOR: alignment_Apply
// ============================================================================

function alignment_Apply(ns: NS): void {
    const lines = ns.data.lines
    const config = ns.config
    const langConfig: LanguageConfig = {
        lineComments: ['//'],
        blockComments: [{ start: '/*', end: '*/' }],
        stringDelimiters: config.stringDelimiters,
        alignChars: config.defaultAlignChars,
        multiCharOps: config.defaultAlignChars
    }
    const aligned = pure_AlignAll(lines, langConfig)
    ns.data.alignedText = aligned.join('\n')
    ns.result = ok(ns.data.alignedText)
}

// ============================================================================
// _DECOR: text_Replace
// ============================================================================

function text_Replace(ns: NS): void {
    if(CONFIG.b_Debug) { return }
    const editor = ns.data.editor
    if(!editor) {
        ns_SetError(ns, 'No editor')
        return
    }
    const text = ns.data.alignedText
    const fullRange = new vscode.Range(
        0, 0,
        editor.document.lineCount - 1,
        editor.document.lineAt(editor.document.lineCount - 1).text.length
    )
    editor.edit(e => e.replace(fullRange, text)).then(
        (success: boolean) => {
            ns.result = success ? ok(true) : err('Edit failed')
        },
        (e: unknown) => {
            ns_SetError(ns, String(e))
        }
    )
}

// ============================================================================
// EXTENSION
// ============================================================================

export function activate(ctx: vscode.ExtensionContext): void {
    const ns: NS = NS_Container(CONFIG)
    a_Chain(ns)

    if(ns.s_Error) {
        vscode.window.showErrorMessage(ns.s_Error)
    } else {
        vscode.window.showInformationMessage('Better Align: aligned successfully')
    }

    ctx.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'vscode-better-align-columns.align',
            (editor: vscode.TextEditor) => {
                const lines: string[] = []
                for(let i = 0; i < editor.document.lineCount; i++) {
                    lines.push(editor.document.lineAt(i).text)
                }

                const config: LanguageConfig = {
                    lineComments: ['//'],
                    blockComments: [{ start: '/*', end: '*/' }],
                    stringDelimiters: CONFIG.stringDelimiters,
                    alignChars: CONFIG.defaultAlignChars,
                    multiCharOps: CONFIG.defaultAlignChars
                }

                const aligned = pure_AlignAll(lines, config)
                const eol = editor.document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                const text = aligned.join(eol)

                const fullRange = new vscode.Range(
                    0, 0,
                    editor.document.lineCount - 1,
                    editor.document.lineAt(editor.document.lineCount - 1).text.length
                )

                editor.edit(e => e.replace(fullRange, text)).then(
                    (success: boolean) => {
                        if(success) {
                            vscode.window.showInformationMessage(`Aligned ${aligned.length} line(s)`)
                        }
                    }
                )
            }
        )
    )
}

export function deactivate(): void { }
