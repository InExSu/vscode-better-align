import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
  lineComments: ['//'],
  blockComments: [],
  stringDelimiters: [],
  alignChars: []
}`

const expectedOutput = "export const DEFAULT_LANGUAGE_RULES: LanguageRules = {\n  lineComments    : ['//'],\n  blockComments   : [],    \n  stringDelimiters: [],    \n  alignChars      : []     \n}"

describe('Align object literal with braces', () => {
    it('should align object properties correctly', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)

        assert.strictEqual(alignedContent, expectedOutput,
            `Output does not match expected.\nGot:\n${alignedContent}\nExpected:\n${expectedOutput}`)
    })
})