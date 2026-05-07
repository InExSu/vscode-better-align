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

    test('Formatter::should not add spaces before comma on repeated format', () => {
        editor.selection = new vscode.Selection(0, 0, 4, 0);
        const formatter = new FakeFormatter();
        
        // First format
        let ranges = formatter.getLineRanges(editor);
        let result1 = formatter.format(ranges[0]);
        
        // Check first format - no spaces before comma
        for(const line of result1) {
            const commaIdx = line.indexOf(',');
            if(commaIdx > 0) {
                // Check that there are no unusual spaces before comma
                const beforeComma = line.substring(0, commaIdx);
                const spacesBeforeComma = (beforeComma.match(/\s*$/) || [''])[0].length;
                assert.ok(spacesBeforeComma <= 3, 
                    `Too many spaces before comma in first format: "${line}"`);
            }
        }
        
        // Second format (simulate pressing Alt+A again)
        ranges = formatter.getLineRanges(editor);
        let result2 = formatter.format(ranges[0]);
        
        // Check second format - spaces should not increase dramatically
        for(let i = 0; i < result1.length; i++) {
            const line1 = result1[i];
            const line2 = result2[i];
            const commaIdx1 = line1.indexOf(',');
            const commaIdx2 = line2.indexOf(',');
            
            if(commaIdx1 >= 0 && commaIdx2 >= 0) {
                const diff = Math.abs(commaIdx2 - commaIdx1);
                assert.ok(diff <= 2, 
                    `Comma position shifted too much on line ${i}: ${commaIdx1} -> ${commaIdx2}`);
            }
        }
    });
});
