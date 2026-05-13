import * as assert from 'assert'
import { languageRules_Detect, DEFAULT_CONFIG, blocks_Find, line_Parse, block_Align } from '../src/fsm_Main'

const sourceCode = `function fn_AutoSearchIndent(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    ctx.activeLine = ctx.selection.active.line
    ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\\s*/)?.[0] ?? ''
    const up = scanUp(ctx); if(up === null) { return null } ctx.startLine = up
    const down = scanDown(ctx); if(down === null) { return null } ctx.endLine = down
    return { startLine: ctx.startLine, endLine: ctx.endLine }
}`

describe('Align return type colon', () => {
    it('should NOT align colon in return statement to return type colon in function signature', () => {
        const lines = sourceCode.split('\n')
        const rules = languageRules_Detect('typescript', DEFAULT_CONFIG.defaultAlignChars)
        const blocks = blocks_Find(lines, 0, rules, DEFAULT_CONFIG.maxBlockSize)

        console.log('Blocks found:', blocks.length)
        for (const block of blocks) {
            console.log(`Block at line ${block.startLine}, ${block.lines.length} lines`)
        }

        const alignedLines = [...lines]
        for (const block of blocks) {
            const parsedLines = block.lines.map(s_Raw => line_Parse(s_Raw, rules))
            console.log('Parsed line 0 markers:', parsedLines[0].markers)
            console.log('Parsed line 5 markers:', parsedLines[5].markers)
            const alignedBlock = block_Align(parsedLines, DEFAULT_CONFIG.maxSpaces)
            for (let i = 0; i < alignedBlock.length; i++) {
                alignedLines[block.startLine + i] = alignedBlock[i]
            }
        }

        console.log('Aligned lines:')
        alignedLines.forEach((l, i) => console.log(`${i}: ${l}`))

        const returnLine = alignedLines.find(l => l.trim().startsWith('return { startLine:'))
        assert.ok(returnLine, 'return line should exist')

        const colonAfterStartLine = returnLine.indexOf('startLine:')
        const beforeColon = returnLine.slice(0, colonAfterStartLine)

        const beforeColonLength = beforeColon.length
        console.log('Return line:', returnLine)
        console.log('Before "startLine:" has', beforeColonLength, 'chars')

        assert.ok(beforeColonLength < 20,
            `Colon in "startLine:" should NOT be pushed far right. Got ${beforeColonLength} chars before it. Line: "${returnLine}"`)
    })
})