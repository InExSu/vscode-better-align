import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `if(x === 1) { }
if(longName === 2) { }
if(x === 1) { }`

describe('Align if conditions', () => {
    it('should align === with one space after variable', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const lines = alignedContent.split('\n')

        const expected = `if(x        === 1) { }
if(longName === 2) { }
if(x        === 1) { }`

        assert.strictEqual(alignedContent, expected, `Expected:\n${expected}\n\nGot:\n${alignedContent}`)
    })
})