'use strict'
import * as vscode from 'vscode'

// ============================================================================
// TYPES
// ============================================================================

type AlignPoint = { pos: number; op: string }
type Block      = string[]

interface LanguageConfig {
    lineComments         : string[]
    blockComments        : { start: string; end: string }[]
    stringDelimiters     : string[]
    alignChars           : string[]
    multiCharOps         : string[]
}

// ============================================================================
// LANGUAGE CONFIG
// ============================================================================

const DEFAULT_LANG      : Record<string, LanguageConfig> = {
    javascript          :        {
        lineComments    : ['//'] ,
        blockComments   : [      { start           : '/*', end: '*/' }],
        stringDelimiters: ['"'   , "'"             , '`'],
        alignChars      : [':'   , '               {', '=', ','],
        multiCharOps    : ['===' , '                 !==', '==', '!=', '<=', '>=', '=>', '->', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=']
    }                   ,
    typescript          :        {
        lineComments    : ['//'] ,
        blockComments   : [      { start           : '/*', end: '*/' }],
        stringDelimiters: ['"'   , "'"             , '`'],
        alignChars      : [':'   , '               {', '=', ','],
        multiCharOps    : ['===' , '                 !==', '==', '!=', '<=', '>=', '=>', '->', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=']
    }                   ,
    python              :        {
        lineComments    : ['#']  ,
        blockComments   : []     ,
        stringDelimiters: ['"'   , "'"]            ,
        alignChars      : ['='   , '               :', ','],
        multiCharOps    : ['=='  , '               !=', '<=', '>=']
    }                   ,
    php                 :        {
        lineComments    : ['//'  , '#']            ,
        blockComments   : [      { start           : '/*', end: '*/' }],
        stringDelimiters: ['"'   , "'"             , '`'],
        alignChars      : [':'   , '               {', '=', ',', '->'],
        multiCharOps    : ['===' , '                 !==', '==', '!=', '<=', '>=', '=>', '->', '<=>', '??']
    }
}
const FALLBACK          : LanguageConfig =         {
    lineComments        : ['//'] ,
    blockComments       : [      { start           : '/*', end: '*/' }],
    stringDelimiters    : ['"'   , "'"             , '`'],
    alignChars          : [':'   , '               {', '=', ','],
    multiCharOps        : ['===' , '                 !==', '==', '!=', '<=', '>=', '=>', '->']
}

function getLangConfig(lang: string): LanguageConfig {
    return DEFAULT_LANG[lang] ?? FALLBACK
}

// ============================================================================
// PURE: Split into blocks
// ============================================================================

function pure_SplitIntoBlocks(lines: string[]): Block[] {
    const blocks                   : Block[]  = []
    let currentBlock               : Block    = []

    for(const line of lines)                    {
        switch(line.trim().length               === 0)                   {
            case true                           : {
                switch(currentBlock.length > 0) {
                    case true                   : { blocks.push(currentBlock); currentBlock = [] }
                }
                break
            }
            case false                          : currentBlock.push(line)
        }
    }

    switch(currentBlock.length > 0) { case true: blocks.push(currentBlock) }

    return blocks
}

// ============================================================================
// PURE: Is inside string/comment
// ============================================================================

const enum Context { Default, InString, InLineComment, InBlockComment }

function pure_GetContext(
    line           : string,
    pos            : number,
    config         : LanguageConfig
)                  : Context {
    let context    = Context.Default
    let inString   = false
    let stringChar = ''
    let blockDepth = 0

    for(let i      = 0; i < pos; i++)     {
        const ch   = line[i]!
        const prev = i > 0 ? line[i - 1]! : ''

        switch(context)               {
            case Context.InLineComment: break

            case Context.InBlockComment: {
                if(ch                    === '*' && line[i + 1] === '/') {
                    context            = Context.Default
                    i++
                }
                break
            }

            case Context.InString: {
                if(prev            !== '\\' && ch === stringChar) {
                    context      = Context.Default
                }
                break
            }

            case Context.Default                             :                 {
                switch(true)                                 {
                    case prev                                                  === '\\': break
                    case inString                            : break
                    case config.lineComments.some(m          => line.startsWith(m, i)): {
                        context                              = Context.InLineComment
                        break
                    }
                    case config.blockComments.some(b         => line.startsWith(b.start, i)): {
                        context                              = Context.InBlockComment
                        break
                    }
                    case config.stringDelimiters.includes(ch):                 {
                        inString                             = true
                        stringChar                           = ch
                        context                              = Context.InString
                        break
                    }
                    case ch                                                    === '{' || ch === '[': blockDepth++; break
                    case ch                                                    === '}' || ch === ']': blockDepth--; break
                }
                break
            }
        }
    }

    return context
}

// ============================================================================
// PURE: Find all align points
// ============================================================================

function pure_FindAlignPoints(line: string            , config: LanguageConfig): AlignPoint[] {
    const results                 : AlignPoint[]      = []
    const sortedOps               = [...config.multiCharOps].sort((a, b) => b.length - a.length)

    for(const op of sortedOps)                 {
        let searchFrom                         = 0
        while(true)                            {
            const pos                          = line.indexOf(op, searchFrom)
            switch(pos)                        {
                case -1                        : break
                default                        :           {
                    switch(pure_GetContext(line, pos       , config)) {
                        case Context.Default   : results.push({ pos, op }); break
                    }
                    searchFrom                 = pos + op.length
                }
            }
            switch(pos)                        { case -1   : break; default: continue }
            break
        }
    }

    const brackets                                     = ['{'   , '[', '(']
    const closeBrackets                                = ['}'   , ']', ')']
    for(let i                                          = 0; i < line.length; i++) {
        switch(pure_GetContext(line                    , i      , config)) {
            case Context.Default                       :        {
                const ch                               = line[i]!
                switch(config.alignChars.includes(ch)) {
                    case true                          :        {
                        const notInTakenRange          = !results.some(r => i >= r.pos && i < r.pos + r.op.length)
                        switch(notInTakenRange)        {
                            case true                  : results.push({ pos: i, op: ch }); break
                        }
                        break
                    }
                }
                break
            }
        }
    }

    return results.sort((a, b) => a.pos - b.pos)
}

// ============================================================================
// PURE: Filter pure comments
// ============================================================================

function pure_FilterPureComments(lines           : string[], config: LanguageConfig): string[] {
    return lines.filter(line                     =>       {
        const trimmed                            = line.trim()
        for(const marker of config.lineComments) {
            switch(trimmed.startsWith(marker))   { case true: return false }
        }
        return true
    })
}

// ============================================================================
// PURE: Align block (universal algorithm)
// ============================================================================

function pure_AlignBlock(lines: string[], config: LanguageConfig): string[] {
    switch(lines.length)      {
        case 0                : return []
        case 1                : return [...lines]
    }

    const filtered         = pure_FilterPureComments(lines, config)
    switch(filtered.length                        === 0) { case true: return [...lines] }

    const allPoints = filtered.map(line => pure_FindAlignPoints(line, config))

    const maxSlot  = Math.max(...allPoints.map(p => p.length))
    switch(maxSlot                              === 0) { case true: return [...lines] }

    const slotPositions: number[][] = Array.from({ length: maxSlot }, () => [])

    for(const points of allPoints)             {
        for(let slot                           = 0; slot < maxSlot; slot++) {
            const p                            = points[slot]
            slotPositions[slot].push(p ? p.pos : -1)
        }
    }

    const alignedLines = filtered.map((line, lineIdx) => {
        const points   = allPoints[lineIdx]!
        let result     = line
        let offset     = 0

        for(let slot        = 0; slot < maxSlot; slot++)             {
            const slotMax   = Math.max(...slotPositions[slot].filter(p => p !== -1))
            const thisPoint = points[slot]

            switch(thisPoint)        {
                case undefined       : break
                default              : {
                    const targetPos  = slotMax
                    const currentPos = thisPoint.pos + offset

                    switch(currentPos < targetPos) {
                        case true                  : {
                            const spaces           = ' '.repeat(targetPos - currentPos)
                            result                 = result.slice(0, currentPos) + spaces + result.slice(currentPos)
                            offset += spaces.length
                            break
                        }
                    }
                    break
                }
            }
        }

        return result
    })

    return alignedLines
}

// ============================================================================
// PURE: Align all
// ============================================================================

function pure_AlignAll(lines: string[], config: LanguageConfig): string[] {
    const blocks            = pure_SplitIntoBlocks(lines)
    const result            : string[] = []

    for(let i                                    = 0; i < blocks.length; i++) {
        result.push(...pure_AlignBlock(blocks[i]!, config))
        switch(i < blocks.length - 1)            { case true: result.push('') }
    }

    return result
}

// ============================================================================
// EXPORTS (for testing)
// ============================================================================

export                     {
    pure_SplitIntoBlocks   ,
    pure_FindAlignPoints   ,
    pure_AlignBlock        ,
    pure_AlignAll          ,
    pure_FilterPureComments,
    LanguageConfig         ,
    AlignPoint
}

// ============================================================================
// EXTENSION
// ============================================================================

export function activate(ctx: vscode.ExtensionContext) {
    const outputChannel     = vscode.window.createOutputChannel('Better Align')

    const logToChannel = (msg: string) => {
        outputChannel.show()
        outputChannel.appendLine(msg)
    }

    const alignCommand                     = vscode.commands.registerTextEditorCommand(
        'vscode-better-align-columns.align',
        (editor                            : vscode.TextEditor) => {
            const doc                      = editor.document
            const selections               = editor.selections

            logToChannel('=== Align started ===')

            switch(selections.length) {
                case 0                : {
                    logToChannel('No selection found')
                    vscode.window.showInformationMessage('No selection found')
                    return
                }
            }

            for(const sel of selections) {
                const startLine          = sel.start.line
                const endLine            = sel.end.line
                const isEmpty            = sel.isEmpty || (startLine === endLine && sel.start.character === 0 && sel.end.character === doc.lineAt(endLine).text.length)

                switch(isEmpty)         {
                    case true           :                  {
                        const lineCount = doc.lineCount
                        const lines     : string[]         = []
                        for(let i       = 0; i < lineCount; i++) {
                            lines.push(doc.lineAt(i).text)
                        }

                        logToChannel(`Processing full document (${lines.length} lines)`)

                        const langId       = doc.languageId
                        const config       = getLangConfig(langId)
                        const alignedLines = pure_AlignAll(lines, config)

                        const eol  = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                        const text = alignedLines.join(eol)

                        editor.edit((editBuilder     : vscode.TextEditorEdit) => {
                            const range              = new vscode.Range(
                                0                    , 0                 ,
                                lineCount - 1        , doc.lineAt(lineCount - 1).text.length
                            )
                            editBuilder.replace(range, text)
                        }).then((success             : boolean)          => {
                            switch(success)          {
                                case true            :                   {
                                    logToChannel('=== Done (full doc) ===')
                                    vscode.window.showInformationMessage(
                                        `Aligned ${alignedLines.length} line(s) in full document`
                                    )
                                    break
                                }
                                case false           :                   {
                                    logToChannel('ERROR: Failed to write changes')
                                    vscode.window.showErrorMessage('Failed to write changes')
                                }
                            }
                        })
                        break
                    }
                    default                          :                   {
                        const lines                  : string[]          = []
                        for(let i                    = startLine; i      <= endLine; i++) {
                            lines.push(doc.lineAt(i).text)
                        }

                        logToChannel(`Processing ${lines.length} lines (${startLine}-${endLine})`)

                        const langId       = doc.languageId
                        const config       = getLangConfig(langId)
                        const alignedLines = pure_AlignAll(lines, config)

                        const eol  = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                        const text = alignedLines.join(eol)

                        logToChannel(`Aligned ${alignedLines.length} lines`)

                        editor.edit((editBuilder     : vscode.TextEditorEdit) => {
                            const range              = new vscode.Range(
                                startLine            , 0                 ,
                                endLine              , doc.lineAt(endLine).text.length
                            )
                            editBuilder.replace(range, text)
                        }).then((success             : boolean)          => {
                            switch(success)          {
                                case true            :                   {
                                    logToChannel('=== Done ===')
                                    vscode.window.showInformationMessage(
                                        `Aligned ${alignedLines.length} line(s)`
                                    )
                                    break
                                }
                                case false           :                   {
                                    logToChannel('ERROR: Failed to write changes')
                                    vscode.window.showErrorMessage('Failed to write changes')
                                }
                            }
                        })
                    }
                }
            }
        }
    )

    ctx.subscriptions.push(alignCommand, outputChannel)
}

export function deactivate() { }