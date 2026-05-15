import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent() {
    let z = 1
    let pq = { start: 0, end: 0 }
    return { startLine: 0, endLine: 0 }
}`

describe('Align object literal colon', () => {
    it('should NOT align colon in return to colon in object literal above', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const alignedLines = alignedContent.split('\n')

        const returnLine = alignedLines.find(l => l.trim().startsWith('return {'))
        assert.ok(returnLine, 'return line should exist')

        const bracePos = returnLine.indexOf('{')
        const beforeBrace = returnLine.slice(0, bracePos)

        assert.ok(beforeBrace.length < 15,
            `Brace in "return {" should NOT be pushed far right. Got ${beforeBrace.length} chars. Line: "${returnLine}"`)
    })
})
