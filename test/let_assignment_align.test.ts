import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent() {
    let z = 1
    let pq = { start: 0, end: 0 }
    return { startLine: 0, endLine: 0 }
}`

describe('Align let assignments', () => {
    it('should align = in consecutive let statements', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        const lines = alignedContent.split('\n')
        const letLine1 = lines.find(l => l.includes('let z ='))
        const letLine2 = lines.find(l => l.includes('let pq =') || l.includes('let pq='))

        const pos1 = letLine1 ? letLine1.indexOf('=') : -1
        const pos2 = letLine2 ? letLine2.indexOf('=') : -1

        assert.ok(pos1 > 0 && pos2 > 0, 'Both lines should have =')
        assert.strictEqual(pos1, pos2, `= should be aligned. Got positions: ${pos1}, ${pos2}`)
    })
})