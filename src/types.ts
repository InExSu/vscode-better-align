import * as vscode from 'vscode'

export enum TokenType {
    Invalid       = 'Invalid',
    Word          = 'Word',
    Assignment    = 'Assignment',
    Arrow         = 'Arrow',
    Block         = 'Block',
    PartialBlock  = 'PartialBlock',
    EndOfBlock    = 'EndOfBlock',
    String        = 'String',
    PartialString = 'PartialString',
    Comment       = 'Comment',
    Whitespace    = 'Whitespace',
    Colon         = 'Colon',
    Comma         = 'Comma',
    CommaAsWord   = 'CommaAsWord',
    Insertion     = 'Insertion',
    Spaceship     = 'Spaceship',
    PHPShortEcho  = 'PHPShortEcho',
    From          = 'From',
}

export interface Token {
    type: TokenType
    text: string
}

export interface BlockComment {
    start: string
    end  : string
}

export interface LanguageSyntaxConfig {
    lineComments : string[]
    blockComments: BlockComment[]
}

export interface LineInfo {
    line          : vscode.TextLine | number
    sgfntTokenType: TokenType
    sgfntTokens   : TokenType[]
    tokens        : Token[]
}

export interface LineRange {
    anchor: number
    infos : LineInfo[]
}
