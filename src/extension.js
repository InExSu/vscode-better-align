"use strict";
// ============================================================
// Code.Align.Columns — VS Code Extension
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================
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
exports.CONFIG = exports.DEFAULT_LANGUAGE_RULES = exports.detectLanguageRules = exports.alignBlock = exports.findLineBlocks = exports.parseLineIgnoringStrings = exports.applyPositionMap = exports.buildPairwisePositionMap = exports.findAlignCharsGreedy = exports.a_Chain = exports.NS_Container = exports.err = exports.ok = exports.deactivate = exports.activate = void 0;
// ── 1. IMPORTS ───────────────────────────────────────────────
const vscode = __importStar(require("vscode"));
const fsm_Main_1 = require("./fsm_Main");
Object.defineProperty(exports, "DEFAULT_LANGUAGE_RULES", { enumerable: true, get: function () { return 
    // Language rules
    fsm_Main_1.DEFAULT_LANGUAGE_RULES; } });
Object.defineProperty(exports, "detectLanguageRules", { enumerable: true, get: function () { return fsm_Main_1.detectLanguageRules; } });
Object.defineProperty(exports, "parseLineIgnoringStrings", { enumerable: true, get: function () { return 
    // Pure functions
    fsm_Main_1.parseLineIgnoringStrings; } });
Object.defineProperty(exports, "findLineBlocks", { enumerable: true, get: function () { return fsm_Main_1.findLineBlocks; } });
Object.defineProperty(exports, "alignBlock", { enumerable: true, get: function () { return fsm_Main_1.alignBlock; } });
Object.defineProperty(exports, "buildPairwisePositionMap", { enumerable: true, get: function () { return fsm_Main_1.buildPairwisePositionMap; } });
Object.defineProperty(exports, "applyPositionMap", { enumerable: true, get: function () { return fsm_Main_1.applyPositionMap; } });
// ── 2. RESULT HELPERS (re-export) ──────────────────────────────
const ok = (v) => ({ ok: true, value: v });
exports.ok = ok;
const err = (e) => ({ ok: false, error: e });
exports.err = err;
// ── 3. CONFIG ──────────────────────────────────────────────────
const CONFIG = {
    ...fsm_Main_1.DEFAULT_CONFIG,
    testData: {},
};
exports.CONFIG = CONFIG;
// ── 4. LANGUAGE DETECTION ─────────────────────────────────────
function detectLanguageRulesFromEditor(editor) {
    return (0, fsm_Main_1.detectLanguageRules)(editor.document.languageId, CONFIG.defaultAlignChars);
}
// ── 5. LOGGING DECORATORS (no VS Code API) ────────────────────
const timers = new Map();
const line = (ch) => ch.repeat(50);
function decor_Start(name) {
    timers.set(name, performance.now());
    console.log(`\n${line('═')}\n▶  ${name}\n${line('─')}`);
}
function decor_Finish(name) {
    const start = timers.get(name);
    const duration = start ? (performance.now() - start).toFixed(2) : '?';
    console.log(`${line('─')}\n◀  ${name} (${duration}ms)\n${line('═')}\n`);
    timers.delete(name);
}
function rwd(fn, ns) {
    if ((0, fsm_Main_1.ns_Error)(ns)) {
        return;
    }
    decor_Start(fn.name);
    fn(ns);
    decor_Finish(fn.name);
}
// ── 6. NS CONTAINER ───────────────────────────────────────────
function NS_Container(cfg) {
    return {
        result: ok({}),
        s_Error: '',
        config: cfg,
        data: { editor: false, languageRules: false, blocks: [], parsedLines: [], alignedLines: [] },
        ...cfg.testData,
    };
}
exports.NS_Container = NS_Container;
// ── 7. PIPELINE FSM SETUP ─────────────────────────────────────
const pipelineFSM = (0, fsm_Main_1.buildPipelineFSM)(config_Load_Decor, language_Detect_Decor, block_Find_Decor, lines_Parse_Decor, alignment_Apply_Decor, text_Replace_Decor, rwd);
function a_Chain(ns) { pipelineFSM(ns); }
exports.a_Chain = a_Chain;
// ── 8. PHASE DECORATORS (VS Code API calls) ───────────────────
function config_Load_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.languageRules = fsm_Main_1.DEFAULT_LANGUAGE_RULES;
        return;
    }
    try {
        const vsConfig = vscode.workspace.getConfiguration('codeAlign');
        const alignChars = vsConfig.get('alignChars', ns.config.defaultAlignChars);
        ns.config = {
            ...ns.config,
            defaultAlignChars: alignChars,
            maxBlockSize: vsConfig.get('maxBlockSize', ns.config.maxBlockSize),
            preserveComments: vsConfig.get('preserveComments', ns.config.preserveComments),
            preserveStrings: vsConfig.get('preserveStrings', ns.config.preserveStrings),
            maxSpaces: vsConfig.get('maxSpaces', ns.config.maxSpaces),
            greedyMatch: vsConfig.get('greedyMatch', ns.config.greedyMatch),
        };
        ns.result = ok(ns.config);
    }
    catch (e) {
        (0, fsm_Main_1.ns_SetError)(ns, e.message);
    }
}
function language_Detect_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.languageRules = fsm_Main_1.DEFAULT_LANGUAGE_RULES;
        return;
    }
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            (0, fsm_Main_1.ns_SetError)(ns, 'No active editor');
            return;
        }
        ns.data.editor = editor;
        ns.data.languageRules = detectLanguageRulesFromEditor(editor);
        ns.result = ok(ns.data.languageRules);
    }
    catch (e) {
        (0, fsm_Main_1.ns_SetError)(ns, e.message);
    }
}
function lines_Parse_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.parsedLines = ns['testParsedLines'] ?? [];
        ns.result = ok(ns.data.parsedLines);
        return;
    }
    try {
        const rules = ns.data.languageRules;
        if (!rules) {
            (0, fsm_Main_1.ns_SetError)(ns, 'No language rules');
            return;
        }
        ns.data.parsedLines = ns.data.blocks.map(block => block.lines.map(raw => (0, fsm_Main_1.parseLineIgnoringStrings)(raw, rules)));
        ns.result = ok(ns.data.parsedLines);
    }
    catch (e) {
        (0, fsm_Main_1.ns_SetError)(ns, e.message);
    }
}
function alignment_Apply_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.alignedLines = ns['testAlignedLines'] ?? [];
        ns.result = ok(ns.data.alignedLines);
        return;
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map(blockLines => (0, fsm_Main_1.alignBlock)(blockLines, ns.config.maxSpaces));
        ns.result = ok(ns.data.alignedLines);
    }
    catch (e) {
        (0, fsm_Main_1.ns_SetError)(ns, e.message);
    }
}
function text_Replace_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.result = ok('debug-no-replace');
        return;
    }
    try {
        const editor = ns.data.editor;
        if (!editor) {
            (0, fsm_Main_1.ns_SetError)(ns, 'No active editor');
            return;
        }
        applyEditorReplacements(editor, ns.data.blocks, ns.data.alignedLines);
        ns.result = ok('replaced');
    }
    catch (e) {
        (0, fsm_Main_1.ns_SetError)(ns, e.message);
    }
}
// ── 9. BLOCK FINDING FSM (uses pure logic) ─────────────────────
// A5 states (PascalCase)
var BlockSearchState;
(function (BlockSearchState) {
    BlockSearchState["WaitingForData"] = "WaitingForData";
    BlockSearchState["ValidatingContext"] = "ValidatingContext";
    BlockSearchState["AnalyzingSelection"] = "AnalyzingSelection";
    BlockSearchState["ScanningUp"] = "ScanningUp";
    BlockSearchState["ScanningDown"] = "ScanningDown";
    BlockSearchState["ExtractingLines"] = "ExtractingLines";
    BlockSearchState["GroupingBlocks"] = "GroupingBlocks";
    BlockSearchState["Done"] = "Done";
    BlockSearchState["Error"] = "Error";
})(BlockSearchState || (BlockSearchState = {}));
var SelectionAnalysisState;
(function (SelectionAnalysisState) {
    SelectionAnalysisState["CheckingEmpty"] = "CheckingEmpty";
    SelectionAnalysisState["AutoSearchIndent"] = "AutoSearchIndent";
    SelectionAnalysisState["UsingSelection"] = "UsingSelection";
})(SelectionAnalysisState || (SelectionAnalysisState = {}));
function analyzeSelection(ctx) {
    const isFullSelection = !ctx.selection.isEmpty &&
        ctx.selection.start.line === 0 &&
        ctx.selection.end.line === ctx.doc.lineCount - 1;
    if (isFullSelection) {
        return { startLine: 0, endLine: ctx.doc.lineCount - 1 };
    }
    let state = SelectionAnalysisState.CheckingEmpty;
    while (true) {
        switch (state) {
            case SelectionAnalysisState.CheckingEmpty:
                state = ctx.selection.isEmpty ? SelectionAnalysisState.AutoSearchIndent : SelectionAnalysisState.UsingSelection;
                break;
            case SelectionAnalysisState.AutoSearchIndent: {
                ctx.activeLine = ctx.selection.active.line;
                ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? '';
                const up = scanUp(ctx);
                if (up === null) {
                    return null;
                }
                ctx.startLine = up;
                const down = scanDown(ctx);
                if (down === null) {
                    return null;
                }
                ctx.endLine = down;
                return { startLine: ctx.startLine, endLine: ctx.endLine };
            }
            case SelectionAnalysisState.UsingSelection:
                return { startLine: ctx.selection.start.line, endLine: ctx.selection.end.line };
        }
    }
}
function scanUp(ctx) {
    let line = ctx.activeLine;
    while (line > 0) {
        const prev = ctx.doc.lineAt(line - 1);
        if (prev.isEmptyOrWhitespace) {
            break;
        }
        if ((prev.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) {
            break;
        }
        line--;
    }
    return line;
}
function scanDown(ctx) {
    let line = ctx.activeLine, last = ctx.doc.lineCount - 1;
    while (line < last) {
        const next = ctx.doc.lineAt(line + 1);
        if (next.isEmptyOrWhitespace) {
            break;
        }
        if ((next.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) {
            break;
        }
        line++;
    }
    return line;
}
function blockSearchFSM(ns) {
    const ctx = {
        editor: ns.data.editor,
        rules: ns.data.languageRules,
        doc: ns.data.editor.document,
        selection: ns.data.editor.selection,
        startLine: 0,
        endLine: 0,
        initialIndent: '',
        activeLine: 0,
        rawLines: [],
    };
    let state = BlockSearchState.WaitingForData;
    main: while (true) {
        switch (state) {
            case BlockSearchState.WaitingForData:
                state = BlockSearchState.ValidatingContext;
                break;
            case BlockSearchState.ValidatingContext:
                if (!ctx.editor) {
                    (0, fsm_Main_1.ns_SetError)(ns, 'No active editor');
                    state = BlockSearchState.Error;
                    break;
                }
                if (!ctx.rules) {
                    (0, fsm_Main_1.ns_SetError)(ns, 'No language rules');
                    state = BlockSearchState.Error;
                    break;
                }
                ctx.doc = ctx.editor.document;
                ctx.selection = ctx.editor.selection;
                state = BlockSearchState.AnalyzingSelection;
                break;
            case BlockSearchState.AnalyzingSelection: {
                const res = analyzeSelection(ctx);
                if (!res) {
                    state = BlockSearchState.Error;
                    break;
                }
                ctx.startLine = res.startLine;
                ctx.endLine = res.endLine;
                state = BlockSearchState.ExtractingLines;
                break;
            }
            case BlockSearchState.ExtractingLines:
                ctx.rawLines = extractRawLines(ctx.doc, ctx.startLine, ctx.endLine);
                state = BlockSearchState.GroupingBlocks;
                break;
            case BlockSearchState.GroupingBlocks: {
                const isFullSelection = ctx.startLine === 0 && ctx.endLine === ctx.doc.lineCount - 1;
                const lines = ctx.rawLines;
                if (isFullSelection && lines.length > 1 && ctx.rules.lineComments.length > 0) {
                    const hasMultipleIndents = new Set(lines.map(l => l.match(/^(\s*)/)?.[1] ?? '')).size > 1;
                    if (hasMultipleIndents) {
                        ns.data.blocks = [{ startLine: ctx.startLine, lines: ctx.rawLines }];
                    }
                    else {
                        ns.data.blocks = (0, fsm_Main_1.findLineBlocks)(ctx.rawLines, ctx.startLine, ctx.rules, ns.config.maxBlockSize);
                    }
                }
                else {
                    ns.data.blocks = (0, fsm_Main_1.findLineBlocks)(ctx.rawLines, ctx.startLine, ctx.rules, ns.config.maxBlockSize);
                }
                state = BlockSearchState.Done;
                break;
            }
            case BlockSearchState.Done:
                ns.result = ok(ns.data.blocks);
                break main;
            case BlockSearchState.Error: break main;
        }
    }
}
function block_Find_Decor(ns) {
    if (ns.config.b_Debug) {
        ns.data.blocks = ns['testBlocks'] ?? [];
        ns.result = ok(ns.data.blocks);
        return;
    }
    try {
        blockSearchFSM(ns);
    }
    catch (e) {
        (0, fsm_Main_1.ns_SetError)(ns, e.message);
    }
}
// ── 10. EDITOR HELPERS (VS Code API) ──────────────────────────
function extractRawLines(doc, start, end) {
    const out = [];
    for (let i = start; i <= end; i++) {
        out.push(doc.lineAt(i).text);
    }
    return out;
}
function applyEditorReplacements(editor, blocks, aligned) {
    editor.edit(builder => {
        for (let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi], lines = aligned[bi];
            for (let li = 0; li < block.lines.length; li++) {
                const idx = block.startLine + li;
                builder.replace(editor.document.lineAt(idx).range, lines[li]);
            }
        }
    });
}
// ── 11. WRAPPER FOR TESTS ─────────────────────────────────────
function findAlignCharsGreedy(code, alignChars, rules) {
    return (0, fsm_Main_1.parseLineIgnoringStrings)(code, { ...rules, alignChars }).markers;
}
exports.findAlignCharsGreedy = findAlignCharsGreedy;
// ── 12. ACTIVATE / DEACTIVATE ─────────────────────────────────
function activate(context) {
    const runAlign = () => {
        const ns = NS_Container(CONFIG);
        a_Chain(ns);
        if (ns.s_Error) {
            vscode.window.showErrorMessage(`Code.Align: ${ns.s_Error}`);
        }
        else {
            vscode.window.showInformationMessage('Code aligned successfully');
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('vscode-better-align-columns.align', runAlign), vscode.commands.registerCommand('CodeAlign.AlignBlock', runAlign), vscode.commands.registerCommand('CodeAlign.Configure', () => vscode.commands.executeCommand('workbench.action.openSettings', 'codeAlign')));
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map