import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `let long = {
    s1: test1('maxBlockSize', ''),
    preserveComments: test1('preserveComments', ''),
}`

const expectedOutput = "let long = {\n    s1              : test1('maxBlockSize'    , ''), \n    preserveComments: test1('preserveComments', ''), \n}"

describe('Align object literal colons', () => {
    it('should align colons in object literals', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        assert.strictEqual(alignedContent, expectedOutput,
            `Output does not match expected.\nGot:\n${alignedContent}\nExpected:\n${expectedOutput}`)
    })
})
