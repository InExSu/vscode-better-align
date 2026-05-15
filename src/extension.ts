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
    type Marker,
    type Result,
    type NS,
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

// ── 2. RESULT HELPERS ──────────────────────────────────────────
const ok  = <T,>(v: T): Result<T> => ({ ok: true, value: v })
const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

// ── 3. CONFIG ──────────────────────────────────────────────────
const CONFIG = {
    ...DEFAULT_CONFIG,
    testData: {} as Record<string, unknown>,
}

// ── 4. LANGUAGE DETECTION ─────────────────────────────────────
function detectLanguageRulesFromEditor(o_Editor: vscode.TextEditor): LanguageRules {
    return languageRules_Detect(o_Editor.document.languageId, CONFIG.defaultAlignChars)
}

// ── 5. LOGGING DECORATORS ─────────────────────────────────────
const timers = new Map<string, number>()
const line   = (ch: string): string => ch.repeat(50)

function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`\n${line('═')}\n▶  ${name}\n${line('─')}`)
}

function decor_Finish(name: string): void {
    const start    = timers.get(name)
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
        s_Error: ''          ,
        config: cfg          ,
        data: { editor: false, languageRules: false, blocks: [], parsedLines: [], alignedLines: [] },
        ...cfg.testData,
    }
}

// ── 7. PIPELINE FSM SETUP ─────────────────────────────────────
const pipelineFSM = pipeline_Build(
    config_Load_Decor    ,
    language_Detect_Decor,
    block_Find_Decor     ,
    lines_Parse_Decor    ,
    alignment_Apply_Decor,
    text_Replace_Decor   ,
    rwd
)

function a_Chain(ns: NS): void { pipelineFSM(ns) }

// ── 8. PHASE DECORATORS ───────────────────────────────────────

function config_Load_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.languageRules = DEFAULT_LANGUAGE_RULES; return }

    try {
        const o_VsConfig = vscode.workspace.getConfiguration('codeAlign')
        ns.config = {
            ...ns.config,
            defaultAlignChars: o_VsConfig.get<string[]>('alignChars', ns.config.defaultAlignChars),
            maxBlockSize     : o_VsConfig.get('maxBlockSize'        , ns.config.maxBlockSize)     ,
            preserveComments : o_VsConfig.get('preserveComments'    , ns.config.preserveComments) ,
            preserveStrings  : o_VsConfig.get('preserveStrings'     , ns.config.preserveStrings)  ,
            maxSpaces        : o_VsConfig.get('maxSpaces'           , ns.config.maxSpaces)        ,
            greedyMatch      : o_VsConfig.get('greedyMatch'         , ns.config.greedyMatch)      ,
        }
        ns.result = ok(ns.config)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function language_Detect_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.languageRules = DEFAULT_LANGUAGE_RULES; return }
    try {
        const o_Editor = vscode.window.activeTextEditor
        if(!o_Editor) { ns_SetError(ns, 'No active editor'); return }
        ns.data.editor = o_Editor
        ns.data.languageRules = detectLanguageRulesFromEditor(o_Editor)
        ns.result = ok(ns.data.languageRules)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// FIX #5: убраны debug showInformationMessage из продакшн-декораторов
function lines_Parse_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.parsedLines = (ns['testParsedLines'] as ParsedLine[][] | undefined) ?? []
        ns.result           = ok(ns.data.parsedLines)
        return
    }
    try {
        const o_Rules       = ns.data.languageRules
        if(!o_Rules) { ns_SetError(ns, 'No language rules'); return }
        ns.data.parsedLines = ns.data.blocks.map(
            o_Block => o_Block.lines.map(s_Raw => line_Parse(s_Raw, o_Rules))
        )
        ns.result           = ok(ns.data.parsedLines)
    } catch(e) { ns_SetError(ns      , (e as Error).message) }
}

// FIX #5: убраны debug showInformationMessage
function alignment_Apply_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.alignedLines = (ns['testAlignedLines'] as string[][] | undefined) ?? []
        ns.result = ok(ns.data.alignedLines)
        return
    }
    try {
        // FIX #6: передаём maxSpaces в block_Align
        ns.data.alignedLines = ns.data.parsedLines.map(
            a_BlockLines => block_Align(a_BlockLines, ns.config.maxSpaces)
        )
        ns.result = ok(ns.data.alignedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function text_Replace_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.result = ok('debug-no-replace'); return }
    try {
        const o_Editor = ns.data.editor as vscode.TextEditor | false
        if(!o_Editor) { ns_SetError(ns, 'No active editor'); return }
        applyEditorReplacements(o_Editor, ns.data.blocks, ns.data.alignedLines)
        ns.result = ok('replaced')
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ── 9. BLOCK FINDING FSM ──────────────────────────────────────

enum BlockSearchState {
    WaitingForData = 'WaitingForData',
    ValidatingContext = 'ValidatingContext',
    AnalyzingSelection = 'AnalyzingSelection',
    ExtractingLines = 'ExtractingLines',
    GroupingBlocks = 'GroupingBlocks',
    Done = 'Done',
    Error = 'Error',
}

type BlockSearchContext = {
    editor       : vscode.TextEditor
    rules        : LanguageRules
    doc          : vscode.TextDocument
    selection    : vscode.Selection
    startLine    : number
    endLine      : number
    initialIndent: string
    activeLine   : number
    rawLines     : string[]
}

// FIX #4 + FIX #7: логика выбора блока унифицирована.
// Весь файл и явное выделение → используем диапазон.
// Без выделения → автопоиск по отступу.
// Убраны состояния ScanningUp/ScanningDown — они теперь внутри fn_AutoSearchIndent.
function analyzeSelection(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    if(ctx.selection.isEmpty) {
        // Нет выделения — ищем блок по отступу от позиции курсора
        return fn_AutoSearchIndent(ctx)
    }

    const i_DocLineCount = ctx.doc.lineCount
    const i_SelStart     = ctx.selection.start.line
    const i_SelEnd       = ctx.selection.end.line

    // FIX #7: весь файл выделен — возвращаем весь диапазон (без автопоиска по отступу,
    // который игнорировал бы строки с другим отступом внутри файла).
    // Частичное выделение — используем точно выделенный диапазон.
    return {
        startLine: i_SelStart       ,
        endLine  : Math.min(i_SelEnd, i_DocLineCount - 1),
    }
}

function fn_AutoSearchIndent(ctx: BlockSearchContext): { startLine: number; endLine: number } | null {
    ctx.activeLine    = ctx.selection.active.line
    ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? ''

    const i_Up   = scanUp(ctx)
    const i_Down = scanDown(ctx)

    if(i_Up === null || i_Down === null) { return null }

    ctx.startLine = i_Up
    ctx.endLine   = i_Down
    return { startLine: ctx.startLine, endLine: ctx.endLine }
}

function scanUp(ctx: BlockSearchContext): number | null {
    let i_Line       = ctx.activeLine
    while(i_Line > 0) {
        const o_Prev = ctx.doc.lineAt(i_Line - 1)
        if(o_Prev.isEmptyOrWhitespace) { break }
        if((o_Prev.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
        i_Line--
    }
    return i_Line
}

function scanDown(ctx: BlockSearchContext): number | null {
    let i_Line       = ctx.activeLine
    const i_Last     = ctx.doc.lineCount - 1
    while(i_Line < i_Last) {
        const o_Next = ctx.doc.lineAt(i_Line + 1)
        if(o_Next.isEmptyOrWhitespace) { break }
        if((o_Next.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
        i_Line++
    }
    return i_Line
}

function fn_Unreachable(s_State: never): never {
    throw new Error(`Unhandled state: ${s_State}`)
}

// FIX #4: fn_GroupBlocks вызывается один раз, на уже отфильтрованных rawLines,
// без повторной фильтрации по отступу (которую уже сделал blockSearchFSM).
function fn_GroupBlocks(ns: NS                              , ctx: BlockSearchContext): void {
    ns.data.blocks     = blocks_Find(ctx.rawLines           , ctx.startLine, ctx.rules, ns.config.maxBlockSize)
    if(ns.data.blocks.length === 0) {
        ns.data.blocks = [{ startLine: ctx.startLine, lines: ctx.rawLines }]
    }
}

function blockSearchFSM(ns: NS): void {
    const o_Editor = ns.data.editor as vscode.TextEditor
    const ctx: BlockSearchContext = {
        editor: o_Editor,
        rules: ns.data.languageRules as LanguageRules,
        doc: o_Editor.document,
        selection: o_Editor.selection,
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
                s_State = BlockSearchState.ValidatingContext
                break

            case BlockSearchState.ValidatingContext:
                if(!ctx.editor) { ns_SetError(ns, 'No active editor'); s_State  = BlockSearchState.Error; break }
                if(!ctx.rules) { ns_SetError(ns , 'No language rules'); s_State = BlockSearchState.Error; break }
                ctx.doc       = ctx.editor.document
                ctx.selection = ctx.editor.selection
                s_State       = BlockSearchState.AnalyzingSelection
                break

            case BlockSearchState.AnalyzingSelection: {
                const o_Res   = analyzeSelection(ctx)
                if(!o_Res) { s_State = BlockSearchState.Error; break }
                ctx.startLine = o_Res.startLine
                ctx.endLine   = Math.min(o_Res.endLine, ctx.doc.lineCount - 1)
                s_State       = BlockSearchState.ExtractingLines
                break
            }

            case BlockSearchState.ExtractingLines:
                ctx.rawLines = extractRawLines(ctx.doc, ctx.startLine, ctx.endLine)
                s_State      = BlockSearchState.GroupingBlocks
                break

            case BlockSearchState.GroupingBlocks:
                fn_GroupBlocks(ns, ctx)
                s_State = BlockSearchState.Done
                break

            case BlockSearchState.Done:
                ns.result = ok(ns.data.blocks)
                break main

            case BlockSearchState.Error:
                break main

            default:
                fn_Unreachable(s_State as never)
        }
    }
}

function block_Find_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.blocks = (ns['testBlocks'] as LineBlock[] | undefined) ?? []
        ns.result = ok(ns.data.blocks)
        return
    }
    try { blockSearchFSM(ns) } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ── 10. EDITOR HELPERS ────────────────────────────────────────
function extractRawLines(doc: vscode.TextDocument, i_Start: number, i_End: number): string[] {
    const a_Out: string[] = []
    for(let i = i_Start; i <= i_End; i++) { a_Out.push(doc.lineAt(i).text) }
    return a_Out
}

function applyEditorReplacements(
    o_Editor: vscode.TextEditor,
    a_Blocks: LineBlock[],
    a_Aligned: string[][]
): Thenable<boolean> {
    return o_Editor.edit(builder => {
        for(let bi          = 0; bi < a_Blocks.length; bi++) {
            const o_Block   = a_Blocks[bi]
            const a_Lines   = a_Aligned[bi]
            for(let li      = 0; li < o_Block.lines.length; li++) {
                const i_Idx = o_Block.startLine + li
                builder.replace(o_Editor.document.lineAt(i_Idx).range, a_Lines[li])
            }
        }
    })
}

// ── 11. WRAPPER FOR TESTS ─────────────────────────────────────
function findAlignCharsGreedy(s_Code: string, a_AlignChars: string[], o_Rules: LanguageRules): Marker[] {
    return line_Parse(s_Code, { ...o_Rules, alignChars: a_AlignChars }).markers
}

// ── 12. ACTIVATE / DEACTIVATE ─────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
    const runAlign = (): void => {
        const ns   = NS_Container(CONFIG)
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
        vscode.commands.registerCommand('CodeAlign.Configure', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', 'codeAlign')
        ),
    )
}

export function deactivate(): void { }

// ── EXPORTS ───────────────────────────────────────────────────
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