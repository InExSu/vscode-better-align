// ============================================================
// Code.Align.Columns — VS Code Extension
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================

// ── 1. IMPORTS ───────────────────────────────────────────────
import * as vscode from 'vscode'
import {
    // Types
    type LanguageRules,
    type LineBlock,
    type ParsedLine,
    type Marker,
    type Result,
    type NS,
    type NSData,
    // Types for config
    DEFAULT_CONFIG,
    // Language rules
    DEFAULT_LANGUAGE_RULES,
    LANGUAGE_RULES,
    detectLanguageRules,
    // Pure functions
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    buildPairwisePositionMap,
    applyPositionMap,
    // FSM types
    PipelineState,
    Decorator,
    buildPipelineFSM,
    ns_Error,
    ns_SetError,
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
function detectLanguageRulesFromEditor(editor: vscode.TextEditor): LanguageRules {
    return detectLanguageRules(editor.document.languageId, CONFIG.defaultAlignChars)
}

// ── 5. LOGGING DECORATORS (no VS Code API) ────────────────────
const timers = new Map<string, number>()
const line = (ch: string): string => ch.repeat(50)

function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`\n${line('═')}\n▶  ${name}\n${line('─')}`)
}

function decor_Finish(name: string): void {
    const start = timers.get(name)
    const duration = start ? (performance.now() - start).toFixed(2) : '?'
    console.log(`${line('─')}\n◀  ${name} (${duration}ms)\n${line('═')}\n`)
    timers.delete(name)
}

function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    decor_Start(fn.name)
    fn(ns)
    decor_Finish(fn.name)
}

// ── 6. NS CONTAINER ───────────────────────────────────────────
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
const pipelineFSM = buildPipelineFSM(
    config_Load_Decor,
    language_Detect_Decor,
    block_Find_Decor,
    lines_Parse_Decor,
    alignment_Apply_Decor,
    text_Replace_Decor,
    rwd
)

function a_Chain(ns: NS): void { pipelineFSM(ns) }

// ── 8. PHASE DECORATORS (VS Code API calls) ───────────────────

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

function lines_Parse_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.parsedLines = (ns['testParsedLines'] as ParsedLine[][] | undefined) ?? []
        ns.result = ok(ns.data.parsedLines); return
    }
    try {
        const rules = ns.data.languageRules
        if(!rules) { ns_SetError(ns, 'No language rules'); return }
        ns.data.parsedLines = ns.data.blocks.map(block => block.lines.map(raw => parseLineIgnoringStrings(raw, rules)))
        ns.result = ok(ns.data.parsedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function alignment_Apply_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.alignedLines = (ns['testAlignedLines'] as string[][] | undefined) ?? []
        ns.result = ok(ns.data.alignedLines); return
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map(blockLines => alignBlock(blockLines, ns.config.maxSpaces))
        ns.result = ok(ns.data.alignedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function text_Replace_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.result = ok('debug-no-replace'); return }
    try {
        const editor = ns.data.editor as vscode.TextEditor | false
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
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

function analyzeSelection(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    let state = SelectionAnalysisState.CheckingEmpty
    while(true) {
        switch(state) {
            case SelectionAnalysisState.CheckingEmpty:
                state = ctx.selection.isEmpty ? SelectionAnalysisState.AutoSearchIndent : SelectionAnalysisState.UsingSelection; break
            case SelectionAnalysisState.AutoSearchIndent: {
                ctx.activeLine = ctx.selection.active.line
                ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? ''
                const up = scanUp(ctx); if(up === null) { return null } ctx.startLine = up
                const down = scanDown(ctx); if(down === null) { return null } ctx.endLine = down
                return { startLine: ctx.startLine, endLine: ctx.endLine }
            }
            case SelectionAnalysisState.UsingSelection:
                return { startLine: ctx.selection.start.line, endLine: ctx.selection.end.line }
        }
    }
}

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
    let state = BlockSearchState.WaitingForData

    main: while(true) {
        switch(state) {
            case BlockSearchState.WaitingForData:
                state = BlockSearchState.ValidatingContext; break
            case BlockSearchState.ValidatingContext:
                if(!ctx.editor) { ns_SetError(ns, 'No active editor'); state = BlockSearchState.Error; break }
                if(!ctx.rules) { ns_SetError(ns, 'No language rules'); state = BlockSearchState.Error; break }
                ctx.doc = ctx.editor.document; ctx.selection = ctx.editor.selection
                state = BlockSearchState.AnalyzingSelection; break
            case BlockSearchState.AnalyzingSelection: {
                const res = analyzeSelection(ctx)
                if(!res) { state = BlockSearchState.Error; break }
                ctx.startLine = res.startLine; ctx.endLine = res.endLine
                state = BlockSearchState.ExtractingLines; break
            }
            case BlockSearchState.ExtractingLines:
                ctx.rawLines = extractRawLines(ctx.doc, ctx.startLine, ctx.endLine)
                state = BlockSearchState.GroupingBlocks; break
            case BlockSearchState.GroupingBlocks:
                ns.data.blocks = findLineBlocks(ctx.rawLines, ctx.startLine, ctx.rules, ns.config.maxBlockSize)
                state = BlockSearchState.Done; break
            case BlockSearchState.Done: ns.result = ok(ns.data.blocks); break main
            case BlockSearchState.Error: break main
        }
    }
}

function block_Find_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.blocks = (ns['testBlocks'] as LineBlock[] | undefined) ?? []; ns.result = ok(ns.data.blocks); return }
    try { blockSearchFSM(ns) } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ── 10. EDITOR HELPERS (VS Code API) ──────────────────────────
function extractRawLines(doc: vscode.TextDocument, start: number, end: number): string[] {
    const out: string[] = []
    for(let i = start; i <= end; i++) { out.push(doc.lineAt(i).text) }
    return out
}

function applyEditorReplacements(editor: vscode.TextEditor, blocks: LineBlock[], aligned: string[][]): void {
    editor.edit(builder => {
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
function findAlignCharsGreedy(code: string, alignChars: string[], rules: LanguageRules): Marker[] {
    return parseLineIgnoringStrings(code, { ...rules, alignChars }).markers
}

// ── 12. ACTIVATE / DEACTIVATE ─────────────────────────────────
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
