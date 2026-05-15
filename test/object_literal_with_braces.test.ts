import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
  lineComments: ['//'],
  blockComments: [],
  stringDelimiters: [],
  alignChars: []
}`

describe('Align object literal with braces', () => {
    it('should NOT align line with = and { with lines with only :', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const lines = alignedContent.split('\n')

        const line1 = lines[0]
        const line2 = lines[1]

        const colonPos1 = line1.indexOf(':')
        const colonPos2 = line2.indexOf(':')

        console.log('Line 1:', line1)
        console.log('Line 2:', line2)

        assert.notStrictEqual(colonPos1, colonPos2,
            `Line 1 and 2 colons should be at DIFFERENT positions. Got both at ${colonPos1}`)
    })
})