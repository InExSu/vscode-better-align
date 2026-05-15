import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent() {
    let z = 1
    let pq = { start: 0, end: 0 }
    return { startLine: 0, endLine: 0 }
}`

const expectedOutput = "function fn_AutoSearchIndent() {\n    let z = 1         \n    let pq= { start: 0, end: 0 }\n    return { startLine: 0, endLine: 0 }\n}"

describe('Align let assignments', () => {
    it('should align = in consecutive let statements', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        assert.strictEqual(alignedContent, expectedOutput,
            `Output does not match expected.\nGot:\n${alignedContent}\nExpected:\n${expectedOutput}`)
    })
})