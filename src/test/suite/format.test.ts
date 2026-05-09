import * as assert from 'assert';
import {
    prefixMatches,
} from '../../extension';

suite('Format Logic', () => {
    test('prefixMatches should return true for matching prefixes', () => {
        assert.strictEqual(prefixMatches(['a', 'b', 'c'], ['a', 'b']), true);
    });

    test('prefixMatches should return false for non-matching prefixes', () => {
        assert.strictEqual(prefixMatches(['a', 'b', 'c'], ['a', 'c']), false);
    });

    test('prefixMatches should return false if lineSymbols is shorter than prefix', () => {
        assert.strictEqual(prefixMatches(['a'], ['a', 'b']), false);
    });
});
