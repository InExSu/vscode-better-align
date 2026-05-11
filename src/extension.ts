// ============================================================
// Code.Align.Columns — VS Code Extension
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================

// ── 1. IMPORTS ───────────────────────────────────────────────
import * as vscode from 'vscode'
import {
    type LanguageRules,
    type LineBlock,
    type ParsedLine,
    type Marker    ,
    type Result    ,
    type NS        ,
    type NSData,
    DEFAULT_CONFIG,
    DEFAULT_LANGUAGE_RULES,
    LANGUAGE_RULES,
    languageRules_Detect,
    line_Parse,
    blocks_Find,
    block_Align,
    positionMap_Build,
    positionMap_Apply,
    pipeline_Build,
    ns_Error,
    ns_SetError,
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    buildPairwisePositionMap,
    applyPositionMap,
    detectLanguageRules,
} from './fsm_Main'

// ── 2. RESULT HELPERS (re-export) ──────────────────────────────
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v })
const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ── 3. CONFIG ──────────────────────────────────────────────────
const CONFIG = {
    ...DEFAULT_CONFIG,
    testData: {} as Record<string, unknown>,
}

// ── 4. LANGUAGE DETECTION ─────────────────────────────────────
/**
 * Detects language rules based on the editor's document language ID.
 * @param editor - The active text editor
 * @returns Language rules for the document's language
 */
function detectLanguageRulesFromEditor(o_Editor: vscode.TextEditor): LanguageRules {
    return languageRules_Detect(o_Editor.document.languageId, CONFIG.defaultAlignChars)
}

// ── 5. LOGGING DECORATORS (no VS Code API) ────────────────────
const timers = new Map<string, number>()
const line = (ch: string): string => ch.repeat(50)

/** Starts timing for a function and logs the start. */
function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`\n${line('═')}\n▶  ${name}\n${line('─')}`)
}

/** Logs the finish of a function with elapsed time. */
function decor_Finish(name: string): void {
    const start = timers.get(name)
    const duration = start ? (performance.now() - start).toFixed(2) : '?'
    console.log(`${line('─')}\n◀  ${name} (${duration}ms)\n${line('═')}\n`)
    timers.delete(name)
}

/** Runs a decorator function with timing. */
function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    decor_Start(fn.name)
    fn(ns)
    decor_Finish(fn.name)
}

// ── 6. NS CONTAINER ───────────────────────────────────────────
/** Creates a new NooShere container with initial state. */
function NS_Container(cfg: typeof CONFIG): NS {
    return {
        result: ok({}),
        s_Error: '',
        config: cfg,
        data: { editor: false, languageRules: false, blocks: [], parsedLines: [], alignedLines: [] },
        ...cfg.testData,
    }
}

// ── 7. PIPELINE FSM SETUP ─────────────────────────────────────
const pipelineFSM = pipeline_Build(
    config_Load_Decor,
    language_Detect_Decor,
    block_Find_Decor,
    lines_Parse_Decor,
    alignment_Apply_Decor,
    text_Replace_Decor,
    rwd
)

/** Executes the pipeline FSM on the given namespace. */
function a_Chain(ns: NS): void { pipelineFSM(ns) }

// ── 8. PHASE DECORATORS (VS Code API calls) ───────────────────

/** Loads VS Code configuration and applies to namespace. */
function config_Load_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.languageRules = DEFAULT_LANGUAGE_RULES; return }
    try {
        const vsConfig = vscode.workspace.getConfiguration('codeAlign')
        const alignChars = vsConfig.get<string[]>('alignChars', ns.config.defaultAlignChars)
        ns.config = {
            ...ns.config,
            defaultAlignChars: alignChars,
            maxBlockSize: vsConfig.get('maxBlockSize', ns.config.maxBlockSize),
            preserveComments: vsConfig.get('preserveComments', ns.config.preserveComments),
            preserveStrings: vsConfig.get('preserveStrings', ns.config.preserveStrings),
            maxSpaces: vsConfig.get('maxSpaces', ns.config.maxSpaces),
            greedyMatch: vsConfig.get('greedyMatch', ns.config.greedyMatch),
        }
        ns.result = ok(ns.config)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

/** Detects language rules from the active editor. */
function language_Detect_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.languageRules = DEFAULT_LANGUAGE_RULES; return }
    try {
        const editor = vscode.window.activeTextEditor
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        ns.data.editor = editor
        ns.data.languageRules = detectLanguageRulesFromEditor(editor)
        ns.result = ok(ns.data.languageRules)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

/** Parses lines in each block, ignoring strings and comments. */
function lines_Parse_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.parsedLines = (ns['testParsedLines'] as ParsedLine[][] | undefined) ?? []
        ns.result = ok(ns.data.parsedLines); return
    }
    try {
        const o_Rules = ns.data.languageRules
        if(!o_Rules) { ns_SetError(ns, 'No language rules'); return }
        ns.data.parsedLines = ns.data.blocks.map(o_Block => o_Block.lines.map(s_Raw => line_Parse(s_Raw, o_Rules)))
        ns.result = ok(ns.data.parsedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

/** Applies alignment to parsed lines in each block. */
function alignment_Apply_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.alignedLines = (ns['testAlignedLines'] as string[][] | undefined) ?? []
        ns.result = ok(ns.data.alignedLines); return
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map(a_BlockLines => block_Align(a_BlockLines, ns.config.maxSpaces))
        let totalChanges = 0
        ns.data.alignedLines.forEach((block, i) => {
            block.forEach((line, j) => {
                if (line !== ns.data.parsedLines[i][j].raw) {
                    totalChanges++
                }
            })
        })
        console.log(`[DEBUG] Alignment applied: ${totalChanges} lines changed`)
        ns.result = ok(ns.data.alignedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

/** Replaces text in the editor with aligned lines. */
function text_Replace_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.result = ok('debug-no-replace'); return }
    try {
        const editor = ns.data.editor as vscode.TextEditor | false
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        const alignedCount = ns.data.alignedLines.reduce((sum, block) => sum + block.length, 0)
        console.log(`[DEBUG] Replacing text in editor: ${alignedCount} lines in ${ns.data.blocks.length} blocks`)
        applyEditorReplacements(editor, ns.data.blocks, ns.data.alignedLines)
        ns.result = ok('replaced')
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ── 9. BLOCK FINDING FSM (uses pure logic) ─────────────────────

// A5 states (PascalCase)
enum BlockSearchState {
    WaitingForData = 'WaitingForData',
    ValidatingContext = 'ValidatingContext',
    AnalyzingSelection = 'AnalyzingSelection',
    ScanningUp = 'ScanningUp',
    ScanningDown = 'ScanningDown',
    ExtractingLines = 'ExtractingLines',
    GroupingBlocks = 'GroupingBlocks',
    Done = 'Done',
    Error = 'Error',
}

enum SelectionAnalysisState {
    CheckingEmpty = 'CheckingEmpty',
    AutoSearchIndent = 'AutoSearchIndent',
    UsingSelection = 'UsingSelection',
}

type BlockSearchContext = {
    editor: vscode.TextEditor
    rules: LanguageRules
    doc: vscode.TextDocument
    selection: vscode.Selection
    startLine: number
    endLine: number
    initialIndent: string
    activeLine: number
    rawLines: string[]
}

/**
 * Analyzes the selection to determine the block boundaries.
 * @param ctx - Block search context
 * @returns Start and end line numbers                                                                                , or null if no valid block
 */
function analyzeSelection(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    const lastLineIdx = ctx.doc.lineCount - 1

    // Check if selection covers entire file (from line 0 to last line)
    const isFullSelection = !ctx.selection.isEmpty &&
        ctx.selection.start.line === 0 &&
        ctx.selection.start.character === 0 &&
        ctx.selection.end.line === lastLineIdx

    if(isFullSelection) {
        return { startLine: 0, endLine: lastLineIdx }
    }

    let s_State = SelectionAnalysisState.CheckingEmpty
    while(true) {
        switch(s_State) {
            case SelectionAnalysisState.CheckingEmpty:
                s_State = ctx.selection.isEmpty ? SelectionAnalysisState.AutoSearchIndent : SelectionAnalysisState.UsingSelection; break
            case SelectionAnalysisState.AutoSearchIndent:
                return fn_AutoSearchIndent(ctx)
            case SelectionAnalysisState.UsingSelection:
                return { startLine: ctx.selection.start.line, endLine: ctx.selection.end.line }
            default: fn_Unreachable(s_State as never)
        }
    }
}

/** Scans upward from the active line to find block boundary. */
function scanUp(ctx: BlockSearchContext): number | null {
    let line = ctx.activeLine
    while(line > 0) {
        const prev = ctx.doc.lineAt(line - 1)
        if(prev.isEmptyOrWhitespace) { break }
        if((prev.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
        line--
    }
    return line
}

function fn_Unreachable(s_State: never): never {
    throw new Error(`Unhandled state: ${s_State}`)
}

function fn_AutoSearchIndent(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    ctx.activeLine = ctx.selection.active.line
    ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? ''
    const up = scanUp(ctx); if(up === null) { return null } ctx.startLine = up
    const down = scanDown(ctx); if(down === null) { return null } ctx.endLine = down
    return { startLine: ctx.startLine, endLine: ctx.endLine }
}

/** Scans downward from the active line to find block boundary. */
function scanDown(ctx: BlockSearchContext): number | null {
    let line = ctx.activeLine, last = ctx.doc.lineCount - 1
    while(line < last) {
        const next = ctx.doc.lineAt(line + 1)
        if(next.isEmptyOrWhitespace) { break }
        if((next.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
        line++
    }
    return line
}

function fn_GroupBlocks(ns: NS, ctx: BlockSearchContext): void {
    console.log(`[DEBUG] fn_GroupBlocks: rawLines count=${ctx.rawLines.length}, startLine=${ctx.startLine}`)
    ns.data.blocks = blocks_Find(ctx.rawLines, ctx.startLine, ctx.rules, ns.config.maxBlockSize)
    console.log(`[DEBUG] fn_GroupBlocks result: ${ns.data.blocks.length} blocks`)
    if(ns.data.blocks.length === 0) {
        console.log(`[DEBUG] WARNING: No blocks found! Creating fallback block.`)
        ns.data.blocks = [{ startLine: 0, lines: ctx.rawLines }]
    }
}

/**
 * FSM that finds line blocks based on selection and indentation.
 * @param ns - NooShere containing editor state and data
 */
function blockSearchFSM(ns: NS): void {
    const ctx: BlockSearchContext = {
        editor: ns.data.editor as vscode.TextEditor,
        rules: ns.data.languageRules as LanguageRules,
        doc: (ns.data.editor as vscode.TextEditor).document,
        selection: (ns.data.editor as vscode.TextEditor).selection,
        startLine: 0,
        endLine: 0,
        initialIndent: '',
        activeLine: 0,
        rawLines: [],
    }
    let s_State = BlockSearchState.WaitingForData

    main: while(true) {
        switch(s_State) {
            case BlockSearchState.WaitingForData:
                s_State = BlockSearchState.ValidatingContext; break
            case BlockSearchState.ValidatingContext:
                if(!ctx.editor) { ns_SetError(ns, 'No active editor'); s_State = BlockSearchState.Error; break }
                if(!ctx.rules) { ns_SetError(ns, 'No language rules'); s_State = BlockSearchState.Error; break }
                ctx.doc = ctx.editor.document; ctx.selection = ctx.editor.selection
                s_State = BlockSearchState.AnalyzingSelection; break
            case BlockSearchState.AnalyzingSelection: {
                const res = analyzeSelection(ctx)
                if(!res) { s_State = BlockSearchState.Error; break }
                ctx.startLine = res.startLine; ctx.endLine = res.endLine
                s_State = BlockSearchState.ExtractingLines; break
            }
            case BlockSearchState.ExtractingLines:
                ctx.rawLines = extractRawLines(ctx.doc, ctx.startLine, ctx.endLine)
                s_State = BlockSearchState.GroupingBlocks; break
            case BlockSearchState.GroupingBlocks:
                fn_GroupBlocks(ns, ctx)
                s_State = BlockSearchState.Done; break
            case BlockSearchState.Done: ns.result = ok(ns.data.blocks); break main
            case BlockSearchState.Error: break main
            default: fn_Unreachable(s_State as never)
        }
    }
}

/** Decorator that finds blocks in the editor. */
function block_Find_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.blocks = (ns['testBlocks'] as LineBlock[] | undefined) ?? []; ns.result = ok(ns.data.blocks); return }
    try { blockSearchFSM(ns) } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ── 10. EDITOR HELPERS (VS Code API) ──────────────────────────
/** Extracts raw text lines from a document within a range. */
function extractRawLines(doc: vscode.TextDocument, start: number, end: number): string[] {
    const out: string[] = []
    for(let i = start; i <= end; i++) { out.push(doc.lineAt(i).text) }
    return out
}

/** Applies aligned lines to the editor using batch edits. */
function applyEditorReplacements(editor: vscode.TextEditor, blocks: LineBlock[], aligned: string[][]): Thenable<boolean> {
    return editor.edit(builder => {
        for(let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi], lines = aligned[bi]
            for(let li = 0; li < block.lines.length; li++) {
                const idx = block.startLine + li
                builder.replace(editor.document.lineAt(idx).range, lines[li])
            }
        }
    })
}

// ── 11. WRAPPER FOR TESTS ─────────────────────────────────────
/** Finds alignment markers in code (wrapper for testing). */
function findAlignCharsGreedy(s_Code: string, a_AlignChars: string[], o_Rules: LanguageRules): Marker[] {
    return line_Parse(s_Code, { ...o_Rules, alignChars: a_AlignChars }).markers
}

// ── 12. ACTIVATE / DEACTIVATE ─────────────────────────────────
/** Entry point called when extension is activated. */
export function activate(context: vscode.ExtensionContext): void {
    const runAlign = (): void => {
        const ns = NS_Container(CONFIG)
        a_Chain(ns)
        if(ns.s_Error) {
            vscode.window.showErrorMessage(`Code.Align: ${ns.s_Error}`)
        } else {
            vscode.window.showInformationMessage('Code aligned successfully')
        }
    }
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-better-align-columns.align', runAlign),
        vscode.commands.registerCommand('CodeAlign.AlignBlock', runAlign),
        vscode.commands.registerCommand('CodeAlign.Configure', () => vscode.commands.executeCommand('workbench.action.openSettings', 'codeAlign')),
    )
}

/** Cleanup when extension is deactivated. */
export function deactivate(): void { }

// ── EXPORTS ──────────────────────────────────────────────────
export {
    ok, err,
    NS_Container,
    a_Chain,
    findAlignCharsGreedy,
    buildPairwisePositionMap,
    applyPositionMap,
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    detectLanguageRules,
    DEFAULT_LANGUAGE_RULES,
    CONFIG,
    LanguageRules,
    ParsedLine,
    Marker,
    LineBlock,
}
