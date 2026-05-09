import * as assert from 'assert';
import {
    alignBlock,
    parseLineIgnoringStrings,
    findDominantPrefix,
    DEFAULT_LANGUAGE_RULES,
    LanguageRules,
    ParsedLine,
    Marker
} from '../../extension';

suite('Alignment Logic', () => {
    test('should align lines with equals, skipping lines without it', () => {
        const lines = [
            "const editor = ns.data.editor",
            "if(!editor) { ns_SetError(ns, 'No active editor'); return }",
            "const rules = ns.data.languageRules",
            "if(!rules) { ns_SetError(ns, 'No language rules'); return }",
            "const doc = editor.document",
            "const selection = editor.selection",
            "const startLine = selection.isEmpty ? 0 : selection.start.line",
            "const endLine = selection.isEmpty ? doc.lineCount - 1 : selection.end.line",
            "const rawLines = extractRawLines(doc, startLine, endLine)",
            "ns.data.blocks = findLineBlocks(rawLines, startLine, rules, ns.config.maxBlockSize)",
            "ns.result = ok(ns.data.blocks)"
        ];

        const rules: LanguageRules = { ...DEFAULT_LANGUAGE_RULES, alignChars: ['='] };
        const parsedLines: ParsedLine[] = lines.map(line => parseLineIgnoringStrings(line, rules));

        const sequences = parsedLines.map(pl => pl.markers.map((m: Marker) => m.symbol));
        const dominantPrefix = findDominantPrefix(sequences);

        const aligned = alignBlock(parsedLines, dominantPrefix, 10);

        const expected = [
            "const editor    = ns.data.editor",
            "if(!editor) { ns_SetError(ns, 'No active editor'); return }",
            "const rules     = ns.data.languageRules",
            "if(!rules) { ns_SetError(ns, 'No language rules'); return }",
            "const doc       = editor.document",
            "const selection = editor.selection",
            "const startLine = selection.isEmpty ? 0 : selection.start.line",
            "const endLine   = selection.isEmpty ? doc.lineCount - 1 : selection.end.line",
            "const rawLines  = extractRawLines(doc, startLine, endLine)",
            "ns.data.blocks  = findLineBlocks(rawLines, startLine, rules, ns.config.maxBlockSize)",
            "ns.result       = ok(ns.data.blocks)"
        ];

        assert.deepStrictEqual(aligned, expected);
    });
});
