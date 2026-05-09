import * as assert from 'assert';
import { findAlignCharsGreedy, DEFAULT_LANGUAGE_RULES } from '../../extension';

suite('Stage 1: Greedy Matcher', () => {
    test('findAlignCharsGreedy should find the longest match first (greedy)', () => {
        const line = 'x === 1;';
        const alignChars = ['===', '==', '='];
        const result = findAlignCharsGreedy(line, alignChars, DEFAULT_LANGUAGE_RULES);
        assert.deepStrictEqual(result, [{ char: '===', pos: 2 }]);
    });
});
