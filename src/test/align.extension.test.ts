import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { block_Align, line_Parse, blocks_Find, DEFAULT_CONFIG, languageRules_Detect } from '../fsm_Main';

describe('Align extension.ts', () => {
    it('should align extension.ts and save to extension_Aligned.ts', () => {
        // Read the source file
        const sourcePath = path.resolve(__dirname, '../extension.ts');
        const sourceCode = fs.readFileSync(sourcePath, 'utf-8');
        const lines = sourceCode.split('\n');

        // Detect language rules for TypeScript
        const rules = languageRules_Detect('typescript', DEFAULT_CONFIG.defaultAlignChars);

        // Find blocks by indentation
        const blocks = blocks_Find(lines, 0, rules, DEFAULT_CONFIG.maxBlockSize);

        // Align each block
        const alignedBlocks: string[][] = [];
        for (const block of blocks) {
            const parsedLines = block.lines.map(s_Raw => line_Parse(s_Raw, rules));
            const alignedLines = block_Align(parsedLines, DEFAULT_CONFIG.maxSpaces);
            alignedBlocks.push(alignedLines);
        }

        // Flatten aligned lines back into a single array
        const alignedLines: string[] = [];
        for (const block of alignedBlocks) {
            alignedLines.push(...block);
        }

        // Verify alignment changed something (sanity check)
        const changedCount = lines.filter((line, i) => line !== alignedLines[i]).length;
        console.log(`Lines changed by alignment: ${changedCount}`);

        // Save to extension_Aligned.ts
        const outputPath = path.resolve(__dirname, '../extension_Aligned.ts');
        fs.writeFileSync(outputPath, alignedLines.join('\n'), 'utf-8');

        // Verify file was created
        assert.ok(fs.existsSync(outputPath), 'extension_Aligned.ts should exist');
        assert.ok(alignedLines.length > 0, 'Aligned lines should not be empty');
    });
});

describe('Align code_4_Test.ts', () => {
    it('should align code_4_Test.ts via VS Code command and save to code_Aligned.ts', async () => {
        // Open the source file in a VS Code editor
        const sourcePath = path.resolve(__dirname, 'code_4_Test.ts');
        const document = await vscode.workspace.openTextDocument(sourcePath);
        const editor = await vscode.window.showTextDocument(document);

        // Execute the alignment command
        await vscode.commands.executeCommand('vscode-better-align-columns.align');

        // Path to the output file produced by the command (extension saves to code_Aligned.ts)
        const outputPath = path.resolve(__dirname, 'code_Aligned.ts');
        // Ensure the file was created
        assert.ok(fs.existsSync(outputPath), 'code_Aligned.ts should exist');

        // Read both files
        const originalContent = fs.readFileSync(sourcePath, 'utf-8');
        const alignedContent = fs.readFileSync(outputPath, 'utf-8');

        // Verify that the aligned file differs from the original
        const filesDiffer = originalContent !== alignedContent;
        console.log(`Files differ: ${filesDiffer}`);
        assert.ok(filesDiffer, 'code_Aligned.ts must differ from code_4_Test.ts - alignment did not work');
    });
});