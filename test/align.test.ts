import * as path from 'path'
import * as fs from 'fs'
import * as assert from 'assert'
import { languageRules_Detect, DEFAULT_CONFIG, blocks_Find, line_Parse, block_Align } from '../src/fsm_Main'

describe('Align code_4_Test.ts', () => {
    it('should align code_4_Test.ts and save to code_Aligned.ts', () => {
        const sourcePath = path.resolve(__dirname, 'code_4_Test.ts')
        const sourceCode = fs.readFileSync(sourcePath, 'utf-8')
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

        assert.strictEqual(alignedLines.length, lines.length,
            `Line count changed: ${lines.length} → ${alignedLines.length}`)

        const outputPath = path.resolve(__dirname, 'code_Aligned.ts')
        fs.writeFileSync(outputPath, alignedLines.join('\n'), 'utf-8')

        const originalContent = fs.readFileSync(sourcePath, 'utf-8')
        const alignedContent = fs.readFileSync(outputPath, 'utf-8')

        const filesDiffer = originalContent !== alignedContent
        console.log(`Files differ: ${filesDiffer}`)
        if (!filesDiffer) {
            console.log('Original:')
            console.log(originalContent)
            console.log('Aligned:')
            console.log(alignedContent)
        }
        assert.ok(filesDiffer, 'code_Aligned.ts must differ from code_4_Test.ts - alignment did not work')
    })
})
