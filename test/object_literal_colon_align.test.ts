import * as assert from 'assert'
import { languageRules_Detect, DEFAULT_CONFIG, blocks_Find, line_Parse, block_Align } from '../src/fsm_Main'

const sourceCode = `let long = {
    s1: test1('maxBlockSize', ''),
    preserveComments: test1('preserveComments', ''),
}`

describe('Align object literal colons', () => {
    it('should align colons in object literals', () => {
        const lines = sourceCode.split('\n')
        const rules = languageRules_Detect('typescript', DEFAULT_CONFIG.defaultAlignChars)
        const blocks = blocks_Find(lines, 0, rules, DEFAULT_CONFIG.maxBlockSize)

        const alignedLines = [...lines]
        for (const block of blocks) {
            const parsedLines = block.lines.map(s_Raw => ({ raw: s_Raw, tokens: [], markers: [] }))
            const alignedBlock = block_Align(parsedLines, DEFAULT_CONFIG.maxSpaces)
            for (let i = 0; i < alignedBlock.length; i++) {
                alignedLines[block.startLine + i] = alignedBlock[i]
            }
        }

        const colonPositions = alignedLines
            .filter(l => /\b[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/.test(l))
            .map(l => {
                const match = l.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/)
                return match ? l.indexOf(':') : -1
            })

        assert.ok(colonPositions.length >= 2, 'Should have at least 2 lines with colons')
        assert.strictEqual(colonPositions[0], colonPositions[1],
            `Colons should be aligned. Got positions: ${colonPositions.join(', ')}`)
    })
})