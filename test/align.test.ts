'use strict'

/// <reference types="mocha" />

import * as assert from 'assert'

// Replicate pure functions inline for testing (vscode import is separate)
type AlignPoint = { pos: number; op: string }
type Block = string[]

interface LineCommentMarkers {
    lineCommentPos: number
    blockCommentPos: number
}

interface LanguageConfig {
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
    multiCharOps: string[]
}

const enum PositionState {
    Valid,
    InsideLineComment,
    InsideBlockComment,
    InsideString
}

function pure_SplitIntoBlocks(lines: string[]): Block[] {
    const blocks: Block[] = []
    let currentBlock: Block = []

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

function pure_ExtractCommentMarkers(line: string, config: LanguageConfig): LineCommentMarkers {
    let lineCommentPos = -1
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

function pure_IsInsideString(line: string, position: number, delimiters: string[]): boolean {
    let inString = false
    let currentDelimiter = ''

    for(let i = 0; i <= position; i++) {
        const char = line[i]!
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

function classifyPosition(
    line: string,
    pos: number,
    lineCommentPos: number,
    blockStartPos: number,
    blockEndPos: number,
    delimiters: string[]
): PositionState {
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

function pure_ScanMultiCharOps(
    line: string,
    lineCommentPos: number,
    config: LanguageConfig
): AlignPoint[] {
    const results: AlignPoint[] = []
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

function pure_ScanSingleCharAlignPoints(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    config: LanguageConfig
): AlignPoint[] {
    const results: AlignPoint[] = []
    const delimiters = config.stringDelimiters

    for(let i = 0; i < line.length; i++) {
        const char = line[i]!
        const state = classifyPosition(
            line,
            i,
            lineCommentPos,
            pure_FindBlockCommentStart(line, lineCommentPos, config),
            pure_FindBlockCommentEnd(line, lineCommentPos, config),
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

function pure_FindAlignPoints(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    config: LanguageConfig
): AlignPoint[] {
    const multi = pure_ScanMultiCharOps(line, lineCommentPos, config)
    const single = pure_ScanSingleCharAlignPoints(line, alignChars, lineCommentPos, config)

    for(const m of multi) {
        const overlapping = single.findIndex(s => s.pos === m.pos)
        switch(overlapping) {
            case -1: break
            default: single.splice(overlapping, 1)
        }
    }

    const combined = [...multi, ...single]
    return combined.sort((a, b) => a.pos - b.pos)
}

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

function pure_CalculateAlignColumns(
    lines: string[],
    alignChars: string[],
    commonPrefix: string[],
    config: LanguageConfig
): Map<number, number>[] {
    const alignMaps: Map<number, number>[] = []

    for(const line of lines) {
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, config)
        const alignPoints = pure_FindAlignPoints(line, alignChars, lineCommentPos, config)
        const sequence = pure_ExtractOperatorSequence(alignPoints)

        const alignMap = new Map<number, number>()
        let prefixIndex = 0

        for(let i = 0; i < alignPoints.length && prefixIndex < commonPrefix.length; i++) {
            switch(sequence[i]) {
                case commonPrefix[prefixIndex]: {
                    alignMap.set(prefixIndex, alignPoints[i]!.pos)
                    prefixIndex++
                    break
                }
            }
        }

        alignMaps.push(alignMap)
    }

    return alignMaps
}

function pure_ComputeMaxColumns(alignMaps: Map<number, number>[]): Map<number, number> {
    const maxColumns = new Map<number, number>()

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

function alignBlock(
    lines: string[],
    config: LanguageConfig
): string[] {
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

    const alignMaps = pure_CalculateAlignColumns(filteredBlock, config.alignChars, commonPrefix, config)
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
    const result: string[] = []

    for(let i = 0; i < alignedBlocks.length; i++) {
        result.push(...alignedBlocks[i]!)
        switch(i < alignedBlocks.length - 1) {
            case true: result.push(''); break
        }
    }

    return result
}

const JS_CONFIG: LanguageConfig = {
    lineComments: ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars: [':', '{', '=', ','],
    multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
}

const PY_CONFIG: LanguageConfig = {
    lineComments: ['#'],
    blockComments: [],
    stringDelimiters: ['"', "'"],
    alignChars: ['=', ':', ','],
    multiCharOps: ['==', '!=', '<=', '>=']
}

suite('pure_SplitIntoBlocks', () => {
    test('splits by empty lines', () => {
        const input = ['const x = 1', 'const y = 2', '', 'const z = 3']
        const expected = [['const x = 1', 'const y = 2'], ['const z = 3']]
        assert.deepStrictEqual(pure_SplitIntoBlocks(input), expected)
    })

    test('single block', () => {
        const input = ['a = 1', 'b = 2', 'c = 3']
        assert.deepStrictEqual(pure_SplitIntoBlocks(input), [[ 'a = 1', 'b = 2', 'c = 3' ]])
    })

    test('empty lines at start and end', () => {
        const input = ['', 'a = 1', 'b = 2', '']
        assert.deepStrictEqual(pure_SplitIntoBlocks(input), [['a = 1', 'b = 2']])
    })
})

suite('pure_ExtractCommentMarkers', () => {
    test('finds line comment', () => {
        const result = pure_ExtractCommentMarkers('const x = 1 // comment', JS_CONFIG)
        assert.strictEqual(result.lineCommentPos, 12)
        assert.strictEqual(result.blockCommentPos, -1)
    })

    test('no comments', () => {
        const result = pure_ExtractCommentMarkers('const x = 1', JS_CONFIG)
        assert.strictEqual(result.lineCommentPos, -1)
        assert.strictEqual(result.blockCommentPos, -1)
    })

    test('finds block comment start', () => {
        const result = pure_ExtractCommentMarkers('/* block */ const x = 1', JS_CONFIG)
        assert.strictEqual(result.blockCommentPos, 0)
    })
})

suite('pure_IsInsideString', () => {
    test('outside string', () => {
        assert.strictEqual(pure_IsInsideString('const x = 1', 5, ['"', "'"]), false)
    })

    test('inside double quotes', () => {
        assert.strictEqual(pure_IsInsideString('const x = "hello"', 11, ['"', "'"]), true)
    })

    test('after closing quote', () => {
        assert.strictEqual(pure_IsInsideString('const x = "hello" + 1', 18, ['"', "'"]), false)
    })

    test('handles escaped quotes', () => {
        assert.strictEqual(pure_IsInsideString('const x = "he\\"llo"', 13, ['"', "'"]), true)
    })
})

suite('pure_ScanSingleCharAlignPoints', () => {
    test('finds align chars', () => {
        const result = pure_ScanSingleCharAlignPoints('const x = 1', ['=', ':', ','], -1, JS_CONFIG)
        const ops = result.map(p => p.op)
        assert.deepStrictEqual(ops, ['='])
    })

    test('ignores chars inside strings', () => {
        const result = pure_ScanSingleCharAlignPoints('const x = ":"', ['=', ':'], -1, JS_CONFIG)
        const ops = result.map(p => p.op)
        assert.deepStrictEqual(ops, ['='])
    })

    test('ignores chars after line comment', () => {
        const result = pure_ScanSingleCharAlignPoints('const x = 1 // : = ,', [':', '='], 15, JS_CONFIG)
        const ops = result.map(p => p.op)
        assert.deepStrictEqual(ops, ['='])
    })
})

suite('pure_ScanMultiCharOps', () => {
    test('finds ===', () => {
        const result = pure_ScanMultiCharOps('if (a === b)', -1, JS_CONFIG)
        const found = result.find(p => p.op === '===')
        assert.ok(found !== undefined, 'Should find === operator')
        assert.strictEqual(found!.pos, 6)
    })

    test('finds =>', () => {
        const result = pure_ScanMultiCharOps('const fn = () => 1', -1, JS_CONFIG)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0]!.op, '=>')
    })

    test('ignores inside strings', () => {
        const result = pure_ScanMultiCharOps('const x = "a === b"', -1, JS_CONFIG)
        assert.strictEqual(result.length, 0)
    })
})

suite('pure_FindAlignPoints', () => {
    test('finds mixed operators', () => {
        const line = 'const x: { value: 10 }'
        const result = pure_FindAlignPoints(line, [':', '{', '=', ','], -1, JS_CONFIG)
        const ops = result.map(p => p.op)
        assert.ok(ops.includes('{'), 'Should include {')
        assert.ok(ops.includes(':'), 'Should include :')
    })
})

suite('pure_FindCommonPrefix', () => {
    test('all same operators', () => {
        const sequences = [['='], ['='], ['=']]
        assert.deepStrictEqual(pure_FindCommonPrefix(sequences), ['='])
    })

    test('mixed operators', () => {
        const sequences = [['=', ':'], ['=', ':'], ['=', ':']]
        assert.deepStrictEqual(pure_FindCommonPrefix(sequences), ['=', ':'])
    })

    test('no common prefix', () => {
        const sequences = [['='], [':']]
        assert.deepStrictEqual(pure_FindCommonPrefix(sequences, 0.5), ['='])
    })

    test('partial prefix', () => {
        const sequences = [['=', ':'], ['=', ','], ['=', ':']]
        assert.deepStrictEqual(pure_FindCommonPrefix(sequences, 0.5), ['=', ':'])
    })
})

suite('pure_ComputeMaxColumns', () => {
    test('finds max positions', () => {
        const maps: Map<number, number>[] = [
            new Map([[0, 10]]),
            new Map([[0, 12]]),
            new Map([[0, 11]])
        ]
        const result = pure_ComputeMaxColumns(maps)
        assert.strictEqual(result.get(0), 12)
    })
})

suite('pure_ApplyAlignment', () => {
    test('adds spaces', () => {
        const alignMap = new Map([[0, 2]])
        const maxCols = new Map([[0, 5]])
        const result = pure_ApplyAlignment('x = 1', alignMap, maxCols, ['='])
        assert.strictEqual(result, 'x    = 1')
    })

    test('no change when aligned', () => {
        const alignMap = new Map([[0, 5]])
        const maxCols = new Map([[0, 5]])
        const result = pure_ApplyAlignment('const x = 1', alignMap, maxCols, ['='])
        assert.strictEqual(result, 'const x = 1')
    })
})

suite('alignBlock', () => {
    test('basic alignment', () => {
        const lines = ['const x = 1', 'const yy = 22', 'const zzz = 333']
        const result = alignBlock(lines, JS_CONFIG)
        assert.strictEqual(result[0], 'const x   = 1')
        assert.strictEqual(result[1], 'const yy  = 22')
        assert.strictEqual(result[2], 'const zzz = 333')
    })

    test('preserves block when no common prefix', () => {
        const lines = ['a = 1', 'b : 2']
        const result = alignBlock(lines, JS_CONFIG)
        assert.deepStrictEqual(result, lines)
    })
})

suite('alignAll', () => {
    test('aligns multiple blocks', () => {
        const lines = ['const x = 1', 'const yy = 22', '', 'const z = 3', 'const w = 44']
        const result = alignAll(lines, JS_CONFIG)
        assert.strictEqual(result[0], 'const x  = 1')
        assert.strictEqual(result[1], 'const yy = 22')
        assert.strictEqual(result[2], '')
        assert.strictEqual(result[3], 'const z = 3')
        assert.strictEqual(result[4], 'const w = 44')
    })

    test('aligns object literal with mixed lines', () => {
        const lines = [
            "        lineComments: ['//'],",
            "        blockComments: [{ start: '/*', end: '*/' }],",
            "        stringDelimiters: ['\"', \"'\", '`'],",
            "        alignChars: [':', '{', '=', ','],",
            "        multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']",
            "    },",
            "    python: {",
            "        lineComments: ['#'],",
            "        blockComments: [],",
            "        stringDelimiters: ['\"', \"'\"],",
            "        alignChars: ['=', ':', ','],",
            "        multiCharOps: ['==', '!=', '<=', '>=']",
        ]

        // Debug: check sequences
        const sequences = lines.map(line => {
            const { lineCommentPos } = pure_ExtractCommentMarkers(line, JS_CONFIG)
            const alignPoints = pure_FindAlignPoints(line, JS_CONFIG.alignChars, lineCommentPos, JS_CONFIG)
            return pure_ExtractOperatorSequence(alignPoints)
        })
        console.log('Sequences:')
        sequences.forEach((seq, i) => console.log(`  ${i}: ${JSON.stringify(seq)}`))

        const commonPrefix = pure_FindCommonPrefix(sequences, 0.5)
        console.log('Common prefix:', JSON.stringify(commonPrefix))

        const result = alignBlock(lines, JS_CONFIG)

        assert.strictEqual(result.length, lines.length)

        const colonPositions = result.map(line => {
            const pos = line.indexOf(':')
            return pos !== -1 ? pos : -1
        })
        console.log('Colon positions after alignment:', colonPositions)

        const linesWithColons = sequences.map((seq, i) => seq.includes(':') ? i : -1).filter(i => i !== -1)
        const colonPositionsFiltered = colonPositions.filter((_, i) => linesWithColons.includes(i))
        const allSameColons = colonPositionsFiltered.every(p => p === colonPositionsFiltered[0])
        assert.strictEqual(allSameColons, true, 'All colons should be at same position')
    })
})

suite('Python config', () => {
    test('aligns Python dict', () => {
        const lines = ['x = { "a": 1, "bb": 2 }', 'y = { "ccc": 3 }']
        const result = alignBlock(lines, PY_CONFIG)
        assert.strictEqual(result[0], 'x = { "a"  : 1, "bb": 2 }')
    })

    test('aligns Python assignments', () => {
        const lines = ['x = 1', 'yy = 22', 'zzz = 333']
        const result = alignBlock(lines, PY_CONFIG)
        assert.strictEqual(result[0], 'x   = 1')
        assert.strictEqual(result[1], 'yy  = 22')
        assert.strictEqual(result[2], 'zzz = 333')
    })
})
