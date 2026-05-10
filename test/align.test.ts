import * as assert from 'assert'
import {
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    DEFAULT_LANGUAGE_RULES,
} from '../src/extension'

function lines(...args: string[]): string[] { return args }

function show(input: string[], output: string[]): void {
    console.log('\n--- INPUT ---')
    input.forEach((l, i) => console.log(`${i} | ${l}`))
    console.log('\n--- OUTPUT ---')
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

    it('separates blocks by empty line', () => {
        const input = lines('const a = 1', '', 'const b = 2')
        const blocks = findLineBlocks(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        console.log('blocks:', JSON.stringify(blocks, null, 2))
        assert.equal(blocks.length, 2)
    })
})

describe('alignBlock', () => {
    it('aligns on =', () => {
        const input = lines('const a = 1', 'const bc = 22', 'const def = 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, 10)
        show(input, output)
        assert.ok(output[0].includes('    '))
    })

    it('aligns on =>', () => {
        const input = lines('a => 1', 'ab => 22', 'abc => 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, 10)
        show(input, output)
    })

    it('aligns on :', () => {
        const input = lines('a: 1', 'ab: 22', 'abc: 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, 10)
        show(input, output)
    })

    it('aligns on multiple markers', () => {
        const input = lines('a => b: 1', 'ab => bc: 22', 'abc => def: 333')
        const parsed = input.map(l => parseLineIgnoringStrings(l, DEFAULT_LANGUAGE_RULES))
        const output = alignBlock(parsed, 10)
        show(input, output)
    })
})