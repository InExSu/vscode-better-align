import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    ctx.activeLine = ctx.selection.active.line
    ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\\s*/)?.[0] ?? ''
    const up = scanUp(ctx); if(up === null) { return null } ctx.startLine = up
    const down = scanDown(ctx); if(down === null) { return null } ctx.endLine = down
    return { startLine: ctx.startLine, endLine: ctx.endLine }
}`

describe('Align return type colon', () => {
    it('should NOT align colon in return statement to return type colon in function signature', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const alignedLines = alignedContent.split('\n')

        const returnLine = alignedLines.find(l => l.trim().startsWith('return { startLine:'))
        assert.ok(returnLine, 'return line should exist')

        const colonAfterStartLine = returnLine.indexOf('startLine:')
        const beforeColon = returnLine.slice(0, colonAfterStartLine)

        assert.ok(beforeColon.length < 20,
            `Colon in "startLine:" should NOT be pushed far right. Got ${beforeColon.length} chars before it. Line: "${returnLine}"`)
    })
})
