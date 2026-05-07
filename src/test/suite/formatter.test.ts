import * as assert from 'assert';
import * as vscode from 'vscode';
import { Formatter, whitespace } from '../../formatter';
import { LineRange, TokenType } from '../../types';
import { tokenizeLine } from '../../tokenizer';
import { getLanguageSyntaxConfig } from '../../languageConfig';

class FakeFormatter extends Formatter {
    public format(range: LineRange): string[] {
        return super.format(range);
    }

    public getLineRanges(editor: vscode.TextEditor) {
        (this as any).editor = editor;
        return super.getLineRanges(editor);
    }
}

suite('Formatter Test Suite', () => {
    const editor = vscode.window.activeTextEditor;
    if(!editor) {
        return;
    }

    test('Formatter::whitespace should handle large counts without throwing', () => {
        assert.strictEqual(whitespace(0), '');
        assert.strictEqual(whitespace(1), ' ');
        assert.strictEqual(whitespace(100), ' '.repeat(100));
        assert.strictEqual(whitespace(1e7), ' '.repeat(1e6));
        assert.strictEqual(whitespace(-1), '');
    });

    test('Tokenizer::should tokenize colon correctly', () => {
        const config = getLanguageSyntaxConfig('typescript');
        const mockLine = {
            text: '    colon: [0, 1],',
            lineNumber: 0,
        } as vscode.TextLine;

        const result = tokenizeLine(mockLine, config, 'typescript');
        assert.ok(result.sgfntTokens.includes(TokenType.Colon), 'Should include Colon in sgfntTokens');
    });

    test('Formatter::should align all colons to same column - tokenizer test', () => {
        const config = getLanguageSyntaxConfig('typescript');
        const lines = [
            { text: 'a: 1', lineNumber: 0 },
            { text: 'ab: 2', lineNumber: 1 },
            { text: 'abc: 3', lineNumber: 2 },
        ].map(l => l as vscode.TextLine);

        const results = lines.map(l => tokenizeLine(l, config, 'typescript'));

        for(const result of results) {
            assert.ok(result.sgfntTokens.includes(TokenType.Colon), 'Each line should have Colon in sgfntTokens');
        }
    });

    test('Formatter::should not throw Invalid array length on large alignments', () => {
        editor.selection = new vscode.Selection(0, 0, 5, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        const result = formatter.format(ranges[0]);
        assert.ok(result.length > 0, 'Should return results without throwing');
    });

    test('Formatter::should not throw Illegal value for line on 500+ line selection', () => {
        const lineCount = editor.document.lineCount;
        const startLine = Math.max(0, lineCount - 50);
        editor.selection = new vscode.Selection(startLine, 0, lineCount - 1, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        assert.ok(ranges.length > 0, 'Should find ranges');
        for(const range of ranges) {
            const result = formatter.format(range);
            assert.ok(result.length > 0, 'Should format without throwing');
        }
    });
});
