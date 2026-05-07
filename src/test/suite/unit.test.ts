import * as assert from 'assert';
import { whitespace } from '../../utils';

// Unit tests that can run without VS Code
suite('Unit Tests', () => {
    test('whitespace should handle large counts without throwing', () => {
        assert.strictEqual(whitespace(0), '');
        assert.strictEqual(whitespace(1), ' ');
        assert.strictEqual(whitespace(100), ' '.repeat(100));
        assert.strictEqual(whitespace(1e7), ' '.repeat(1e6));
        assert.strictEqual(whitespace(-1), '');
    });
});
