import * as path from 'path'
import * as fs from 'fs'
import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

describe('Align code_4_Test.ts', () => {
    it('should align code_4_Test.ts and save to code_Aligned.ts', () => {
        const sourcePath = path.resolve(__dirname, 'code_4_Test.ts')
        const sourceCode = fs.readFileSync(sourcePath, 'utf-8')

        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        const outputPath = path.resolve(__dirname, 'code_Aligned.ts')
        fs.writeFileSync(outputPath, alignedContent, 'utf-8')

        const filesDiffer = sourceCode !== alignedContent
        console.log(`Files differ: ${filesDiffer}`)
        if (!filesDiffer) {
            console.log('Original:')
            console.log(sourceCode)
            console.log('Aligned:')
            console.log(alignedContent)
        }
        assert.ok(filesDiffer, 'code_Aligned.ts must differ from code_4_Test.ts - alignment did not work')
    })
})
