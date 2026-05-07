import * as vscode from 'vscode'
import { Token, TokenType, LineInfo, LineRange } from './types'
import { tokenizeLine } from './tokenizer'
import { getLanguageSyntaxConfig } from './languageConfig'

const REG_WS = /\s/

export function whitespace(count: number): string {
    if(count <= 0) { return '' }
    if(!isFinite(count) || count > 1e6) { count = 1e6 }
    return ' '.repeat(count)
}

export class Formatter {
    public process(editor: vscode.TextEditor): void {
        this.editor = editor

        const ranges = this.getLineRanges(editor)

        let formatted: string[][] = []
        for(const range of ranges) {
            formatted.push(this.format(range))
        }

        editor.edit((editBuilder) => {
            for(let i = 0; i < ranges.length; ++i) {
                const infos    = ranges[i].infos
                const lastline = infos[infos.length - 1].line
                const location = new vscode.Range(infos[0].line.lineNumber, 0, lastline.lineNumber, lastline.text.length)
                const eol      = editor.document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
                const replaced = formatted[i].join(eol)
                if(editor.document.getText(location) === replaced) {
                    continue
                }
                editBuilder.replace(location, replaced)
            }
        })
    }

    protected editor: vscode.TextEditor

    protected getLineRanges(editor: vscode.TextEditor): LineRange[] {
        const ranges: LineRange[] = []
        editor.selections.forEach((sel) => {
            const indentBase        = this.getConfig().get('indentBase', 'firstline') as string
            const importantIndent = indentBase === 'dontchange'

            if(sel.isSingleLine) {
                ranges.push(this.narrow(0, editor.document.lineCount - 1, sel.active.line, importantIndent))
            } else {
                let   start = sel.start.line
                const end   = sel.end.line

                while(true) {
                    const res      = this.narrow(start, end, start, importantIndent)
                    const lastLine = res.infos[res.infos.length - 1]

                    if(lastLine.line.lineNumber > end) {
                        break
                    }

                    if(res.infos[0] && res.infos[0].sgfntTokenType !== TokenType.Invalid) {
                        ranges.push(res)
                    }

                    if(lastLine.line.lineNumber === end) {
                        break
                    }

                    start = lastLine.line.lineNumber + 1
                }
            }
        })
        return ranges
    }

    protected getConfig() {
        const defaultConfig = vscode.workspace.getConfiguration('betterAlign')
        let langConfig: any = null

        try {
            langConfig = vscode.workspace.getConfiguration().get(`[${this.editor.document.languageId}]`) as any
        } catch(e) { }

        return {
            get: (key: any, defaultValue?: any): any => {
                if(langConfig) {
                    const key1 = 'betterAlign.' + key
                    if(langConfig.hasOwnProperty(key1)) {
                        return langConfig[key1]
                    }
                }

                return defaultConfig.get(key, defaultValue)
            },
        }
    }

    protected getLanguageConfig() {
        const userLanguageConfigs = this.getConfig().get('languageConfigs', {}) as Record<string, any>
        return getLanguageSyntaxConfig(this.editor.document.languageId, userLanguageConfigs)
    }

    protected tokenize(line: number): LineInfo {
        const textLine = this.editor.document.lineAt(line)
        const config   = this.getLanguageConfig()
        const { tokens, sgfntTokens } = tokenizeLine(textLine, config, this.editor.document.languageId)

        return {
            line          : textLine,
            sgfntTokenType: TokenType.Invalid,
            sgfntTokens,
            tokens,
        }
    }

    protected hasPartialToken(info: LineInfo): boolean {
        for(let j = info.tokens.length - 1; j >= 0; --j) {
            const lastT = info.tokens[j]
            if(
                lastT.type === TokenType.PartialBlock ||
                lastT.type === TokenType.EndOfBlock ||
                lastT.type === TokenType.PartialString
            ) {
                return true
            }
        }
        return false
    }

    protected hasSameIndent(info1: LineInfo, info2: LineInfo): boolean {
        const t1 = info1.tokens[0]
        const t2 = info2.tokens[0]

        if(t1.type === TokenType.Whitespace) {
            if(t1.text === t2.text) {
                return true
            }
        } else if(t2.type !== TokenType.Whitespace) {
            return true
        }

        return false
    }

    protected arrayAnd(array1: TokenType[], array2: TokenType[]): TokenType[] {
        const res: TokenType[] = []
        const map: any = {}
        for(let i = 0; i < array1.length; ++i) {
            map[array1[i]] = true
        }
        for(let i = 0; i < array2.length; ++i) {
            if(map[array2[i]]) {
                res.push(array2[i])
            }
        }
        return res
    }

    protected narrow(start: number, end: number, anchor: number, importantIndent: boolean): LineRange {
        const anchorToken = this.tokenize(anchor)
        const range = { anchor, infos: [anchorToken] }

        let tokenTypes = anchorToken.sgfntTokens

        if(anchorToken.sgfntTokens.length === 0) {
            return range
        }

        if(this.hasPartialToken(anchorToken)) {
            return range
        }

        let i = anchor - 1
        while(i >= start) {
            const token = this.tokenize(i)

            if(this.hasPartialToken(token)) {
                break
            }

            const tt = this.arrayAnd(tokenTypes, token.sgfntTokens)
            if(tt.length === 0) {
                break
            }
            tokenTypes = tt

            if(importantIndent && !this.hasSameIndent(anchorToken, token)) {
                break
            }

            range.infos.unshift(token)
            --i
        }

        i = anchor + 1
        while(i <= end) {
            const token = this.tokenize(i)

            const tt = this.arrayAnd(tokenTypes, token.sgfntTokens)
            if(tt.length === 0) {
                break
            }
            tokenTypes = tt

            if(importantIndent && !this.hasSameIndent(anchorToken, token)) {
                break
            }

            if(this.hasPartialToken(token)) {
                range.infos.push(token)
                break
            }

            range.infos.push(token)
            ++i
        }

        let sgt: TokenType
        if(tokenTypes.indexOf(TokenType.Assignment) >= 0) {
            sgt = TokenType.Assignment
        } else {
            sgt = tokenTypes[0]
        }
        for(const info of range.infos) {
            info.sgfntTokenType = sgt
        }

        return range
    }

    protected format(range: LineRange): string[] {
        const onlyComments = range.infos.every(info => {
            const nonWhitespace = info.tokens.filter(t => t.type !== TokenType.Whitespace)
            return nonWhitespace.length === 1 && nonWhitespace[0].type === TokenType.Comment
        })
        if(onlyComments) {
            return range.infos.map(info => info.line.text)
        }

        let indentation = ''
        let anchorLine  = range.infos[0]
        const config    = this.getConfig()

        if((config.get('indentBase', 'firstline') as string) === 'activeline') {
            for(const info of range.infos) {
                if(info.line.lineNumber === range.anchor) {
                    anchorLine = info
                    break
                }
            }
        }
        if(!anchorLine.tokens.length) {
            return []
        }

        let firstNonSpaceCharIndex = 0
        let min                    = Infinity
        let whiteSpaceType         = ' '
        for(const info of range.infos) {
            firstNonSpaceCharIndex = info.line.text.search(/\S/)
            min                    = Math.min(min, firstNonSpaceCharIndex)
            if(info.tokens[0].type === TokenType.Whitespace) {
                whiteSpaceType = info.tokens[0].text[0] ?? ' '
                info.tokens.shift()
            }
            if(info.tokens.length > 1 && info.tokens[info.tokens.length - 1].type === TokenType.Whitespace) {
                info.tokens.pop()
            }
        }
        indentation = whiteSpaceType.repeat(min)

        let firstWordLength = 0
        for(const info of range.infos) {
            let count = 0
            for(const token of info.tokens) {
                if(token.type === info.sgfntTokenType) {
                    count = -count
                    break
                }
                if(token.type === TokenType.Block) {
                    continue
                }
                if(token.type !== TokenType.Whitespace) {
                    ++count
                }
            }

            if(count < -1) {
                firstWordLength = Math.max(firstWordLength, info.tokens[0].text.length)
            }
        }

        if(firstWordLength > 0) {
            const wordSpace: Token = {
                type: TokenType.Insertion,
                text: whitespace(firstWordLength + 1),
            }
            const oneSpace: Token = { type: TokenType.Insertion, text: ' ' }

            for(const info of range.infos) {
                let count = 0
                for(const token of info.tokens) {
                    if(token.type === info.sgfntTokenType) {
                        count = -count
                        break
                    }
                    if(token.type !== TokenType.Whitespace) {
                        ++count
                    }
                }

                if(count === -1) {
                    info.tokens.unshift(wordSpace)
                } else if(count < -1) {
                    if(info.tokens[1].type === TokenType.Whitespace) {
                        info.tokens[1] = oneSpace
                    } else if(info.tokens[0].type === TokenType.CommaAsWord) {
                        info.tokens.splice(1, 0, oneSpace)
                    }
                    if(info.tokens[0].text.length !== firstWordLength) {
                        const ws: Token = {
                            type: TokenType.Insertion,
                            text: whitespace(firstWordLength - info.tokens[0].text.length),
                        }
                        if(info.tokens[0].type === TokenType.CommaAsWord) {
                            info.tokens.unshift(ws)
                        } else {
                            info.tokens.splice(1, 0, ws)
                        }
                    }
                }
            }
        }

        for(const info of range.infos) {
            let i = 1
            while(i < info.tokens.length) {
                if(info.tokens[i].type === info.sgfntTokenType || info.tokens[i].type === TokenType.Comma) {
                    if(info.tokens[i - 1].type === TokenType.Whitespace) {
                        info.tokens.splice(i - 1, 1)
                        --i
                    }
                    if(info.tokens[i + 1] && info.tokens[i + 1].type === TokenType.Whitespace) {
                        info.tokens.splice(i + 1, 1)
                    }
                }
                ++i
            }
        }

        const configOP       = config.get('operatorPadding') as string
        const configWS       = config.get('surroundSpace')
        const stt            = TokenType[range.infos[0].sgfntTokenType].toLowerCase()
        const configDef: any = {
            colon     : [0, 1],
            assignment: [1, 1],
            comment: 2,
            arrow  : [1, 1],
            from      : [1, 1],
        }
        const configSTT     = configWS[stt] || configDef[stt]
        const configComment = configWS['comment'] || configDef['comment']

        const rangeSize = range.infos.length

        const column: number[] = new Array(rangeSize).fill(0)
        const result: string[]  = new Array(rangeSize).fill(indentation)

        let exceed     = 0
        let resultSize = 0

        while(exceed < rangeSize) {
            let operatorSize = 0

            for(let l = 0; l < rangeSize; ++l) {
                let i         = column[l]
                const info    = range.infos[l]
                const tokenSize = info.tokens.length

                if(i === -1) {
                    continue
                }

                let end = tokenSize
                let res = result[l]

                if(tokenSize > 1 && info.tokens[tokenSize - 1].type === TokenType.Comment) {
                    if(tokenSize > 2 && info.tokens[tokenSize - 2].type === TokenType.Whitespace) {
                        end = tokenSize - 2
                    } else {
                        end = tokenSize - 1
                    }
                }

                for(; i < end; ++i) {
                    const token = info.tokens[i]
                    if(token.type === info.sgfntTokenType || (token.type === TokenType.Comma && i !== 0)) {
                        operatorSize = Math.max(operatorSize, token.text.length)
                        resultSize = Math.max(resultSize, res.length)
                        break
                    } else {
                        res += token.text
                    }
                }

                result[l] = res

                if(i === end) {
                    ++exceed
                    column[l] = -1
                    info.tokens.splice(0, end)
                } else {
                    column[l] = i
                }
            }

            for(let l = 0; l < rangeSize; ++l) {
                let i = column[l]
                if(i === -1) {
                    continue
                }

                const info = range.infos[l]
                let res   = result[l]

                let op = info.tokens[i].text
                if(op.length < operatorSize) {
                    if(configOP === 'right') {
                        op = whitespace(operatorSize - op.length) + op
                    } else {
                        op = op + whitespace(operatorSize - op.length)
                    }
                }

                let padding = ''
                if(resultSize > res.length) {
                    padding = whitespace(resultSize - res.length)
                }

                if(info.tokens[i].type === TokenType.Comma) {
                    res += op
                    if(i < info.tokens.length - 1) {
                        res += padding + ' '
                    }
                } else if(info.tokens.length === 1 && info.tokens[0].type === TokenType.Comment) {
                    exceed++
                    break
                } else {
                    if(configSTT[0] < 0) {
                        if(configSTT[1] < 0) {
                            let z = res.length - 1
                            while(z >= 0) {
                                const ch = res.charAt(z)
                                if(ch.match(REG_WS)) {
                                    break
                                }
                                --z
                            }
                            res = res.substring(0, z + 1) + padding + res.substring(z + 1) + op
                        } else {
                            res = res + op
                            if(i < info.tokens.length - 1) {
                                res += padding
                            }
                        }
                    } else {
                        res = res + padding + whitespace(configSTT[0]) + op
                    }
                    if(configSTT[1] > 0) {
                        res += whitespace(configSTT[1])
                    }
                }

                result[l] = res
                column[l] = i + 1
            }
        }

        if(configComment < 0) {
            for(let l = 0; l < rangeSize; ++l) {
                const info = range.infos[l]
                for(const token of info.tokens) {
                    result[l] += token.text
                }
            }
        } else {
            resultSize = 0
            for(const res of result) {
                resultSize = Math.max(res.length, resultSize)
            }
            for(let l = 0; l < rangeSize; ++l) {
                const info = range.infos[l]
                if(info.tokens.length) {
                    const res = result[l]
                    result[l] = res + whitespace(resultSize - res.length + configComment) + info.tokens.pop()?.text
                }
            }
        }

        return result
    }
}
