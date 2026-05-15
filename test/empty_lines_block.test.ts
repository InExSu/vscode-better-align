import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function pattern_MatchAt(
    line: string,
    pos: number,
    patterns: Pattern[]
): string | null {`

const expectedOutput = "function pattern_MatchAt(\n    line    : string,  \n    pos     : number,  \n    patterns: Pattern[]\n): string | null {"

describe('Align with empty lines', () => {
    it('should align function params but NOT return type colon', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        assert.strictEqual(alignedContent, expectedOutput,
            `Output does not match expected.\nGot:\n${alignedContent}\nExpected:\n${expectedOutput}`)
    })
})