import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { block_Align, line_Parse, blocks_Find, DEFAULT_CONFIG, languageRules_Detect } from '../fsm_Main';

describe('Align extension.ts', () => {
    it('should align extension.ts and save to extension_Aligned.ts', () => {
        const sourcePath = path.resolve(__dirname, '../extension.ts');
        const sourceCode = fs.readFileSync(sourcePath, 'utf-8');
        const lines = sourceCode.split('\n');

        const rules = languageRules_Detect('typescript', DEFAULT_CONFIG.defaultAlignChars);
        const blocks = blocks_Find(lines, 0, rules, DEFAULT_CONFIG.maxBlockSize);

        const alignedBlocks: string[][] = [];
        for (const block of blocks) {
            const parsedLines = block.lines.map(s_Raw => line_Parse(s_Raw, rules));
            const alignedLines = block_Align(parsedLines, DEFAULT_CONFIG.maxSpaces);
            alignedBlocks.push(alignedLines);
        }

        const alignedLines: string[] = [];
        for (const block of alignedBlocks) {
            alignedLines.push(...block);
        }

        const changedCount = lines.filter((line, i) => line !== alignedLines[i]).length;
        console.log(`Lines changed by alignment: ${changedCount}`);

        const outputPath = path.resolve(__dirname, '../extension_Aligned.ts');
        fs.writeFileSync(outputPath, alignedLines.join('\n'), 'utf-8');

        assert.ok(fs.existsSync(outputPath), 'extension_Aligned.ts should exist');
        assert.ok(alignedLines.length > 0, 'Aligned lines should not be empty');
    });
});

describe('Align code_4_Test.ts', () => {
    it('should align code_4_Test.ts and save to code_Aligned.ts', () => {
        const sourcePath = path.resolve(__dirname, 'code_4_Test.ts');
        const sourceCode = fs.readFileSync(sourcePath, 'utf-8');
        const lines = sourceCode.split('\n');

        const rules = languageRules_Detect('typescript', DEFAULT_CONFIG.defaultAlignChars);
        const blocks = blocks_Find(lines, 0, rules, DEFAULT_CONFIG.maxBlockSize);

        const alignedBlocks: string[][] = [];
        for (const block of blocks) {
            const parsedLines = block.lines.map(s_Raw => line_Parse(s_Raw, rules));
            const alignedLines = block_Align(parsedLines, DEFAULT_CONFIG.maxSpaces);
            alignedBlocks.push(alignedLines);
        }

        const alignedLines: string[] = [];
        for (const block of alignedBlocks) {
            alignedLines.push(...block);
        }

        const outputPath = path.resolve(__dirname, 'code_Aligned.ts');
        fs.writeFileSync(outputPath, alignedLines.join('\n'), 'utf-8');

        const originalContent = fs.readFileSync(sourcePath, 'utf-8');
        const alignedContent = fs.readFileSync(outputPath, 'utf-8');

        const filesDiffer = originalContent !== alignedContent;
        console.log(`Files differ: ${filesDiffer}`);
        if (!filesDiffer) {
            console.log('Original:');
            console.log(originalContent);
            console.log('Aligned:');
            console.log(alignedContent);
        }
        assert.ok(filesDiffer, 'code_Aligned.ts must differ from code_4_Test.ts - alignment did not work');
    });
});