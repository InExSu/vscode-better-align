import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

const sourceCode = `function pattern_MatchAt(
    line: string,
    pos: number,
    patterns: Pattern[]
): string | null {`

describe('Align with empty lines', () => {
    it('should NOT align return type colon with function params', () => {
        const alignedContent = text_AlignByBlocks(sourceCode, DEFAULT_CONFIG.defaultAlignChars)
        const lines = alignedContent.split('\n')

        const line5 = lines.find(l => l.includes(': string | null'))

        assert.ok(line5, 'Line with return type should exist')
        assert.ok(line5.includes(': string | null'), 'Return type should have colon at original position')

        const paramColons = lines
            .filter(l => l.includes(': string,') || l.includes(': Pattern[]'))
            .map(l => l.indexOf(':'))

        const returnColon = line5.indexOf(':')

        if (paramColons.length > 0 && paramColons[0] !== returnColon) {
            console.log('PASS: Return type colon NOT aligned with params')
        } else {
            assert.notStrictEqual(paramColons[0], returnColon,
                `Return type colon should NOT be aligned with params. Params at ${paramColons[0]}, return at ${returnColon}. Line: ${line5}`)
        }
    })
})