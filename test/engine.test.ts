import * as assert from 'assert'
import { text_AlignByBlocks, DEFAULT_CONFIG } from '../src/fsm_Main'

describe('Alignment Engine Tests', () => {

    it('should preserve indentation', () => {
        const input =
`    import {
        type LanguageRules,
        DEFAULT_CONFIG,
        languageRules_Detect,
        text_AlignByBlocks
    } from './fsm_Main'`

        const expected =
`    import {
        type LanguageRules  , 
        DEFAULT_CONFIG      , 
        languageRules_Detect, 
        text_AlignByBlocks
    } from './fsm_Main'`

        const out = text_AlignByBlocks(input, DEFAULT_CONFIG.defaultAlignChars)
        assert.strictEqual(out, expected, "Indentation was not preserved correctly");
    });

    it('should be idempotent', () => {
        const input =
`export type LanguageRules = {
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
}`
        const once = text_AlignByBlocks(input, DEFAULT_CONFIG.defaultAlignChars);
        const twice = text_AlignByBlocks(once, DEFAULT_CONFIG.defaultAlignChars);
        assert.strictEqual(twice, once, "Alignment function is not idempotent");
    });

    it('should ignore alignment characters inside strings', () => {
        const input = `
let a = "a:b";
let b = 1;
`;
        const expected = `
let a = "a:b";
let b = 1;
`;
        const out = text_AlignByBlocks(input, [':']);
        assert.strictEqual(out, expected, "Should not align colon inside a string");
    });

    it('should ignore alignment characters inside comments', () => {
        const input = `
let a = 1; // align: me
let b = 2;
`;
        const expected = `
let a = 1; // align: me
let b = 2;
`;
        const out = text_AlignByBlocks(input, [':']);
        assert.strictEqual(out, expected, "Should not align colon inside a comment");
    });

    it('should not align by { anymore', () => {
        const input = `
if (true) {
    let a = {
        b: 1
    };
}
`;
        // With `{` removed from alignChars, nothing should change.
        const out = text_AlignByBlocks(input, DEFAULT_CONFIG.defaultAlignChars);
        assert.strictEqual(out, input, "Should not align by opening brace");
    });
});
