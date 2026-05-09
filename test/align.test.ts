'use strict'

/// <reference types="mocha" />

import * as assert from 'assert'
import {
    pure_SplitIntoBlocks,
    pure_ExtractCommentMarkers,
    pure_IsInsideString,
    pure_FindBlockCommentStart,
    pure_FindBlockCommentEnd,
    pure_ScanMultiCharOps,
    pure_ScanSingleCharAlignPoints,
    pure_FindAlignPoints,
    pure_ExtractOperatorSequence,
    pure_FindCommonPrefix,
    pure_CalculateAlignColumns,
    pure_ComputeMaxColumns,
    pure_ApplyAlignment,
    pure_FilterPureComments,
    alignBlock,
    alignAll,
    LanguageConfig,
    AlignPoint
} from '../src/align/align'

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
        assert.deepStrictEqual(pure_FindCommonPrefix(sequences), [])
    })

    test('partial prefix', () => {
        const sequences = [['=', ':'], ['=', ','], ['=', ':']]
        assert.deepStrictEqual(pure_FindCommonPrefix(sequences), ['='])
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
