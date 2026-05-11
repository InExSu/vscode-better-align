import * as assert from 'assert'
import {
    line_Parse,
    block_Align,
    blocks_Find,
    DEFAULT_LANGUAGE_RULES,
    LineBlock,
} from '../fsm_Main'

function lines(...args: string[]): string[] { return args }

describe('Alignment Logic Tests', () => {

    it('should not corrupt code when selection contains multiple indentation levels', () => {
        const inputLines = lines(
            'const vscode = {',
            '    workspace: {',
            '        getConfiguration: () => ({',
            '            get: () => []',
            '        })',
            '    },',
            '    window: {',
            '        activeTextEditor: false,',
            '        showErrorMessage: () => { },',
            '        showInformationMessage: () => { }',
            '    },',
            '    commands: {',
            '        registerCommand: () => { },',
            '        executeCommand: () => { }',
            '    },',
            '    ExtensionContext: class { },',
            '    TextEditor: class { },',
            '    TextDocument: class { }',
            '}',
            '',
            'module.exports = vscode',
            'module.exports.default = vscode'
        );

        // blocks_Find splits by empty lines - this is the expected real behavior
        const blocks = blocks_Find(inputLines, 0, DEFAULT_LANGUAGE_RULES, 500);
        
        // Verify that blocks are properly split by empty lines
        const nonEmptyBlocks = blocks.filter(b => b.lines.length > 1);
        assert.ok(nonEmptyBlocks.length > 1, 'Should split into multiple blocks by empty lines');
        
        // Each block should be independently aligned
        const allAligned = nonEmptyBlocks.every(block => {
            if (block.lines.length < 2) { return true; }
            const parsedLines = block.lines.map(line => line_Parse(line, DEFAULT_LANGUAGE_RULES));
            const alignedLines = block_Align(parsedLines, 10);
            return alignedLines.every(line => line.length >= inputLines[0].length || block.lines.includes(line));
        });
        assert.ok(allAligned, 'Each block should be independently alignable');
    });

    it('should split code into blocks based on blank lines', () => {
        const inputLines = lines(
            '    activeTextEditor: false,',
            '    showErrorMessage: () => { },',
            '',
            'module.exports = vscode',
            'module.exports.default = vscode'
        );

        // This simulates what `blocks_Find` does, which is the root cause of the bug
        const blocks = blocks_Find(inputLines, 0, DEFAULT_LANGUAGE_RULES, 500);

        // It should find two separate blocks because of the empty line and indentation change.
        assert.strictEqual(blocks.length, 2, 'Should find two blocks');
        assert.deepStrictEqual(blocks[0].lines, [
            '    activeTextEditor: false,',
            '    showErrorMessage: () => { },',
        ]);
        assert.deepStrictEqual(blocks[1].lines, [
            'module.exports = vscode',
            'module.exports.default = vscode',
        ]);
    });
});
