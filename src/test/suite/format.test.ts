/// <reference types="mocha" />

import { suite, test } from 'mocha'
import * as assert from 'assert'

const CONFIG = {
    b_Debug: false,
    defaultAlignChars: [':', '{', '=', ','],
    maxBlockSize: 500,
    preserveComments: true,
    preserveStrings: true,
    alignMultilineBlocks: false,
    skipTemplates: true,
    languageConfigs: {
        javascript: {
            lineComments: ['//'],
            blockComments: [{ start: '/*', end: '*/' }],
            stringDelimiters: ['"', "'", '`'],
            alignChars: [':', '{', '=', ','],
            multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
        },
        typescript: {
            lineComments: ['//'],
            blockComments: [{ start: '/*', end: '*/' }],
            stringDelimiters: ['"', "'", '`'],
            alignChars: [':', '{', '=', ','],
            multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
        },
        python: {
            lineComments: ['#'],
            blockComments: [{ start: '"""', end: '"""' }, { start: "'''", end: "'''" }],
            stringDelimiters: ['"', "'"],
            alignChars: ['=', ':', ','],
            multiCharOps: ['==', '!=', '<=', '>=']
        },
        php: {
            lineComments: ['//', '#'],
            blockComments: [{ start: '/*', end: '*/' }],
            stringDelimiters: ['"', "'", '`'],
            alignChars: [':', '{', '=', ',', '->'],
            multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->', '<=>', '??']
        }
    }
}

const ok = <T,>(v: T): { ok: true; value: T } => ({ ok: true, value: v });
const err = <E,>(e: E): { ok: false; error: E } => ({ ok: false, error: e });

const cfg = CONFIG.languageConfigs.javascript;

function pure_ExtractCommentMarkers(line: string, languageConfig: any): { lineCommentPos: number; blockCommentPos: number } {
    let lineCommentPos = -1;
    let blockCommentPos = -1;
    for (const marker of languageConfig.lineComments) {
        const pos = line.indexOf(marker);
        if (pos !== -1 && (lineCommentPos === -1 || pos < lineCommentPos)) {
            lineCommentPos = pos;
        }
    }
    for (const block of languageConfig.blockComments) {
        const pos = line.indexOf(block.start);
        if (pos !== -1 && (blockCommentPos === -1 || pos < blockCommentPos)) {
            blockCommentPos = pos;
        }
    }
    return { lineCommentPos, blockCommentPos };
}

function pure_IsInsideString(line: string, position: number, delimiters: string[]): boolean {
    let inString = false;
    let currentDelimiter = '';

    for (let i = 0; i < position; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';

        if (delimiters.includes(char) && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                currentDelimiter = char;
            } else if (char === currentDelimiter) {
                inString = false;
                currentDelimiter = '';
            }
        }
    }

    return inString;
}

function pure_FindBlockCommentStart(line: string, lineCommentPos: number, languageConfig: any): number {
    for (const block of languageConfig.blockComments) {
        const startPos = line.indexOf(block.start);
        if (startPos !== -1 && (lineCommentPos === -1 || startPos < lineCommentPos)) {
            return startPos;
        }
    }
    return -1;
}

function pure_FindBlockCommentEnd(line: string, lineCommentPos: number, languageConfig: any): number {
    for (const block of languageConfig.blockComments) {
        const startPos = line.indexOf(block.start);
        if (startPos !== -1 && (lineCommentPos === -1 || startPos < lineCommentPos)) {
            const endPos = line.indexOf(block.end, startPos + block.start.length);
            if (endPos !== -1) {
                return endPos + block.end.length;
            }
        }
    }
    return -1;
}

function pure_ScanMultiCharOps(
    line: string,
    lineCommentPos: number,
    languageConfig: any
): { pos: number; op: string }[] {
    const results: { pos: number; op: string }[] = [];
    const multiCharOps = languageConfig.multiCharOps || [];
    const delimiters = languageConfig.stringDelimiters;

    for (const op of multiCharOps) {
        let searchFrom = 0;
        while (true) {
            const pos = line.indexOf(op, searchFrom);
            switch(pos) {
                case -1: break;

                default: {
                    if (lineCommentPos !== -1 && pos >= lineCommentPos) { break; }
                    if (pure_IsInsideString(line, pos, delimiters)) {
                        searchFrom = pos + 1;
                        continue;
                    }
                    const startBlock = pure_FindBlockCommentStart(line, lineCommentPos, languageConfig);
                    const endBlock = pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig);
                    if (startBlock !== -1 && endBlock !== -1 && pos >= startBlock && pos < endBlock) {
                        searchFrom = pos + 1;
                        continue;
                    }
                    results.push({ pos, op });
                    searchFrom = pos + op.length;
                    break;
                }
            }
        }
    }

    return results;
}

function pure_ScanSingleCharAlignPoints(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    languageConfig: any
): { pos: number; op: string }[] {
    const results: { pos: number; op: string }[] = [];
    const delimiters = languageConfig.stringDelimiters;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (lineCommentPos !== -1 && i >= lineCommentPos) { break; }
        if (pure_IsInsideString(line, i, delimiters)) { continue; }
        if (pure_FindBlockCommentStart(line, lineCommentPos, languageConfig) !== -1 &&
            pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig) !== -1) {
            const startBlock = pure_FindBlockCommentStart(line, lineCommentPos, languageConfig);
            const endBlock = pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig);
            if (i >= startBlock && i < endBlock) { continue; }
        }
        if (alignChars.includes(char)) {
            results.push({ pos: i, op: char });
        }
    }

    return results;
}

function pure_FindAlignPoints(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    languageConfig: any
): { pos: number; op: string }[] {
    const multiCharResults = pure_ScanMultiCharOps(line, lineCommentPos, languageConfig);
    const singleCharResults = pure_ScanSingleCharAlignPoints(line, alignChars, lineCommentPos, languageConfig);
    return [...multiCharResults, ...singleCharResults].sort((a, b) => a.pos - b.pos);
}

function pure_ExtractOperatorSequence(alignPoints: { pos: number; op: string }[]): string[] {
    return alignPoints.map(p => p.op);
}

function pure_FindAlignPositions(
    line: string,
    alignChars: string[],
    lineCommentPos: number,
    languageConfig: any
): number[] {
    return pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig)
        .map((p: { pos: number; op: string }) => p.pos);
}

function pure_ExtractCharSequence(line: string, positions: number[]): string[] {
    const sequence: string[] = [];
    for (const pos of positions) {
        if (pos < line.length) {
            sequence.push(line[pos]);
        }
    }
    return sequence;
}

function pure_FindCommonPrefix(sequences: string[][]): string[] {
    if (sequences.length === 0) { return []; }
    const minLength = Math.min(...sequences.map(s => s.length));
    const prefix: string[] = [];
    for (let i = 0; i < minLength; i++) {
        const char = sequences[0][i];
        if (sequences.every(seq => seq[i] === char)) {
            prefix.push(char);
        } else {
            break;
        }
    }
    return prefix;
}

function pure_CalculateAlignColumns(lines: string[], alignChars: string[], commonPrefix: string[], languageConfig: any): Map<number, number>[] {
    const alignMaps: Map<number, number>[] = [];
    for (const line of lines) {
        const commentPos = pure_ExtractCommentMarkers(line, languageConfig).lineCommentPos;
        const positions = pure_FindAlignPositions(line, alignChars, commentPos, languageConfig);
        const sequence = pure_ExtractCharSequence(line, positions);
        const alignMap = new Map<number, number>();
        let prefixIndex = 0;
        for (let i = 0; i < positions.length && prefixIndex < commonPrefix.length; i++) {
            if (sequence[i] === commonPrefix[prefixIndex]) {
                alignMap.set(prefixIndex, positions[i]);
                prefixIndex++;
            } else {
                break;
            }
        }
        alignMaps.push(alignMap);
    }
    return alignMaps;
}

function pure_ComputeMaxColumns(alignMaps: Map<number, number>[]): Map<number, number> {
    const maxColumns = new Map<number, number>();
    for (const alignMap of alignMaps) {
        for (const [idx, pos] of alignMap) {
            const current = maxColumns.get(idx) || 0;
            if (pos > current) {
                maxColumns.set(idx, pos);
            }
        }
    }
    return maxColumns;
}

function pure_ApplyAlignment(line: string, alignMap: Map<number, number>, maxColumns: Map<number, number>, alignChars: string[]): string {
    if (alignMap.size === 0) { return line; }
    const sortedIndices = Array.from(alignMap.keys()).sort((a, b) => a - b);
    let result = line;
    let offset = 0;
    for (const idx of sortedIndices) {
        const originalPos = alignMap.get(idx)!;
        const targetPos = maxColumns.get(idx)!;
        const currentPos = originalPos + offset;
        if (currentPos < targetPos) {
            const spaces = ' '.repeat(targetPos - currentPos);
            result = result.slice(0, currentPos) + spaces + result.slice(currentPos);
            offset += spaces.length;
        }
    }
    return result;
}

function pure_SplitIntoBlocks(lines: string[]): string[][] {
    const blocks: string[][] = [];
    let currentBlock: string[] = [];
    for (const line of lines) {
        if (line.trim().length === 0) {
            if (currentBlock.length > 0) {
                blocks.push(currentBlock);
                currentBlock = [];
            }
        } else {
            currentBlock.push(line);
        }
    }
    if (currentBlock.length > 0) {
        blocks.push(currentBlock);
    }
    return blocks;
}

function pure_FilterPureComments(lines: string[], languageConfig: any): string[] {
    return lines.filter(line => {
        const trimmed = line.trim();
        for (const marker of languageConfig.lineComments) {
            if (trimmed.startsWith(marker)) {
                return false;
            }
        }
        return true;
    });
}

suite('pure_ExtractCommentMarkers', () => {
    const cfg = CONFIG.languageConfigs.javascript;

    test('finds line comment //', () => {
        const result = pure_ExtractCommentMarkers('let x = 1; // comment', cfg);
        assert.strictEqual(result.lineCommentPos, 11);
    });

    test('finds line comment #', () => {
        const pyCfg = CONFIG.languageConfigs.python;
        const result = pure_ExtractCommentMarkers('x = 1 # comment', pyCfg);
        assert.strictEqual(result.lineCommentPos, 6);
    });

    test('returns -1 when no comment', () => {
        const result = pure_ExtractCommentMarkers('let x = 1;', cfg);
        assert.strictEqual(result.lineCommentPos, -1);
    });

    test('finds first // when multiple exist', () => {
        const result = pure_ExtractCommentMarkers('let x = 1 // a // b', cfg);
        assert.strictEqual(result.lineCommentPos, 10);
    });

    test('finds block comment /*', () => {
        const result = pure_ExtractCommentMarkers('let x = 1 /* comment */', cfg);
        assert.strictEqual(result.blockCommentPos, 10);
    });
});

suite('pure_IsInsideString', () => {
    const delims = ['"', "'", '`'];

    test('returns false at start of line', () => {
        assert.strictEqual(pure_IsInsideString('let x = 1', 0, delims), false);
    });

    test('returns true when inside double quotes', () => {
        assert.strictEqual(pure_IsInsideString('let x = "hello"', 9, delims), true);
    });

    test('returns false after closing quote', () => {
        assert.strictEqual(pure_IsInsideString('let x = "hello"', 15, delims), false);
    });

    test('handles escaped quotes correctly', () => {
        assert.strictEqual(pure_IsInsideString('let x = "hel\"lo"', 9, delims), true);
    });

    test('handles backtick strings', () => {
        assert.strictEqual(pure_IsInsideString('let x = `template`', 9, delims), true);
    });
});

suite('pure_FindAlignPositions', () => {
    const cfg = CONFIG.languageConfigs.javascript;

    test('finds all = signs', () => {
        const positions = pure_FindAlignPositions('x = 1\nxx = 22', ['='], -1, cfg);
        assert.strictEqual(positions.length, 2);
    });

    test('skips = inside strings', () => {
        const positions = pure_FindAlignPositions('let x = "a=b"; let y = 1', ['='], -1, cfg);
        assert.strictEqual(positions.length, 2);
    });

    test('stops at comment position', () => {
        const positions = pure_FindAlignPositions('x = 1; // x = 2', ['='], 11, cfg);
        assert.ok(positions.every(p => p < 11));
    });

    test('finds multiple colon positions', () => {
        const positions = pure_FindAlignPositions('x: number; y: string', [':'], -1, cfg);
        assert.strictEqual(positions.length, 2);
    });
});

suite('pure_ExtractCharSequence', () => {
    test('extracts characters at positions', () => {
        const seq = pure_ExtractCharSequence('a:b:c', [1, 3, 5]);
        assert.deepStrictEqual(seq, [':', ':']);
    });

    test('returns empty for empty positions', () => {
        const seq = pure_ExtractCharSequence('a:b:c', []);
        assert.deepStrictEqual(seq, []);
    });

    test('skips out-of-bounds positions', () => {
        const seq = pure_ExtractCharSequence('abc', [0, 5, 10]);
        assert.deepStrictEqual(seq, ['a']);
    });
});

suite('pure_FindCommonPrefix', () => {
    test('finds common prefix of = signs', () => {
        const sequences = [['=', '='], ['=', '=']];
        const prefix = pure_FindCommonPrefix(sequences);
        assert.deepStrictEqual(prefix, ['=', '=']);
    });

    test('stops at mismatch', () => {
        const sequences = [['=', '=', ':'], ['=', '=', '!'], ['=', '=', '=']];
        const prefix = pure_FindCommonPrefix(sequences);
        assert.deepStrictEqual(prefix, ['=', '=']);
    });

    test('returns empty for empty input', () => {
        const prefix = pure_FindCommonPrefix([]);
        assert.deepStrictEqual(prefix, []);
    });

    test('handles single sequence', () => {
        const prefix = pure_FindCommonPrefix([['=', ':']]);
        assert.deepStrictEqual(prefix, ['=', ':']);
    });

    test('returns empty when no common prefix', () => {
        const sequences = [['='], [':']];
        const prefix = pure_FindCommonPrefix(sequences);
        assert.deepStrictEqual(prefix, []);
    });
});

suite('pure_CalculateAlignColumns', () => {
    const cfg = CONFIG.languageConfigs.javascript;

    test('maps positions for aligned lines', () => {
        const lines = ['x = 1', 'xx = 2'];
        const maps = pure_CalculateAlignColumns(lines, ['='], ['='], cfg);
        assert.strictEqual(maps[0]!.get(0), 2);
        assert.strictEqual(maps[1]!.get(0), 3);
    });

    test('handles mixed align characters', () => {
        const lines = ['x : 1', 'xx : 2'];
        const maps = pure_CalculateAlignColumns(lines, [':'], [':'], cfg);
        assert.strictEqual(maps[0]!.get(0), 2);
        assert.strictEqual(maps[1]!.get(0), 3);
    });
});

suite('pure_ComputeMaxColumns', () => {
    test('finds max position for each index', () => {
        const maps = [
            new Map([[0, 1], [1, 5]]),
            new Map([[0, 2], [1, 3]]),
            new Map([[0, 2], [1, 6]])
        ];
        const maxCols = pure_ComputeMaxColumns(maps);
        assert.strictEqual(maxCols.get(0), 2);
        assert.strictEqual(maxCols.get(1), 6);
    });

    test('handles empty maps', () => {
        const maxCols = pure_ComputeMaxColumns([]);
        assert.strictEqual(maxCols.size, 0);
    });
});

suite('pure_ApplyAlignment', () => {
    const cfg = CONFIG.languageConfigs.javascript;

    test('adds padding to align = at column 2', () => {
        const line = 'x = 1';
        const alignMap = new Map([[0, 1]]);
        const maxCols = new Map([[0, 4]]);
        const result = pure_ApplyAlignment(line, alignMap, maxCols, ['=']);
        assert.strictEqual(result, 'x    = 1');
    });

    test('returns line unchanged if already aligned', () => {
        const line = 'x    = 1';
        const alignMap = new Map([[0, 4]]);
        const maxCols = new Map([[0, 4]]);
        const result = pure_ApplyAlignment(line, alignMap, maxCols, ['=']);
        assert.strictEqual(result, 'x    = 1');
    });

    test('returns line unchanged if no align map', () => {
        const line = 'x = 1';
        const result = pure_ApplyAlignment(line, new Map(), new Map(), ['=']);
        assert.strictEqual(result, 'x = 1');
    });
});

suite('pure_SplitIntoBlocks', () => {
    test('splits by empty lines', () => {
        const lines = ['a', '', 'b', '', 'c'];
        const blocks = pure_SplitIntoBlocks(lines);
        assert.strictEqual(blocks.length, 3);
        assert.deepStrictEqual(blocks[0], ['a']);
        assert.deepStrictEqual(blocks[1], ['b']);
        assert.deepStrictEqual(blocks[2], ['c']);
    });

    test('handles consecutive empty lines', () => {
        const lines = ['a', '', '', 'b'];
        const blocks = pure_SplitIntoBlocks(lines);
        assert.strictEqual(blocks.length, 2);
    });

    test('handles no empty lines', () => {
        const lines = ['a', 'b', 'c'];
        const blocks = pure_SplitIntoBlocks(lines);
        assert.strictEqual(blocks.length, 1);
        assert.deepStrictEqual(blocks[0], ['a', 'b', 'c']);
    });

    test('handles only empty lines', () => {
        const blocks = pure_SplitIntoBlocks(['', '']);
        assert.strictEqual(blocks.length, 0);
    });
});

suite('pure_FilterPureComments', () => {
    const jsCfg = CONFIG.languageConfigs.javascript;
    const pyCfg = CONFIG.languageConfigs.python;

    test('filters // comments', () => {
        const lines = ['let x = 1', '// comment', 'let y = 2'];
        const filtered = pure_FilterPureComments(lines, jsCfg);
        assert.strictEqual(filtered.length, 2);
        assert.strictEqual(filtered[0], 'let x = 1');
        assert.strictEqual(filtered[1], 'let y = 2');
    });

    test('filters # comments', () => {
        const lines = ['x = 1', '# comment', 'y = 2'];
        const filtered = pure_FilterPureComments(lines, pyCfg);
        assert.strictEqual(filtered.length, 2);
    });

    test('keeps lines with code after comments', () => {
        const lines = ['let x = 1; // inline comment'];
        const filtered = pure_FilterPureComments(lines, jsCfg);
        assert.strictEqual(filtered.length, 1);
    });

    test('keeps all lines if no comments', () => {
        const lines = ['let x = 1', 'let y = 2'];
        const filtered = pure_FilterPureComments(lines, jsCfg);
        assert.strictEqual(filtered.length, 2);
    });
});

suite('Integration: basic alignment', () => {
    const cfg = CONFIG.languageConfigs.javascript;

    test('aligns multiple lines with =', () => {
        const lines = ['x = 1', 'xx = 22', 'xxx = 333'];
        const commentPositions: number[] = [];
        const sequences: string[][] = [];

        for (const line of lines) {
            const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
            commentPositions.push(lineCommentPos);
            const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
            sequences.push(pure_ExtractCharSequence(line, positions));
        }

        const commonPrefix = pure_FindCommonPrefix(sequences);
        const alignMaps = pure_CalculateAlignColumns(lines, ['='], commonPrefix, cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);

        const aligned = lines.map((line, i) => pure_ApplyAlignment(line, alignMaps[i], maxColumns, ['=']));
        assert.strictEqual(aligned[0], 'x   = 1');
        assert.strictEqual(aligned[1], 'xx  = 22');
        assert.strictEqual(aligned[2], 'xxx = 333');
    });

    test('aligns with colon', () => {
        const lines = ['x: number', 'xx: string', 'xxx: boolean'];
        const { lineCommentPos } = pure_ExtractCommentMarkers(lines[0], cfg);
        const positions = pure_FindAlignPositions(lines[0], [':'], lineCommentPos, cfg);
        const alignMaps = pure_CalculateAlignColumns(lines, [':'], [':'], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        const aligned = lines.map((line, i) => pure_ApplyAlignment(line, alignMaps[i], maxColumns, [':']));
        assert.strictEqual(aligned[0], 'x  : number');
        assert.strictEqual(aligned[1], 'xx : string');
        assert.strictEqual(aligned[2], 'xxx: boolean');
    });
});

suite('Edge cases', () => {
    const cfg = CONFIG.languageConfigs.javascript;

    test('handles empty lines array', () => {
        const blocks = pure_SplitIntoBlocks([]);
        assert.deepStrictEqual(blocks, []);
    });

    test('handles single line', () => {
        const lines = ['x = 1'];
        const alignMaps = pure_CalculateAlignColumns(lines, ['='], ['='], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        const result = pure_ApplyAlignment(lines[0], alignMaps[0], maxColumns, ['=']);
        assert.strictEqual(result, 'x = 1');
    });

    test('handles string with align char inside', () => {
        const line = 'let msg = "key: value";';
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, [':', '='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
        assert.strictEqual(positions[0], 8);
    });

    test('does not break comment-only block', () => {
        const lines = ['// comment only'];
        const filtered = pure_FilterPureComments(lines, cfg);
        assert.strictEqual(filtered.length, 0);
        const blocks = pure_SplitIntoBlocks(filtered);
        assert.strictEqual(blocks.length, 0);
    });
});

suite('Escaped characters in strings', () => {
    const delims = ['"', "'", '`'];

    test('handles escaped quote inside string', () => {
        const line = 'let s = "hel\\"lo"';
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });

    test('handles escaped backslash', () => {
        const line = 'let s = "\\\\";';
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });

    test('handles double escaped quote', () => {
        const line = 'let s = "a\\"\\"b"';
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });

    test('handles single quote in double-quoted string', () => {
        const line = 'let s = "it\'s cool";';
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });
});

suite('Multi-character align operators', () => {
    const jsCfg = CONFIG.languageConfigs.javascript;

    test('handles == comparison operator', () => {
        const lines = ['x == 1', 'xx == 2'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], jsCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], jsCfg);
        const pos0 = pure_FindAlignPositions(lines[0], ['='], cp0, jsCfg);
        const pos1 = pure_FindAlignPositions(lines[1], ['='], cp1, jsCfg);
        assert.strictEqual(pos0.length, 1);
        assert.strictEqual(pos1.length, 1);
        const op0 = pure_FindAlignPoints(lines[0], ['='], cp0, jsCfg)[0]!.op;
        const op1 = pure_FindAlignPoints(lines[1], ['='], cp1, jsCfg)[0]!.op;
        assert.strictEqual(op0, '==');
        assert.strictEqual(op1, '==');
    });

    test('handles === strict equality', () => {
        const lines = ['x === 1', 'xx === 2'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], jsCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], jsCfg);
        const pos0 = pure_FindAlignPositions(lines[0], ['='], cp0, jsCfg);
        const pos1 = pure_FindAlignPositions(lines[1], ['='], cp1, jsCfg);
        assert.strictEqual(pos0.length, 1);
        assert.strictEqual(pos1.length, 1);
        const op0 = pure_FindAlignPoints(lines[0], ['='], cp0, jsCfg)[0]!.op;
        const op1 = pure_FindAlignPoints(lines[1], ['='], cp1, jsCfg)[0]!.op;
        assert.strictEqual(op0, '===');
        assert.strictEqual(op1, '===');
    });

    test('handles => arrow function', () => {
        const lines = ['x => 1', 'xx => 2'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], jsCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], jsCfg);
        const points0 = pure_FindAlignPoints(lines[0], ['='], cp0, jsCfg);
        const points1 = pure_FindAlignPoints(lines[1], ['='], cp1, jsCfg);
        assert.strictEqual(points0.length, 1);
        assert.strictEqual(points1.length, 1);
        assert.strictEqual(points0[0]!.op, '=>');
        assert.strictEqual(points1[0]!.op, '=>');
    });

    test('handles != and !==', () => {
        const lines = ['x != null', 'xx !== null'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], jsCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], jsCfg);
        const pos0 = pure_FindAlignPositions(lines[0], ['='], cp0, jsCfg);
        const pos1 = pure_FindAlignPositions(lines[1], ['='], cp1, jsCfg);
        assert.ok(pos0.length >= 1, `pos0 has ${pos0.length} positions`);
        assert.ok(pos1.length >= 1, `pos1 has ${pos1.length} positions`);
    });
});

suite('Block comment edge cases', () => {
    test('align char inside block comment is ignored', () => {
        const line = 'let x = 1; /* has = inside */ let y = 2;';
        const { blockCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        assert.ok(blockCommentPos > 0);
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
        const blockEndPos = pure_FindBlockCommentEnd(line, lineCommentPos, cfg);
        const inBlock = positions.filter(p => p >= blockCommentPos && p < blockEndPos);
        assert.strictEqual(inBlock.length, 0, `= inside block comment at ${inBlock}`);
    });

    test('align char after block comment is found', () => {
        const line = 'let x = 1; /* comment */ let y = 2;';
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
        assert.ok(positions.length >= 2);
    });

    test('handles block comment without end', () => {
        const line = 'let x = 1 /* unclosed';
        const { blockCommentPos } = pure_ExtractCommentMarkers(line, cfg);
        assert.strictEqual(blockCommentPos, 10);
    });
});

suite('Indentation preservation', () => {
    test('preserves leading whitespace', () => {
        const lines = ['    x = 1', '    xx = 2'];
        const alignMaps = pure_CalculateAlignColumns(lines, ['='], ['='], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        const aligned = lines.map((line, i) => pure_ApplyAlignment(line, alignMaps[i], maxColumns, ['=']));
        assert.ok(aligned[0]!.startsWith('    '));
        assert.ok(aligned[1]!.startsWith('    '));
    });

    test('preserves different indentation levels', () => {
        const lines = ['    x = 1', '        xx = 2'];
        const alignMaps = pure_CalculateAlignColumns(lines, ['='], ['='], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        const aligned = lines.map((line, i) => pure_ApplyAlignment(line, alignMaps[i], maxColumns, ['=']));
        assert.ok(aligned[0]!.startsWith('    '));
        assert.ok(aligned[1]!.startsWith('        '));
    });

    test('preserves tabs', () => {
        const lines = ['\tx = 1', '\txx = 2'];
        const alignMaps = pure_CalculateAlignColumns(lines, ['='], ['='], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        const aligned = lines.map((line, i) => pure_ApplyAlignment(line, alignMaps[i], maxColumns, ['=']));
        assert.ok(aligned[0]!.startsWith('\t'));
        assert.ok(aligned[1]!.startsWith('\t'));
    });
});

suite('Integration: real-world scenarios', () => {
    test('aligns variable declarations', () => {
        const lines = [
            'const name    = "John"',
            'const age     = 30',
            'const email   = "john@example.com"'
        ];
        const { lineCommentPos } = pure_ExtractCommentMarkers(lines[0], cfg);
        const positions = pure_FindAlignPositions(lines[0], ['='], lineCommentPos, cfg);
        const alignMaps = pure_CalculateAlignColumns(lines, ['='], ['='], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        const aligned = lines.map((line, i) => pure_ApplyAlignment(line, alignMaps[i], maxColumns, ['=']));
        const eqPositions = aligned.map(l => l.indexOf('='));
        assert.strictEqual(eqPositions[0], eqPositions[1]);
        assert.strictEqual(eqPositions[1], eqPositions[2]);
    });

    test('aligns object properties', () => {
        const lines = [
            '{ name: "John", age: 30 }',
            '{ email: "john@example.com" }'
        ];
        const alignMaps = pure_CalculateAlignColumns(lines, [':'], [':'], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        assert.ok(maxColumns.size > 0);
    });

    test('aligns function parameters', () => {
        const lines = [
            'function foo(a, b, c) { }',
            'function bar(x, y) { }'
        ];
        const alignMaps = pure_CalculateAlignColumns(lines, [','], [','], cfg);
        const maxColumns = pure_ComputeMaxColumns(alignMaps);
        assert.ok(maxColumns.size > 0);
    });

    test('handles mixed content with comments', () => {
        const lines = [
            'const x = 1; // comment',
            'const xx = 22;',
            'const xxx = 333; // another'
        ];
        const filtered = pure_FilterPureComments(lines, cfg);
        assert.strictEqual(filtered.length, 3);
        const { lineCommentPos } = pure_ExtractCommentMarkers(filtered[0], cfg);
        const positions = pure_FindAlignPositions(filtered[0], ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });
});

suite('Error handling', () => {
    test('handles lines with no align chars', () => {
        const lines = ['const x = 1', 'let y = 2', 'var z = 3'];
        const sequences: string[][] = [];
        for (const line of lines) {
            const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
            const positions = pure_FindAlignPositions(line, [':'], lineCommentPos, cfg);
            sequences.push(pure_ExtractCharSequence(line, positions));
        }
        const commonPrefix = pure_FindCommonPrefix(sequences);
        assert.deepStrictEqual(commonPrefix, []);
    });

    test('handles unicode characters', () => {
        const lines = ['const 名称 = "John"', 'const 年龄 = 30'];
        const { lineCommentPos } = pure_ExtractCommentMarkers(lines[0], cfg);
        const positions = pure_FindAlignPositions(lines[0], ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });

    test('handles very long lines', () => {
        const longLine = 'x' + 'x'.repeat(1000) + ' = 1';
        const { lineCommentPos } = pure_ExtractCommentMarkers(longLine, cfg);
        const positions = pure_FindAlignPositions(longLine, ['='], lineCommentPos, cfg);
        assert.strictEqual(positions.length, 1);
    });
});

suite('Alignment algorithm edge cases', () => {
    test('handles lines with different numbers of align chars', () => {
        const lines = ['x = 1', 'x = 2', 'x = 3'];
        const sequences: string[][] = [];
        for (const line of lines) {
            const { lineCommentPos } = pure_ExtractCommentMarkers(line, cfg);
            const positions = pure_FindAlignPositions(line, ['='], lineCommentPos, cfg);
            sequences.push(pure_ExtractCharSequence(line, positions));
        }
        const commonPrefix = pure_FindCommonPrefix(sequences);
        assert.strictEqual(commonPrefix.length, 1);
    });

    test('stops common prefix at different char', () => {
        const sequences = [['='], [':'], ['=']];
        const prefix = pure_FindCommonPrefix(sequences);
        assert.deepStrictEqual(prefix, []);
    });

    test('applies multiple padding when needed', () => {
        const line = 'x = 1';
        const alignMap = new Map([[0, 1]]);
        const maxCols = new Map([[0, 10]]);
        const result = pure_ApplyAlignment(line, alignMap, maxCols, ['=']);
        assert.strictEqual(result.indexOf('='), 11);
    });
});

suite('PHP language config', () => {
    test('has PHP config with // and # comments', () => {
        const phpCfg = CONFIG.languageConfigs.php;
        assert.ok(phpCfg);
        assert.deepStrictEqual(phpCfg.lineComments, ['//', '#']);
    });

    test('has PHP multi-char operators', () => {
        const phpCfg = CONFIG.languageConfigs.php;
        assert.deepStrictEqual(phpCfg.multiCharOps, ['===', '!==', '==', '!=', '<=', '>=', '=>', '->', '<=>', '??']);
    });

    test('has PHP align chars including ->', () => {
        const phpCfg = CONFIG.languageConfigs.php;
        assert.ok(phpCfg.alignChars.includes('->'));
    });

    test('handles PHP spaceship operator <=>', () => {
        const phpCfg = CONFIG.languageConfigs.php;
        const lines = ['$a <=> $b', '$aa <=> $bb'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], phpCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], phpCfg);
        const points0 = pure_FindAlignPoints(lines[0], [','], cp0, phpCfg);
        const points1 = pure_FindAlignPoints(lines[1], [','], cp1, phpCfg);
        assert.strictEqual(points0.length, 1);
        assert.strictEqual(points1.length, 1);
        assert.strictEqual(points0[0]!.op, '<=>');
        assert.strictEqual(points1[0]!.op, '<=>');
    });

    test('handles PHP null coalescing ??', () => {
        const phpCfg = CONFIG.languageConfigs.php;
        const lines = ['$a ?? $b', '$aa ?? $bb'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], phpCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], phpCfg);
        const points0 = pure_FindAlignPoints(lines[0], [','], cp0, phpCfg);
        const points1 = pure_FindAlignPoints(lines[1], [','], cp1, phpCfg);
        assert.strictEqual(points0.length, 1);
        assert.strictEqual(points1.length, 1);
        assert.strictEqual(points0[0]!.op, '??');
        assert.strictEqual(points1[0]!.op, '??');
    });

    test('handles PHP method chaining ->', () => {
        const phpCfg = CONFIG.languageConfigs.php;
        const lines = ['$x->foo->bar', '$xx->foo->bar'];
        const { lineCommentPos: cp0 } = pure_ExtractCommentMarkers(lines[0], phpCfg);
        const { lineCommentPos: cp1 } = pure_ExtractCommentMarkers(lines[1], phpCfg);
        const points0 = pure_FindAlignPoints(lines[0], [','], cp0, phpCfg);
        const points1 = pure_FindAlignPoints(lines[1], [','], cp1, phpCfg);
        assert.strictEqual(points0.length, 2);
        assert.strictEqual(points1.length, 2);
        assert.strictEqual(points0[0]!.op, '->');
        assert.strictEqual(points1[0]!.op, '->');
    });
});
