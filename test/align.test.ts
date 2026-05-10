import * as assert from 'assert'
import {
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    buildPairwisePositionMap,
    applyPositionMap,
    DEFAULT_LANGUAGE_RULES,
    DEFAULT_DEFAULT_CONFIG,
} from '../src/testPure'

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
        const output = alignBlock(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        show('align on =', input, output)
    })

    it('aligns on =>', () => {
        const input = lines('a => 1', 'ab => 22', 'abc => 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        show('align on =>', input, output)
    })

    it('aligns on :', () => {
        const input = lines('a: 1', 'ab: 22', 'abc: 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
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
        const output = alignBlock(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
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
        const output1 = alignBlock(parsed1, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        
        const parsed2 = output1.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output2 = alignBlock(parsed2, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        
        show('first pass', input, output1)
        show('second pass', output1, output2)
        
        // Output should not change after second alignment
        const changed = output1.some((line, i) => line !== output2[i])
        assert.equal(changed, false, 'Alignment should be idempotent')
    })

    it('skips strings containing align chars', () => {
        const input = lines('const a = "=>"', 'const bc = "="')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        show('skip strings', input, output)
    })

    it('aligns function parameters and return types with : and =>', () => {
        const input = lines(
            'const ns_Error    = (ns: NS)           : boolean => ns.result.ok === false',
            'const ns_SetError = (ns: NS, e: string): void    => {'
        )
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        console.log('markers:', parsed.map(pl => pl.markers.map(m => m.symbol).join(' ')))
        const output = alignBlock(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
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

    it('aligns object type properties at depth 0 only', () => {
        const input = lines(
            'type X = { a: number }',
            'type Y = { b: string }'
        )
        const output = alignBlock(
            input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES)),
            30
        )
        console.log('=== object depth ===')
        console.log('--- INPUT ---')
        input.forEach((l, i) => console.log(`${i} | ${l}`))
        console.log('--- OUTPUT ---')
        output.forEach((l, i) => console.log(`${i} | ${l}`))
    })
})

describe('buildPairwisePositionMap', () => {
    it('creates position map for aligned markers', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        
        console.log('position map:', Array.from(posMap.entries()))
        assert.ok(posMap.size > 0, 'Position map should not be empty')
    })
})

describe('applyPositionMap', () => {
    it('applies position map to produce aligned lines', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const posMap = buildPairwisePositionMap(parsed, DEFAULT_DEFAULT_CONFIG.maxSpaces)
        const output = applyPositionMap(parsed, posMap)
        
        console.log('output:', output)
        assert.equal(output.length, input.length)
    })
})
