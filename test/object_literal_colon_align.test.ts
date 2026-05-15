import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `let long = {
    s1: test1('maxBlockSize', ''),
    preserveComments: test1('preserveComments', ''),
}`

describe('Align object literal colons', () => {
    it('should align colons in object literals', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const alignedLines = alignedContent.split('\n')

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
