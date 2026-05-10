"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const ok = (v) => ({ ok: true, value: v });
const err = (e) => ({ ok: false, error: e });
const ns_Error = (ns) => ns.result.ok === false;
const ns_SetError = (ns, e) => { ns.result = err(e); ns.s_Error = e; };
// ============================================================================
// CONFIG
// ============================================================================
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
};
function NS_Container(cfg) {
    return {
        result: ok({}),
        s_Error: '',
        config: cfg,
        data: {},
        selection: null,
        editor: null,
        languageId: '',
        blocks: [],
        alignedLines: []
    };
}
// ============================================================================
// PURE FUNCTIONS
// ============================================================================
/**
 * Pure : extracts line comments and block comments start positions
 */
function pure_ExtractCommentMarkers(line, languageConfig) {
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
/**
 * Pure : checks if position is inside string literal
 */
function pure_IsInsideString(line, position, delimiters) {
    let inString = false;
    let currentDelimiter = '';
    for (let i = 0; i < position; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';
        if (delimiters.includes(char) && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                currentDelimiter = char;
            }
            else if (char === currentDelimiter) {
                inString = false;
                currentDelimiter = '';
            }
        }
    }
    return inString;
}
/**
 * Pure : finds align character positions in line (ignoring strings and comments)
 */
function pure_FindMultiCharOps(line, lineCommentPos, languageConfig) {
    const results = [];
    const multiCharOps = languageConfig.multiCharOps || [];
    const sortedOps = [...multiCharOps].sort((a, b) => b.length - a.length);
    for (const op of sortedOps) {
        let searchFrom = 0;
        while (true) {
            const pos = line.indexOf(op, searchFrom);
            if (pos === -1) {
                break;
            }
            if (lineCommentPos !== -1 && pos >= lineCommentPos) {
                break;
            }
            if (pure_IsInsideString(line, pos, languageConfig.stringDelimiters)) {
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
        }
    }
    return results;
}
// ============================================================================
// PURE FUNCTIONS: BLOCK COMMENT HELPERS
// ============================================================================
function pure_FindBlockCommentStart(line, lineCommentPos, languageConfig) {
    for (const block of languageConfig.blockComments) {
        const startPos = line.indexOf(block.start);
        if (startPos !== -1 && (lineCommentPos === -1 || startPos < lineCommentPos)) {
            return startPos;
        }
    }
    return -1;
}
function pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig) {
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
// ============================================================================
// PURE FUNCTIONS: POSITION VALIDATION
// ============================================================================
var PositionState;
(function (PositionState) {
    PositionState[PositionState["Valid"] = 0] = "Valid";
    PositionState[PositionState["InsideLineComment"] = 1] = "InsideLineComment";
    PositionState[PositionState["InsideBlockComment"] = 2] = "InsideBlockComment";
    PositionState[PositionState["InsideString"] = 3] = "InsideString";
})(PositionState || (PositionState = {}));
function classifyPosition(line, pos, lineCommentPos, blockStartPos, blockEndPos, delimiters) {
    // Проверяем line comment
    switch (true) {
        case lineCommentPos !== -1 && pos >= lineCommentPos:
            return PositionState.InsideLineComment;
    }
    // Проверяем block comment
    switch (true) {
        case blockStartPos !== -1 && blockEndPos !== -1 && pos >= blockStartPos && pos < blockEndPos:
            return PositionState.InsideBlockComment;
    }
    // Проверяем string
    switch (pure_IsInsideString(line, pos, delimiters)) {
        case true: return PositionState.InsideString;
    }
    return PositionState.Valid;
}
// ============================================================================
// PURE FUNCTIONS: MULTI-CHAR OPERATOR SCANNER
// ============================================================================
function pure_ScanMultiCharOps(line, lineCommentPos, languageConfig) {
    const results = [];
    const multiCharOps = languageConfig.multiCharOps || [];
    const delimiters = languageConfig.stringDelimiters;
    for (const op of multiCharOps) {
        let searchFrom = 0;
        while (true) {
            const pos = line.indexOf(op, searchFrom);
            switch (pos) {
                case -1: break;
                default: {
                    const state = classifyPosition(line, pos, lineCommentPos, pure_FindBlockCommentStart(line, lineCommentPos, languageConfig), pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig), delimiters);
                    switch (state) {
                        case PositionState.Valid:
                            results.push({ pos, op });
                            searchFrom = pos + op.length;
                            break;
                        default:
                            searchFrom = pos + 1;
                    }
                    break;
                }
            }
        }
    }
    return results;
}
// ============================================================================
// PURE FUNCTIONS: SINGLE CHAR ALIGN POINTS
// ============================================================================
function pure_ScanSingleCharAlignPoints(line, alignChars, lineCommentPos, languageConfig) {
    const results = [];
    const delimiters = languageConfig.stringDelimiters;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const state = classifyPosition(line, i, lineCommentPos, pure_FindBlockCommentStart(line, lineCommentPos, languageConfig), pure_FindBlockCommentEnd(line, lineCommentPos, languageConfig), delimiters);
        switch (state) {
            case PositionState.Valid: {
                switch (alignChars.includes(char)) {
                    case true:
                        results.push({ pos: i, op: char });
                        break;
                }
                break;
            }
        }
    }
    return results;
}
// ============================================================================
// PURE FUNCTIONS: COMBINED ALIGN POINTS
// ============================================================================
function pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig) {
    const multi = pure_ScanMultiCharOps(line, lineCommentPos, languageConfig);
    const single = pure_ScanSingleCharAlignPoints(line, alignChars, lineCommentPos, languageConfig);
    return [...multi, ...single].sort((a, b) => a.pos - b.pos);
}
// ============================================================================
// PURE FUNCTIONS: FIND ALIGN POSITIONS (NUMBERS ONLY)
// ============================================================================
function pure_FindAlignPositions(line, alignChars, lineCommentPos, languageConfig) {
    return pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig)
        .map(p => p.pos);
}
// ============================================================================
// PURE FUNCTIONS: EXTRACT CHAR SEQUENCE
// ============================================================================
/**
 * Pure : extracts sequence of operators at positions
 */
function pure_ExtractCharSequence(line, positions) {
    const sequence = [];
    for (const pos of positions) {
        if (pos < line.length) {
            sequence.push(line[pos]);
        }
    }
    return sequence;
}
// ============================================================================
// PURE FUNCTIONS: EXTRACT OPERATOR SEQUENCE FROM ALIGN POINTS
// ============================================================================
function pure_ExtractOperatorSequence(alignPoints) {
    return alignPoints.map(p => p.op);
}
// ============================================================================
// PURE FUNCTIONS: COMMON PREFIX FOR OPERATORS
// ============================================================================
function pure_FindCommonPrefix(sequences) {
    if (sequences.length === 0) {
        return [];
    }
    const minLength = Math.min(...sequences.map(s => s.length));
    const prefix = [];
    for (let i = 0; i < minLength; i++) {
        const char = sequences[0][i];
        switch (sequences.every(seq => seq[i] === char)) {
            case true:
                prefix.push(char);
                break;
            case false: break;
        }
    }
    return prefix;
}
// ============================================================================
// PURE FUNCTIONS: CALCULATE ALIGN COLUMNS
// ============================================================================
function pure_CalculateAlignColumns(lines, alignChars, commonPrefix, languageConfig) {
    const alignMaps = [];
    for (const line of lines) {
        const { lineCommentPos } = pure_ExtractCommentMarkers(line, languageConfig);
        const alignPoints = pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig);
        const sequence = pure_ExtractOperatorSequence(alignPoints);
        const alignMap = new Map();
        let prefixIndex = 0;
        for (let i = 0; i < alignPoints.length && prefixIndex < commonPrefix.length; i++) {
            switch (sequence[i]) {
                case commonPrefix[prefixIndex]:
                    alignMap.set(prefixIndex, alignPoints[i].pos);
                    prefixIndex++;
                    break;
                default:
                    break;
            }
        }
        alignMaps.push(alignMap);
    }
    return alignMaps;
}
// ============================================================================
// PURE FUNCTIONS: COMPUTE MAX COLUMNS
// ============================================================================
function pure_ComputeMaxColumns(alignMaps) {
    const maxColumns = new Map();
    for (const alignMap of alignMaps) {
        for (const [idx, pos] of alignMap) {
            const current = maxColumns.get(idx) || 0;
            switch (pos > current) {
                case true:
                    maxColumns.set(idx, pos);
                    break;
                case false: break;
            }
        }
    }
    return maxColumns;
}
// ============================================================================
// PURE FUNCTIONS: APPLY ALIGNMENT
// ============================================================================
function pure_ApplyAlignment(line, alignMap, maxColumns, alignChars) {
    switch (alignMap.size) {
        case 0: return line;
    }
    const sortedIndices = Array.from(alignMap.keys()).sort((a, b) => a - b);
    let result = line;
    let offset = 0;
    for (const idx of sortedIndices) {
        const originalPos = alignMap.get(idx);
        const targetPos = maxColumns.get(idx);
        const currentPos = originalPos + offset;
        switch (currentPos < targetPos) {
            case true: {
                const spaces = ' '.repeat(targetPos - currentPos);
                result = result.slice(0, currentPos) + spaces + result.slice(currentPos);
                offset += spaces.length;
                break;
            }
        }
    }
    return result;
}
// ============================================================================
// PURE FUNCTIONS: SPLIT INTO BLOCKS
// ============================================================================
function pure_SplitIntoBlocks(lines) {
    const blocks = [];
    let currentBlock = [];
    for (const line of lines) {
        switch (line.trim().length === 0) {
            case true: {
                switch (currentBlock.length > 0) {
                    case true:
                        blocks.push(currentBlock);
                        currentBlock = [];
                        break;
                }
                break;
            }
            case false: {
                currentBlock.push(line);
                break;
            }
        }
    }
    switch (currentBlock.length > 0) {
        case true:
            blocks.push(currentBlock);
            break;
    }
    return blocks;
}
// ============================================================================
// PURE FUNCTIONS: FILTER PURE COMMENTS
// ============================================================================
function pure_FilterPureComments(lines, languageConfig) {
    return lines.filter(line => {
        const trimmed = line.trim();
        for (const marker of languageConfig.lineComments) {
            switch (trimmed.startsWith(marker)) {
                case true: return false;
            }
        }
        return true;
    });
}
// ============================================================================
// _DECOR FUNCTIONS
// ============================================================================
function data_Load_Decor(ns) {
    if (CONFIG.b_Debug) {
        ns.data = { ...ns.config.testData };
        ns.result = ok(ns.data);
        return;
    }
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }
        const selection = ns.selection;
        const config = vscode.workspace.getConfiguration('codeAlign');
        ns.editor = editor;
        ns.data.config = {
            alignChars: config.get('alignChars', CONFIG.defaultAlignChars),
            maxBlockSize: config.get('maxBlockSize', CONFIG.maxBlockSize),
            preserveComments: config.get('preserveComments', CONFIG.preserveComments),
            preserveStrings: config.get('preserveStrings', CONFIG.preserveStrings)
        };
        ns.result = ok(ns.data);
    }
    catch (e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Load failed');
    }
}
function data_Validate_Decor(ns) {
    if (CONFIG.b_Debug) {
        ns.languageId = 'javascript';
        ns.result = ok({});
        return;
    }
    try {
        if (!ns.editor) {
            throw new Error('Editor not available');
        }
        ns.languageId = ns.editor.document.languageId;
        const languageConfig = CONFIG.languageConfigs[ns.languageId];
        if (!languageConfig) {
            throw new Error(`Unsupported language: ${ns.languageId}`);
        }
        ns.data.languageConfig = languageConfig;
        ns.result = ok({});
    }
    catch (e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Validation failed');
    }
}
function data_Process_Decor(ns) {
    if (CONFIG.b_Debug) {
        const testLines = ['const x = 1;', 'const xx = 22;', 'const xxx = { a: 1, b: 2 };'];
        ns.blocks = [testLines];
        ns.result = ok({});
        return;
    }
    try {
        if (!ns.editor || !ns.selection) {
            throw new Error('Editor or selection not available');
        }
        const text = ns.editor.document.getText(ns.selection);
        const lines = text.split('\n');
        const rawBlocks = pure_SplitIntoBlocks(lines);
        ns.blocks = [];
        const alignChars = ns.data.config.alignChars;
        const languageConfig = ns.data.languageConfig;
        for (const block of rawBlocks) {
            if (block.length > ns.data.config.maxBlockSize) {
                ns.blocks.push(block);
                continue;
            }
            const filteredBlock = ns.data.config.preserveComments
                ? pure_FilterPureComments(block, languageConfig)
                : block;
            if (filteredBlock.length === 0) {
                ns.blocks.push(block);
                continue;
            }
            const sequences = [];
            for (const line of filteredBlock) {
                const { lineCommentPos } = pure_ExtractCommentMarkers(line, languageConfig);
                const alignPoints = pure_FindAlignPoints(line, alignChars, lineCommentPos, languageConfig);
                const sequence = pure_ExtractOperatorSequence(alignPoints);
                sequences.push(sequence);
            }
            const commonPrefix = pure_FindCommonPrefix(sequences);
            if (commonPrefix.length === 0) {
                ns.blocks.push(block);
                continue;
            }
            const alignMaps = pure_CalculateAlignColumns(filteredBlock, alignChars, commonPrefix, languageConfig);
            const maxColumns = pure_ComputeMaxColumns(alignMaps);
            const alignedBlock = [];
            for (let i = 0; i < filteredBlock.length; i++) {
                const aligned = pure_ApplyAlignment(filteredBlock[i], alignMaps[i], maxColumns, alignChars);
                alignedBlock.push(aligned);
            }
            ns.blocks.push(alignedBlock);
        }
        ns.result = ok({});
    }
    catch (e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Processing failed');
    }
}
function data_Write_Decor(ns) {
    if (CONFIG.b_Debug) {
        console.log('Debug mode: skipping write');
        ns.result = ok({});
        return;
    }
    try {
        if (!ns.editor || !ns.selection) {
            throw new Error('Editor or selection not available');
        }
        const alignedText = ns.blocks.map((block) => block.join('\n')).join('\n\n');
        ns.editor.edit((editBuilder) => {
            editBuilder.replace(ns.selection, alignedText);
        }).then((success) => {
            if (!success) {
                ns_SetError(ns, 'Failed to write changes');
            }
        });
        ns.result = ok({});
    }
    catch (e) {
        ns_SetError(ns, e instanceof Error ? e.message : 'Write failed');
    }
}
// ============================================================================
// ACTIVATE / DEACTIVATE
// ============================================================================
function activate(context) {
    const ns = NS_Container(CONFIG);
    const outputChannel = vscode.window.createOutputChannel('Better Align');
    const log = (msg) => {
        outputChannel.show();
        outputChannel.appendLine(msg);
    };
    const alignSelection = vscode.commands.registerTextEditorCommand('vscode-better-align-columns.align', (editor, edit) => {
        ns.s_Error = '';
        ns.result = ok({});
        console.log('=== Align started ===');
        log('=== Align started ===');
        vscode.window.showInformationMessage('Aligning...');
        const doc = editor.document;
        const selection = editor.selection;
        let finalSelection;
        if (selection.isEmpty) {
            finalSelection = new vscode.Selection(0, 0, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
            log('Selection empty - using full document');
        }
        else {
            finalSelection = selection;
            log(`Selection: ${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}`);
        }
        ns.editor = editor;
        ns.selection = finalSelection;
        // Step 1: Load
        log('[1/4] Load...');
        data_Load_Decor(ns);
        if (ns_Error(ns)) {
            log(`ERROR Load: ${ns.s_Error}`);
            vscode.window.showErrorMessage(`[Load] ${ns.s_Error}`);
            return;
        }
        log('[1/4] Load OK');
        // Step 2: Validate
        log('[2/4] Validate...');
        data_Validate_Decor(ns);
        if (ns_Error(ns)) {
            log(`ERROR Validate: ${ns.s_Error}`);
            vscode.window.showErrorMessage(`[Validate] ${ns.s_Error}`);
            return;
        }
        log(`[2/4] Validate OK, language: ${ns.languageId}`);
        // Step 3: Process
        log('[3/4] Process...');
        data_Process_Decor(ns);
        if (ns_Error(ns)) {
            log(`ERROR Process: ${ns.s_Error}`);
            vscode.window.showErrorMessage(`[Process] ${ns.s_Error}`);
            return;
        }
        const blockCount = ns.blocks?.length ?? 0;
        const lineCount = ns.blocks?.reduce((sum, b) => sum + b.length, 0) ?? 0;
        log(`[3/4] Process OK, blocks: ${blockCount}, lines: ${lineCount}`);
        // Step 4: Write
        log('[4/4] Write...');
        data_Write_Decor(ns);
        if (ns_Error(ns)) {
            log(`ERROR Write: ${ns.s_Error}`);
            vscode.window.showErrorMessage(`[Write] ${ns.s_Error}`);
            return;
        }
        log('[4/4] Write OK');
        // Success
        if (blockCount === 0 || lineCount === 0) {
            log('Nothing to align');
            vscode.window.showInformationMessage('Nothing to align');
            return;
        }
        const alignChars = ns.data.config?.alignChars?.join(', ') ?? CONFIG.defaultAlignChars.join(', ');
        const allLines = ns.blocks.flat();
        const sampleLines = allLines.slice(0, 2).map((l) => l.substring(0, 40)).join('\n');
        log(`=== Done: ${blockCount} blocks, ${lineCount} lines, chars: [${alignChars}] ===`);
        vscode.window.showInformationMessage(`Aligned: ${blockCount} block(s), ${lineCount} line(s)\nChars: [${alignChars}]\n${sampleLines}`);
    });
    context.subscriptions.push(alignSelection, outputChannel);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension_305.js.map