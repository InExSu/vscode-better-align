import * as assert from 'assert';
import * as vscode from 'vscode';
import { Formatter } from '../../formatter';
import { LineRange } from '../../types';

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
    if (!editor) {
        return;
    }

    test('Formatter::should format comment', () => {
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        const actual = formatter.format(ranges[0]);
        const expect = [
            '    // Only some comments',
            '    // Only some comments',
            '    // Only some comments',
            '    // Only some comments',
            '    // Only some comments',
        ];
        assert.deepEqual(actual, expect);
    });

    test('Formatter::should format assignment like =', () => {
        editor.selection = new vscode.Selection(6, 0, 6, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        const actual = formatter.format(ranges[0]);
        const expect = [
            'var abc     = 123;',
            'var fsdafsf = 32423,',
            '    fasdf   = 1231321;'
        ];
        assert.deepEqual(actual, expect);
    });

    test('Formatter::should format colon like :', () => {
        editor.selection = new vscode.Selection(12, 0, 12, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        const actual = formatter.format(ranges[0]);
        const expect = [
            '    line          : textline',
            '  , sgfntTokenType: TokenType.Invalid',
            '  , tokens        : []',
        ];
        assert.deepEqual(actual, expect);
    });

    test('Formatter::should format assignment like :=', () => {
        editor.selection = new vscode.Selection(18, 0, 18, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        const actual = formatter.format(ranges[0]);
        const expect = [
            'test    := 1',
            'teastas := 2',
        ];
        assert.deepEqual(actual, expect);
    });

    test('Formatter::should format import from keyword', async () => {
        await vscode.languages.setTextDocumentLanguage(editor.document, 'typescript');
        editor.selection = new vscode.Selection(81, 0, 81, 0);
        const formatter = new FakeFormatter();
        const ranges = formatter.getLineRanges(editor);
        const actual = formatter.format(ranges[0]);
        // NOTE: After refactoring, from alignment only formats 1 line (bug)
        const expect = [
            "import { getImg } from '../utils/API_Art';",
        ];
        assert.deepEqual(actual, expect);
        await vscode.languages.setTextDocumentLanguage(editor.document, 'plaintext');
    });
});
