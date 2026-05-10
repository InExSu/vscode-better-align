"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const extension_1 = require("../src/extension");
function lines(...args) { return args; }
function show(input, output) {
    console.log('\n--- INPUT ---');
    input.forEach((l, i) => console.log(`${i}: ${l}`));
    console.log('\n--- OUTPUT ---');
    output.forEach((l, i) => console.log(`${i}: ${l}`));
}
describe('parseLineIgnoringStrings', () => {
    it('finds markers in simple assignment', () => {
        const rules = extension_1.DEFAULT_LANGUAGE_RULES;
        const result = (0, extension_1.parseLineIgnoringStrings)('const a = 1', rules);
        console.log('markers:', JSON.stringify(result.markers));
        assert.equal(result.markers.length, 1);
        assert.equal(result.markers[0].symbol, '=');
    });
    it('finds multiple markers', () => {
        const rules = extension_1.DEFAULT_LANGUAGE_RULES;
        const result = (0, extension_1.parseLineIgnoringStrings)('a => b => c', rules);
        console.log('markers:', JSON.stringify(result.markers));
        assert.equal(result.markers.length, 2);
    });
    it('skips strings', () => {
        const rules = extension_1.DEFAULT_LANGUAGE_RULES;
        const result = (0, extension_1.parseLineIgnoringStrings)('const a = "=>"', rules);
        console.log('markers:', JSON.stringify(result.markers));
        assert.equal(result.markers.length, 1);
    });
});
describe('findLineBlocks', () => {
    it('groups lines with same indentation', () => {
        const input = lines('const a = 1', 'const b = 2', 'const c = 3');
        const blocks = (0, extension_1.findLineBlocks)(input, 0, extension_1.DEFAULT_LANGUAGE_RULES, 500);
        console.log('blocks:', JSON.stringify(blocks, null, 2));
        assert.equal(blocks.length, 1);
        assert.equal(blocks[0].lines.length, 3);
    });
    it('separates blocks by empty line', () => {
        const input = lines('const a = 1', '', 'const b = 2');
        const blocks = (0, extension_1.findLineBlocks)(input, 0, extension_1.DEFAULT_LANGUAGE_RULES, 500);
        console.log('blocks:', JSON.stringify(blocks, null, 2));
        assert.equal(blocks.length, 2);
    });
});
describe('alignBlock', () => {
    it('aligns on =', () => {
        const input = lines('const a = 1', 'const bc = 22', 'const def = 333');
        const parsed = input.map(l => (0, extension_1.parseLineIgnoringStrings)(l, extension_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, extension_1.alignBlock)(parsed, 10);
        show(input, output);
        assert.equal(output[0].includes('    '), true);
    });
    it('aligns on =>', () => {
        const input = lines('a => 1', 'ab => 22', 'abc => 333');
        const parsed = input.map(l => (0, extension_1.parseLineIgnoringStrings)(l, extension_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, extension_1.alignBlock)(parsed, 10);
        show(input, output);
    });
    it('aligns on :', () => {
        const input = lines('a: 1', 'ab: 22', 'abc: 333');
        const parsed = input.map(l => (0, extension_1.parseLineIgnoringStrings)(l, extension_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, extension_1.alignBlock)(parsed, 10);
        show(input, output);
    });
    it('aligns on multiple markers', () => {
        const input = lines('a => b: 1', 'ab => bc: 22', 'abc => def: 333');
        const parsed = input.map(l => (0, extension_1.parseLineIgnoringStrings)(l, extension_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, extension_1.alignBlock)(parsed, 10);
        show(input, output);
    });
    it('skips strings containing align chars', () => {
        const input = lines('const a = "=>"', 'const bc => "=>"');
        const parsed = input.map(l => (0, extension_1.parseLineIgnoringStrings)(l, extension_1.DEFAULT_LANGUAGE_RULES));
        console.log('parsed markers:', parsed.map(p => p.markers));
        const output = (0, extension_1.alignBlock)(parsed, 10);
        show(input, output);
    });
});
//# sourceMappingURL=align.test.js.map