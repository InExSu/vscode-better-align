import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    ctx.activeLine = ctx.selection.active.line
    ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? ''
    const up = scanUp(ctx); if(up === null) { return null } ctx.startLine = up
    const down = scanDown(ctx); if(down === null) { return null } ctx.endLine = down
    return { startLine: ctx.startLine, endLine: ctx.endLine }
}`

const expectedOutput = "function fn_AutoSearchIndent(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {\n    ctx.activeLine   = ctx.selection.active.line                                  \n    ctx.initialIndent= ctx.doc.lineAt(ctx.activeLine).text.match(/^s*/)?.[0] ?? ''\n    const up         = scanUp(ctx)                                                ; if(up === null) { return null } ctx.startLine = up\n    const down       = scanDown(ctx)                                              ; if(down === null) { return null } ctx.endLine = down\n    return { startLine: ctx.startLine, endLine: ctx.endLine }\n}"

describe('Align return type colon', () => {
    it('should NOT align colon in return statement to return type colon in function signature', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        assert.strictEqual(alignedContent, expectedOutput)
    })
})