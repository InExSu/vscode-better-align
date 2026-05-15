import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `export function languageRules_Detect(
    _langId: string,
    defaultAlignChars: string[]
): LanguageRules {`

describe('Align function params', () => {
    it('should align colons inside function params', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const lines = alignedContent.split('\n')

        const colonPositions = lines
            .filter(l => l.includes(':'))
            .map(l => l.indexOf(':'))

        assert.ok(colonPositions.length >= 2, 'Should have at least 2 lines with colons')
        assert.strictEqual(colonPositions[0], colonPositions[1],
            `Colons should be aligned. Got positions: ${colonPositions.join(', ')}. Lines: ${lines.filter(l => l.includes(':')).join('\n')}`)
    })
})