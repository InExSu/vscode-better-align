'use strict'
import * as vscode from 'vscode'
import { alignAll, LanguageConfig } from './align/align'

const enum LogLevel { Info, Warn, Error }

const DEFAULT_LANG: Record<string, LanguageConfig> = {
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
        blockComments: [],
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
const FALLBACK: LanguageConfig = {
    lineComments: ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars: [':', '{', '=', ','],
    multiCharOps: ['===', '!==', '==', '!=', '<=', '>=', '=>', '->']
}

const getLangConfig = (lang: string): LanguageConfig =>
    DEFAULT_LANG[lang] ?? FALLBACK

const getAlignChars = (lang: string): string[] => {
    const config = getLangConfig(lang)
    return config.alignChars
}

const getMultiCharOps = (lang: string): string[] => {
    const config = getLangConfig(lang)
    return config.multiCharOps
}

const log = (msg: string, level: LogLevel = LogLevel.Info) => {
    switch(level) {
        case LogLevel.Error: console.error(msg); break
        case LogLevel.Warn: console.warn(msg); break
        default: console.log(msg)
    }
}

export function activate(ctx: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Better Align')

    const logToChannel = (msg: string) => {
        outputChannel.show()
        outputChannel.appendLine(msg)
    }

    const alignCommand = vscode.commands.registerTextEditorCommand(
        'vscode-better-align-columns.align',
        (editor: vscode.TextEditor) => {
            const doc = editor.document
            const selections = editor.selections

            logToChannel('=== Align started ===')

            switch(selections.length) {
                case 0: {
                    logToChannel('No selection found')
                    vscode.window.showInformationMessage('No selection found')
                    return
                }
            }

            for(const sel of selections) {
                const startLine = sel.start.line
                const endLine = sel.end.line

                switch(startLine === endLine && sel.isEmpty) {
                    case true: {
                        const lineCount = doc.lineCount
                        for(let i = 0; i < lineCount; i++) {
                            const line = doc.lineAt(i)
                            logToChannel(`Line ${i}: ${line.text}`)
                        }
                        break
                    }
                    default: {
                        const lines: string[] = []
                        for(let i = startLine; i <= endLine; i++) {
                            const line = doc.lineAt(i)
                            lines.push(line.text)
                        }

                        logToChannel(`Processing ${lines.length} lines (${startLine}-${endLine})`)

                        const langId = doc.languageId
                        const config: LanguageConfig = {
                            lineComments: getLangConfig(langId).lineComments,
                            blockComments: getLangConfig(langId).blockComments,
                            stringDelimiters: getLangConfig(langId).stringDelimiters,
                            alignChars: getAlignChars(langId),
                            multiCharOps: getMultiCharOps(langId)
                        }

                        const alignedLines = alignAll(lines, config)

                        const eol = doc.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                        const text = alignedLines.join(eol)

                        logToChannel(`Aligned ${alignedLines.length} lines`)

                        editor.edit((editBuilder: vscode.TextEditorEdit) => {
                            const range = new vscode.Range(
                                startLine, 0,
                                endLine, doc.lineAt(endLine).text.length
                            )
                            editBuilder.replace(range, text)
                        }).then((success: boolean) => {
                            switch(success) {
                                case true: {
                                    logToChannel('=== Done ===')
                                    vscode.window.showInformationMessage(
                                        `Aligned ${alignedLines.length} line(s)`
                                    )
                                    break
                                }
                                case false: {
                                    logToChannel('ERROR: Failed to write changes')
                                    vscode.window.showErrorMessage('Failed to write changes')
                                    break
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
