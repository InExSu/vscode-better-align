"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const testPure_1 = require("../testPure");
const vscode = 'vscode';
function lines(...args) { return args; }
function show(title, input, output) {
    console.log(`\n=== ${title} ===`);
    console.log('--- INPUT ---');
    input.forEach((l, i) => console.log(`${i} | ${l}`));
    console.log('--- OUTPUT ---');
    output.forEach((l, i) => console.log(`${i} | ${l}`));
}
describe('parseLineIgnoringStrings', () => {
    it('finds = marker', () => {
        const result = (0, testPure_1.parseLineIgnoringStrings)('const a = 1', testPure_1.DEFAULT_LANGUAGE_RULES);
        console.log('markers:', JSON.stringify(result.markers));
        assert.equal(result.markers.length, 1);
        assert.equal(result.markers[0].symbol, '=');
    });
    it('finds multiple markers', () => {
        const result = (0, testPure_1.parseLineIgnoringStrings)('a => b => c', testPure_1.DEFAULT_LANGUAGE_RULES);
        console.log('markers:', JSON.stringify(result.markers));
        assert.equal(result.markers.length, 2);
    });
    it('skips strings containing align chars', () => {
        const result = (0, testPure_1.parseLineIgnoringStrings)('const a = "=>"', testPure_1.DEFAULT_LANGUAGE_RULES);
        console.log('markers:', JSON.stringify(result.markers));
        assert.equal(result.markers.length, 1);
    });
});
describe('findLineBlocks', () => {
    it('groups lines with same indentation', () => {
        const input = lines('const a = 1', 'const b = 2', 'const c = 3');
        const blocks = (0, testPure_1.findLineBlocks)(input, 0, testPure_1.DEFAULT_LANGUAGE_RULES, 500);
        console.log('blocks:', JSON.stringify(blocks, null, 2));
        assert.equal(blocks.length, 1);
        assert.equal(blocks[0].lines.length, 3);
    });
    it('separates blocks by different indentation', () => {
        const input = lines('const a = 1', 'const b = 2', '    const c = 3', '    const d = 4');
        const blocks = (0, testPure_1.findLineBlocks)(input, 0, testPure_1.DEFAULT_LANGUAGE_RULES, 500);
        console.log('blocks:', JSON.stringify(blocks, null, 2));
        assert.equal(blocks.length, 2);
    });
});
describe('alignBlock', () => {
    it('aligns on =', () => {
        const input = lines('const a = 1', 'const bc = 22', 'const def = 333');
        const parsed = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, testPure_1.alignBlock)(parsed, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('align on =', input, output);
    });
    it('aligns on =>', () => {
        const input = lines('a => 1', 'ab => 22', 'abc => 333');
        const parsed = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, testPure_1.alignBlock)(parsed, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('align on =>', input, output);
    });
    it('aligns on :', () => {
        const input = lines('a: 1', 'ab: 22', 'abc: 333');
        const parsed = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, testPure_1.alignBlock)(parsed, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('align on :', input, output);
    });
    it('aligns TypeScript type annotations', () => {
        const input = lines('type NSData = {', '    editor       : vscode.TextEditor | false', '    languageRules: LanguageRules | false', '    blocks       : LineBlock[]', '    parsedLines  : ParsedLine[][]', '    alignedLines: string[][]', '}');
        const parsed = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, testPure_1.alignBlock)(parsed, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('TypeScript types', input, output);
    });
    it('is idempotent - second pass should not change output', () => {
        const input = lines('type NSData = {', '    editor       : vscode.TextEditor | false', '    languageRules: LanguageRules | false', '    blocks       : LineBlock[]', '    parsedLines  : ParsedLine[][]', '    alignedLines: string[][]', '}');
        const parsed1 = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output1 = (0, testPure_1.alignBlock)(parsed1, testPure_1.DEFAULT_CONFIG.maxSpaces);
        const parsed2 = output1.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output2 = (0, testPure_1.alignBlock)(parsed2, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('first pass', input, output1);
        show('second pass', output1, output2);
        // Output should not change after second alignment
        const changed = output1.some((line, i) => line !== output2[i]);
        assert.equal(changed, false, 'Alignment should be idempotent');
    });
    it('skips strings containing align chars', () => {
        const input = lines('const a = "=>"', 'const bc = "="');
        const parsed = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        const output = (0, testPure_1.alignBlock)(parsed, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('skip strings', input, output);
    });
    it('aligns function parameters and return types with : and =>', () => {
        const input = lines('const ns_Error    = (ns: NS)           : boolean => ns.result.ok === false', 'const ns_SetError = (ns: NS, e: string): void    => {');
        const parsed = input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES));
        console.log('markers:', parsed.map(pl => pl.markers.map(m => m.symbol).join(' ')));
        const output = (0, testPure_1.alignBlock)(parsed, testPure_1.DEFAULT_CONFIG.maxSpaces);
        show('function params + return', input, output);
    });
    it('aligns function call arguments', () => {
        const input = lines('rwd(config_Load_Decor, ns)', 'rwd(language_Detect_Decor, ns)');
        const output = (0, testPure_1.alignBlock)(input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES)), 30);
        show('func args', input, output);
    });
    it('aligns Record type definitions', () => {
        const input = [
            `const LANGUAGE_RULES: Record<string, LanguageRules> = {`,
            `    typescript: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\"", "\`"], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    javascript: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\"", "\`"], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    python: { lineComments: ["#"], blockComments: [], stringDelimiters: ["\"", "\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    rust: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    go: { lineComments: ["//"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\`"], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    lua: { lineComments: ["--"], blockComments: [{ start: "--[[", end: "]]" }], stringDelimiters: ["\"", "\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `    sql: { lineComments: ["--"], blockComments: [{ start: "/*", end: "*/" }], stringDelimiters: ["\"", "\""], alignChars: DEFAULT_CONFIG.defaultAlignChars },`,
            `}`
        ];
        const output = (0, testPure_1.alignBlock)(input.map(l => (0, testPure_1.parseLineIgnoringStrings)(l, testPure_1.DEFAULT_LANGUAGE_RULES)), 20);
        console.log("=== Record type ===");
        console.log("--- INPUT ---");
        input.forEach((l, i) => console.log(`${i} | ${l}`));
        console.log("--- OUTPUT ---");
        output.forEach((l, i) => console.log(`${i} | ${l}`));
    });
});
//# sourceMappingURL=test.align.test.js.map