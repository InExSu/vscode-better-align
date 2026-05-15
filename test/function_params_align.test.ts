import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `export function languageRules_Detect(
    _langId: string,
    defaultAlignChars: string[]
): LanguageRules {`

const expectedOutput = "export function languageRules_Detect(\n    _langId          : string, \n    defaultAlignChars: string[]\n): LanguageRules {"

describe('Align function params', () => {
    it('should align colons inside function params', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        assert.strictEqual(alignedContent, expectedOutput,
            `Output does not match expected.\nGot:\n${alignedContent}\nExpected:\n${expectedOutput}`)
    })
})