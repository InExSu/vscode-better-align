import * as assert from 'assert'
import {
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    buildPairwisePositionMap,
    DEFAULT_LANGUAGE_RULES,
    DEFAULT_CONFIG,
} from '../fsm_Main'

const vscode = 'vscode'

function lines(...args: string[]): string[] { return args }

function show(title: string, input: string[], output: string[]): void {
    console.log(`\n=== ${title} ===`)
    console.log('--- INPUT ---')
    input.forEach((l, i) => console.log(`${i} | ${l}`))
    console.log('--- OUTPUT ---')
    output.forEach((l, i) => console.log(`${i} | ${l}`))
}

describe('parseLineIgnoringStrings', () => {
    it('finds = marker', () => {
        const result = parseLineIgnoringStrings('const a = 1', DEFAULT_LANGUAGE_RULES)
        console.log('markers:', JSON.stringify(result.markers))
        assert.equal(result.markers.length, 1)
        assert.equal(result.markers[0].symbol, '=')
    })

    it('finds multiple markers', () => {
        const result = parseLineIgnoringStrings('a => b => c', DEFAULT_LANGUAGE_RULES)
        console.log('markers:', JSON.stringify(result.markers))
        assert.equal(result.markers.length, 2)
    })

    it('skips strings containing align chars', () => {
        const result = parseLineIgnoringStrings('const a = "=>"', DEFAULT_LANGUAGE_RULES)
        console.log('markers:', JSON.stringify(result.markers))
        assert.equal(result.markers.length, 1)
    })
})

describe('findLineBlocks', () => {
    it('groups lines with same indentation', () => {
        const input = lines('const a = 1', 'const b = 2', 'const c = 3')
        const blocks = findLineBlocks(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        console.log('blocks:', JSON.stringify(blocks, null, 2))
        assert.equal(blocks.length, 1)
        assert.equal(blocks[0].lines.length, 3)
    })

    it('separates blocks by different indentation', () => {
        const input = lines('const a = 1', 'const b = 2', '    const c = 3', '    const d = 4')
        const blocks = findLineBlocks(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        console.log('blocks:', JSON.stringify(blocks, null, 2))
        assert.equal(blocks.length, 2)
    })
})

describe('alignBlock', () => {
    it('aligns on =', () => {
        const input = lines('const a = 1', 'const bc = 22', 'const def = 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        show('align on =', input, output)
    })

    it('aligns on =>', () => {
        const input = lines('a => 1', 'ab => 22', 'abc => 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        show('align on =>', input, output)
    })

    it('aligns on :', () => {
        const input = lines('a: 1', 'ab: 22', 'abc: 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        show('align on :', input, output)
    })

    it('aligns TypeScript type annotations', () => {
        const input = lines(
            'type NSData = {',
            '    editor       : vscode.TextEditor | false',
            '    languageRules: LanguageRules | false',
            '    blocks       : LineBlock[]',
            '    parsedLines  : ParsedLine[][]',
            '    alignedLines: string[][]',
            '}'
        )
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        show('TypeScript types', input, output)
    })

    it('is idempotent - second pass should not change output', () => {
        const input = lines(
            'type NSData = {',
            '    editor       : vscode.TextEditor | false',
            '    languageRules: LanguageRules | false',
            '    blocks       : LineBlock[]',
            '    parsedLines  : ParsedLine[][]',
            '    alignedLines: string[][]',
            '}'
        )
        const parsed1 = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output1 = alignBlock(parsed1, DEFAULT_CONFIG.maxSpaces)
        
        const parsed2 = output1.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output2 = alignBlock(parsed2, DEFAULT_CONFIG.maxSpaces)
        
        show('first pass', input, output1)
        show('second pass', output1, output2)
        
        // Output should not change after second alignment
        const changed = output1.some((line, i) => line !== output2[i])
        assert.equal(changed, false, 'Alignment should be idempotent')
    })

    it('does not modify property names in type definitions', () => {
        const input = lines(
            'export type LanguageRules = {',
            '    lineComments: string[]',
            '    blockComments: { start: string; end: string }[]',
            '    stringDelimiters: string[]',
            '    alignChars: string[]',
            '}'
        )
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        console.log('markers:', parsed.map(pl => pl.markers.map(m => m.symbol + '@' + m.startCol).join(', ')))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        
        // Check that 'start' is not modified
        const hasStart = output.some(l => l.includes('start'))
        assert.equal(hasStart, true, 'start should not be modified to st')
        
        show('type with nested objects', input, output)
    })

    it('skips strings containing align chars', () => {
        const input = lines('const a = "=>"', 'const bc = "="')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        show('skip strings', input, output)
    })

    it('aligns function parameters and return types with : and =>', () => {
        const input = lines(
            'const ns_Error    = (ns: NS)           : boolean => ns.result.ok === false',
            'const ns_SetError = (ns: NS, e: string): void    => {'
        )
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        console.log('markers:', parsed.map(pl => pl.markers.map(m => m.symbol).join(' ')))
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces)
        show('function params + return', input, output)
    })

    it('aligns function call arguments', () => {
        const input = lines(
            'rwd(config_Load_Decor, ns)',
            'rwd(language_Detect_Decor, ns)'
        )
        
        const output = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            30
        )
        show('func args', input, output)
    })

    it('aligns Record type definitions', () => {
        const input = [
            `const LANGUAGE_RULES: Record<string, LanguageRules> = {`,
            `    typescript: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\"", "\`"], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    javascript: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\"", "\`"], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    python: { lineComments: ["#"], blockComments: [], stringDelimiters: ["\"", "\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    rust: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    go: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\`"], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    lua: { lineComments: ["--"], blockComments: [{ start: "--[[", end: "]]" }], stringDelimiters: ["\"", "\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    sql: { lineComments: ["--"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `}`
        ]
        
        const output = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            20
        )
        
        console.log("=== Record type ===")
        console.log("--- INPUT ---")
        input.forEach((l, i) => console.log(`${i} | ${l}`))
        console.log("--- OUTPUT ---")
        output.forEach((l, i) => console.log(`${i} | ${l}`))
    })

    it.skip('does not align generic type parameters', () => {
        const input = [
            `export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }`,
            `export const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })`,
            `export const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })`
        ]
        
        const output = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            30
        )
        
        console.log("=== generic type params ===")
        console.log("--- INPUT ---")
        input.forEach((l, i) => console.log(`${i} | ${l}`))
        console.log("--- OUTPUT ---")
        output.forEach((l, i) => console.log(`${i} | ${l}`))
        
        assert.equal(output[0], input[0], 'Line 0 should not change')
        assert.equal(output[1], input[1], 'Line 1 should not change')
        assert.equal(output[2], input[2], 'Line 2 should not change')
    })

    it('does not split >= operator', () => {
        const input = lines(
            'const a = 1',
            'const b >= 2'
        )
        const output = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        console.log("=== >= operator ===")
        console.log("--- INPUT ---")
        input.forEach((l, i) => console.log(`${i} | ${l}`))
        console.log("--- OUTPUT ---")
        output.forEach((l, i) => console.log(`${i} | ${l}`))
        
        assert.equal(output[0], input[0], 'Line 0 should not change')
        assert.equal(output[1], input[1], 'Line 1 should not change')
    })

    it('does not split >= in code like startCol >= maxCol', () => {
        const input = lines(
            'if(startCol >= maxCol) { continue }',
            'if(startCol < maxCol) { done }'
        )
        const output = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        console.log("=== >= in code ===")
        console.log("--- INPUT ---")
        input.forEach((l, i) => console.log(`${i} | ${l}`))
        console.log("--- OUTPUT ---")
        output.forEach((l, i) => console.log(`${i} | ${l}`))
        
        assert.equal(output[0], input[0], 'Line 0 should not change')
        assert.equal(output[1], input[1], 'Line 1 should not change')
    })

    it('aligns entire fsm_Main.ts without syntax errors', () => {
        const fs = require('fs')
        const input: string[] = fs.readFileSync('src/fsm_Main.ts', 'utf8').split('\n')
        
        const output = alignBlock(
            input.map((l: string) => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            30
        )
        
        const result = output.join('\n')
        
        console.log("=== fsm_Main.ts alignment ===")
        console.log("Lines:", input.length, "->", output.length)
        
        // Check that >= stayed together (not split into > followed by = with only spaces between)
        // This regex finds > followed by spaces and then = that is NOT preceded by >
        // But the simpler check: ensure original >= stays >= or better
        const originalContent = input.join('\n')
        
        // Extract all >= positions from original
        const originalMatches = [...originalContent.matchAll(/>=/g)]
        const outputMatches = [...result.matchAll(/>=/g)]
        
        console.log("Original >= count:", originalMatches.length)
        console.log("Output >= count:", outputMatches.length)
        
        // The output should have the same number of >= operators
        assert.equal(outputMatches.length, originalMatches.length, 'All >= operators should be preserved')
    })

    it('is idempotent - repeated alignments do not add spaces', () => {
        const input = lines(
            'const a = 1',
            'const b = 22'
        )
        
        const first = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        
        const second = alignBlock(
            first.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        
        const third = alignBlock(
            second.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        
        console.log("=== idempotent test ===")
        console.log("First :", first)
        console.log("Second:", second)
        console.log("Third :", third)
        
        assert.equal(first[0], second[0], 'First pass should equal second')
        assert.equal(second[0], third[0], 'Second pass should equal third')
        assert.equal(first.join('\n'), third.join('\n'), 'All passes should produce same result')
        })

        it('correctly aligns lines with varied existing whitespace', () => {
        const input = lines(
            'const a = 1;',
            'const bee  = 2;'
        );
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES));
        const output = alignBlock(parsed, DEFAULT_CONFIG.maxSpaces);
        show('varied whitespace', input, output);
        assert.deepStrictEqual(output, [
            'const a    = 1;',
            'const bee  = 2;'
        ]);
        });
        })

describe('buildPairwisePositionMap', () => {
    it('returns empty map for single line', () => {
        const input = lines('const a = 1')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, 10)
        assert.equal(posMap.size, 0, 'Single line should have empty map')
    })

    it('creates position map for two lines with same marker', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, 10)
        assert.ok(posMap.size > 0, 'Position map should not be empty for two lines')
    })

    it('sets correct target position for shorter marker', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, 10)
        const key = '0:0'
        assert.ok(posMap.has(key), 'Should have position for first line marker')
        assert.equal(posMap.get(key), 9, 'Target position should align with longest marker')
    })

    it('skips >= operator', () => {
        const input = lines('const a = 1', 'const b >= 2')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, 10)
        const keys = Array.from(posMap.keys())
        const hasGteKey = keys.some(k => parsed[parseInt(k.split(':')[0])].raw.includes('>='))
        assert.equal(hasGteKey, false, 'Should not create position for >= operator')
    })

    it('handles multiple different markers', () => {
        const input = lines('a: 1', 'ab: 22')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, 10)
        assert.ok(posMap.size > 0, 'Should create positions for : marker')
    })

    it('respects maxSpaces limit', () => {
        const input = lines('a = 1', 'abc = 22')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, 2)
        const key = '0:0'
        const target = posMap.get(key)
        const originalCol = parsed[0].markers[0].startCol
        assert.ok(target !== undefined, 'Should have position')
        assert.ok(target! - originalCol <= 2, 'Added spaces should not exceed maxSpaces')
    })
})