import * as assert from 'assert'
import { languageRules_Detect, DEFAULT_CONFIG, blocks_Find, line_Parse, block_Align } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent() {
    let z = 1
    let pq = { start: 0, end: 0 }
    return { startLine: 0, endLine: 0 }
}`

describe('Align object literal colon', () => {
    it('should NOT align colon in return to colon in object literal above', () => {
        const lines = sourceCode.split('\n')
        const rules = languageRules_Detect('typescript', DEFAULT_CONFIG.defaultAlignChars)
        const blocks = blocks_Find(lines, 0, rules, DEFAULT_CONFIG.maxBlockSize)

        const alignedLines = [...lines]
        for (const block of blocks) {
            const parsedLines = block.lines.map(s_Raw => line_Parse(s_Raw, rules))
            const alignedBlock = block_Align(parsedLines, DEFAULT_CONFIG.maxSpaces)
            for (let i = 0; i < alignedBlock.length; i++) {
                alignedLines[block.startLine + i] = alignedBlock[i]
            }
        }

        const returnLine = alignedLines.find(l => l.trim().startsWith('return {'))
        assert.ok(returnLine, 'return line should exist')

        const bracePos = returnLine.indexOf('{')
        const beforeBrace = returnLine.slice(0, bracePos)

        assert.ok(beforeBrace.length < 15,
            `Brace in "return {" should NOT be pushed far right. Got ${beforeBrace.length} chars. Line: "${returnLine}"`)
    })
})