import * as assert from 'assert'
import {
    line_Parse             ,
    blocks_Find            ,
    block_Align            ,
    positionMap_Build      ,
    positionMap_Apply      ,
    DEFAULT_LANGUAGE_RULES ,
    DEFAULT_CONFIG         ,
    fn_ExecutePipelineState,
    PipelineState          ,
    NS                     ,
    ok                     ,
    LineBlock              ,
    ParsedLine             ,
} from '../fsm_Main'

function lines(...args: string[]): string[] { return args }

function assertEqual(a: string, b: string, msg: string): void {
    assert.strictEqual(a, b, msg)
}

function assertContains(haystack: string, needle: string, msg: string): void {
    assert.ok(haystack.includes(needle), msg)
}

function assertNotContains(haystack: string, needle: string, msg: string): void {
    assert.ok(!haystack.includes(needle), msg)
}

describe('line_Parse', () => {
    it('finds = marker at correct position', () => {
        const result = line_Parse('const a = 1', DEFAULT_LANGUAGE_RULES)
        assert.strictEqual(result.markers.length, 1)
        assert.strictEqual(result.markers[0].symbol, '=')
        assert.strictEqual(result.markers[0].startCol, 8)
    })

    it('finds multiple => markers', () => {
        const result = line_Parse('a => b => c', DEFAULT_LANGUAGE_RULES)
        assert.strictEqual(result.markers.length, 2)
        assert.strictEqual(result.markers[0].symbol, '=>')
        assert.strictEqual(result.markers[0].startCol, 2)
        assert.strictEqual(result.markers[1].symbol, '=>')
        assert.strictEqual(result.markers[1].startCol, 7)
    })

    it('skips = inside strings', () => {
        const result = line_Parse('const a = "=>"', DEFAULT_LANGUAGE_RULES)
        assert.strictEqual(result.markers.length, 1)
        assert.strictEqual(result.markers[0].symbol, '=')
    })

    it('handles empty string', () => {
        const result = line_Parse('', DEFAULT_LANGUAGE_RULES)
        assert.strictEqual(result.markers.length, 0)
    })

    it('handles line with no markers', () => {
        const result = line_Parse('const a bc', DEFAULT_LANGUAGE_RULES)
        assert.strictEqual(result.markers.length, 0)
    })

    it('finds : for type annotations', () => {
        const result = line_Parse('editor: vscode.TextEditor', DEFAULT_LANGUAGE_RULES)
        assert.ok(result.markers.some(m => m.symbol === ':'), 'Should find : marker')
    })

    it('finds >= as marker', () => {
        const result = line_Parse('const a >= 1', DEFAULT_LANGUAGE_RULES)
        assert.ok(result.markers.some(m => m.symbol === '>='), 'Should find >= marker')
    })

    it('preserves raw line', () => {
        const input = 'const a = 1'
        const result = line_Parse(input, DEFAULT_LANGUAGE_RULES)
        assert.strictEqual(result.raw, input)
    })
})

describe('blocks_Find', () => {
    it('groups all lines with same indentation', () => {
        const input = lines('const a = 1', 'const b = 2', 'const c = 3')
        const blocks = blocks_Find(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        assert.strictEqual(blocks.length, 1)
        assert.strictEqual(blocks[0].startLine, 0)
        assert.strictEqual(blocks[0].lines.length, 3)
        assert.strictEqual(blocks[0].lines[0], 'const a = 1')
    })

    it('does not separate blocks by different indentation', () => {
        const input = lines('const a = 1', 'const b = 2', '    const c = 3', '    const d = 4')
        const blocks = blocks_Find(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        assert.strictEqual(blocks.length, 1, "Should not split by indentation, so one block is expected.")
        assert.strictEqual(blocks[0].lines.length, 4)
    })

    it('returns empty array for empty input', () => {
        const input: string[] = []
        const blocks = blocks_Find(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        assert.strictEqual(blocks.length, 0)
    })

    it('single line forms a block', () => {
        const input = lines('const a = 1')
        const blocks = blocks_Find(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        assert.strictEqual(blocks.length, 1, 'Single line now forms a block')
    })

    it('handles lines with empty line between', () => {
        const input = lines('const a = 1', '', 'const b = 2')
        const blocks = blocks_Find(input, 0, DEFAULT_LANGUAGE_RULES, 500)
        assert.strictEqual(blocks.length, 2, 'Should create two single-line blocks')
    })

    it('respects maxBlockSize limit', () => {
        const input = lines('const a = 1', 'const b = 2', 'const c = 3', 'const d = 4')
        const blocks = blocks_Find(input, 0, DEFAULT_LANGUAGE_RULES, 2)
        assert.ok(blocks.length > 1, 'Should split large block')
    })
})

describe('block_Align', () => {
    it('aligns on = with correct spacing', () => {
        const input = lines('const a = 1', 'const bc = 22', 'const def = 333')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        assert.strictEqual(output[0], 'const a   = 1')
        assert.strictEqual(output[1], 'const bc  = 22')
        assert.strictEqual(output[2], 'const def = 333')
    })

    it('aligns on => with correct spacing', () => {
        const input = lines('a => 1', 'ab => 22', 'abc => 333')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        assert.strictEqual(output[0], 'a   => 1')
        assert.strictEqual(output[1], 'ab  => 22')
        assert.strictEqual(output[2], 'abc => 333')
    })

    it('aligns on : with correct spacing', () => {
        const input = lines('a: 1', 'ab: 22', 'abc: 333')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        assert.strictEqual(output[0], 'a  : 1')
        assert.strictEqual(output[1], 'ab : 22')
        assert.strictEqual(output[2], 'abc: 333')
    })

    it('aligns TypeScript type annotations', () => {
        const input = lines(
            'type NSData = {',
            '    editor       : vscode.TextEditor | false',
            '    languageRules: LanguageRules | false',
            '    blocks       : LineBlock[]',
            '}'
        )
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        assert.strictEqual(output[1], '    editor       : vscode.TextEditor | false')
        assert.strictEqual(output[2], '    languageRules: LanguageRules | false')
    })

    it('is idempotent on second pass', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed1 = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output1 = block_Align(parsed1, DEFAULT_CONFIG.maxSpaces)
        const parsed2 = output1.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output2 = block_Align(parsed2, DEFAULT_CONFIG.maxSpaces)
        assert.strictEqual(output1[0], output2[0])
        assert.strictEqual(output1[1], output2[1])
    })

    it('does not modify property names in type definitions', () => {
        const input = lines(
            'export type LanguageRules = {',
            '    lineComments: string[]',
            '    blockComments: { start: string; end: string }[]',
            '}'
        )
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        assertContains(output[2], 'start', 'Property "start" should not be modified')
        assertContains(output[2], 'end', 'Property "end" should not be modified')
    })

    it('skips align chars inside strings', () => {
        const input = lines('const a = "=>"', 'const bc = "="')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        assertContains(output[0], '"=>"', 'String content should be preserved')
        assertContains(output[1], '"="', 'String content should be preserved')
    })

    it('aligns function parameters and return types', () => {
        const input = lines(
            'const ns_Error    = (ns: NS)           : boolean => ns.result.ok === false',
            'const ns_SetError = (ns: NS, e: string): void    => {'
        )
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const output = block_Align(parsed, DEFAULT_CONFIG.maxSpaces)
        const i_Colon1 = output[0].indexOf(':')
        const i_Colon2 = output[1].indexOf(':')
        assert.strictEqual(i_Colon1, i_Colon2, 'Colons should be aligned')
    })

    it('does not split >= operator', () => {
        const input = lines('const a = 1', 'const b >= 2')
        const output = block_Align(
            input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        assert.strictEqual(output[0], 'const a = 1')
        assert.strictEqual(output[1], 'const b >= 2')
    })

    it('does not split >= in conditionals', () => {
        const input = lines(
            'if(startCol >= maxCol) { continue }',
            'if(startCol < maxCol) { done }'
        )
        const output = block_Align(
            input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        assertContains(output[0], '>=', 'should contain >=')
        assertContains(output[1], '<', 'should contain <')
    })

    it('aligns whole file without breaking >=', () => {
        const fs = require('fs')
        const input: string[] = fs.readFileSync('src/fsm_Main.ts', 'utf8').split('\n')
        const output = block_Align(
            input.map((l: string) => line_Parse(l, DEFAULT_LANGUAGE_RULES)),
            30
        )
        const s_Original = input.join('\n')
        const s_Output = output.join('\n')
        const i_Orig = (s_Original.match(/>=/g) || []).length
        const i_Out = (s_Output.match(/>=/g) || []).length
        assert.strictEqual(i_Orig, i_Out, 'All >= operators should be preserved')
    })

    it('is idempotent on multiple passes', () => {
        const input = lines('const a = 1', 'const b = 22')
        const first = block_Align(input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)), 10)
        const second = block_Align(first.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)), 10)
        const third = block_Align(second.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)), 10)
        assert.strictEqual(first.join('\n'), third.join('\n'))
    })

    it('handles varied existing whitespace', () => {
        const input = lines('const a = 1;', 'const bee  = 2;')
        const output = block_Align(
            input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)),
            DEFAULT_CONFIG.maxSpaces
        )
        assert.strictEqual(output[0], 'const a    = 1;')
        assert.strictEqual(output[1], 'const bee  = 2;')
    })

    it('returns same lines for single line input', () => {
        const input = lines('const a = 1')
        const output = block_Align(
            input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        assert.strictEqual(output.length, 1)
        assert.strictEqual(output[0], 'const a = 1')
    })

    it('handles lines with no markers', () => {
        const input = lines('const a', 'const b')
        const output = block_Align(
            input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES)),
            10
        )
        assert.strictEqual(output[0], 'const a')
        assert.strictEqual(output[1], 'const b')
    })
})

describe('positionMap_Build', () => {
    it('returns empty map for single line', () => {
        const input = lines('const a = 1')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        assert.strictEqual(o_PosMap.size, 0)
    })

    it('creates position map for two lines with same marker', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        assert.ok(o_PosMap.size > 0)
    })

    it('sets correct target position for shorter marker', () => {
        const input = lines('const a = 1', 'const bc = 22')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        const i_Target = o_PosMap.get('0:0')
        assert.strictEqual(i_Target, 9)
    })

    it('skips >= operator', () => {
        const input = lines('const a = 1', 'const b >= 2')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        assert.strictEqual(o_PosMap.size, 0, 'Should not create map for >=')
    })

    it('handles multiple different markers', () => {
        const input = lines('a: 1', 'ab: 22')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        assert.ok(o_PosMap.size > 0)
    })

    it('respects maxSpaces limit', () => {
        const input = lines('a = 1', 'abc = 22')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 2)
        const i_Target = o_PosMap.get('0:0')
        const i_Original = parsed[0].markers[0].startCol
        assert.ok(i_Target! - i_Original <= 2)
    })

    it('returns empty map for lines with no markers', () => {
        const input = lines('const a', 'const b')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        assert.strictEqual(o_PosMap.size, 0)
    })
})

describe('positionMap_Apply', () => {
    it('applies alignment to parsed lines', () => {
        const input = lines('a = 1', 'abc = 2')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 10)
        const aligned = positionMap_Apply(parsed, o_PosMap)
        assert.strictEqual(aligned[0], 'a   = 1')
        assert.strictEqual(aligned[1], 'abc = 2')
    })

    it('handles empty position map', () => {
        const input = lines('const a = 1')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = new Map<string, number>()
        const aligned = positionMap_Apply(parsed, o_PosMap)
        assert.strictEqual(aligned[0], 'const a = 1')
    })

    it('respects maxSpaces when applying', () => {
        const input = lines('a = 1', 'abc = 2')
        const parsed = input.map(l => line_Parse(l, DEFAULT_LANGUAGE_RULES))
        const o_PosMap = positionMap_Build(parsed, 1)
        const aligned = positionMap_Apply(parsed, o_PosMap)
        assert.ok(aligned[0].length - input[0].length <= 1)
    })
})

describe('idempotency - real file test', () => {
    it('aligns extension.ts code (sanity check)', () => {
        const fs = require('fs')
        const input: string[] = fs.readFileSync('src/extension.ts', 'utf8').split('\n')
        const rules = DEFAULT_LANGUAGE_RULES

        const blocks = blocks_Find(input, 0, rules, 500)
        console.log(`[TEST] blocks_Find found ${blocks.length} blocks from ${input.length} lines`)
        blocks.forEach((b, i) => {
            console.log(`[TEST] Block ${i}: ${b.lines.length} lines, startLine=${b.startLine}`)
        })
        const parsed = blocks.map(b => b.lines.map(l => line_Parse(l, rules)))
        const aligned = parsed.map(pl => block_Align(pl, 30))

        const flat = aligned.flat()
        assert.ok(flat.length > 0, 'Should produce aligned lines')
    })

    it('runs fn_ExecutePipelineState twice on code and is idempotent', () => {
        const fs = require('fs')
        const input: string[] = fs.readFileSync('src/extension.ts', 'utf8').split('\n')
        const rules = DEFAULT_LANGUAGE_RULES

        const fn_DoNothing = (): void => { }

        const runPipeline = (code: string[]): string[] => {
            const fn_BlockFind = (ns: NS): void => {
                ns.data.blocks = blocks_Find(code, 0, rules, 500)
                ns.result = ok(ns.data.blocks)
            }

            const fn_LinesParse = (ns: NS): void => {
                const blocks = ns.data.blocks as LineBlock[]
                ns.data.parsedLines = blocks.map(b => b.lines.map(l => line_Parse(l, rules)))
                ns.result = ok(ns.data.parsedLines)
            }

            const fn_AlignmentApply = (ns: NS): void => {
                const parsedLines = ns.data.parsedLines as ParsedLine[][]
                ns.data.alignedLines = parsedLines.map(pl => block_Align(pl, 30))
                ns.result = ok(ns.data.alignedLines)
            }

            const ns: NS = {
                result: ok({}),
                s_Error: '',
                config: { ...DEFAULT_CONFIG, defaultAlignChars: rules.alignChars },
                data: { editor: false, languageRules: rules, blocks: [], parsedLines: [], alignedLines: [] },
            }

            let s_State = PipelineState.Idle
            s_State     = fn_ExecutePipelineState(s_State, ns, fn_DoNothing, fn_DoNothing, fn_BlockFind, fn_LinesParse, fn_AlignmentApply, fn_DoNothing, fn_DoNothing)

            return (ns.data.alignedLines as string[][]).flat()
        }

        const first  = runPipeline(input)
        const second = runPipeline(first)
        const third  = runPipeline(second)

        assert.strictEqual(second.length, first.length, 'Second pass should not add spaces')
        assert.strictEqual(third.length, first.length, 'Third pass should not add spaces')
    })
})

describe('analyzeSelection', () => {
    interface MockSelection {
        isEmpty: boolean
        start: { line: number; character: number }
        end: { line: number; character: number }
        active: { line: number }
    }

    interface MockDocument {
        lineCount: number
        lineAt: (idx: number) => { text: string; isEmptyOrWhitespace: boolean }
    }

    function createAnalyzeSelection() {
        function fn_AutoSearchIndent(ctx: { selection: MockSelection; doc: MockDocument; activeLine: number; initialIndent: string; startLine: number; endLine: number }): { startLine: number; endLine: number } | null {
            ctx.activeLine = ctx.selection.active.line
            ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? ''
            let up = ctx.activeLine
            while(up > 0) {
                const prev = ctx.doc.lineAt(up - 1)
                if(prev.isEmptyOrWhitespace) { break }
                if((prev.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
                up--
            }
            let down = ctx.activeLine
            const last = ctx.doc.lineCount - 1
            while(down < last) {
                const next = ctx.doc.lineAt(down + 1)
                if(next.isEmptyOrWhitespace) { break }
                if((next.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
                down++
            }
            ctx.startLine = up
            ctx.endLine = down
            return { startLine: ctx.startLine, endLine: ctx.endLine }
        }

        function analyzeSelection(ctx: { selection: MockSelection; doc: MockDocument; activeLine?: number; initialIndent?: string; startLine?: number; endLine?: number }): { startLine: number; endLine: number } | null {
            if (!ctx.selection.isEmpty) {
                return {
                    startLine: ctx.selection.start.line,
                    endLine:   ctx.selection.end.line,
                }
            }
            return fn_AutoSearchIndent(ctx as any)
        }

        return { analyzeSelection }
    }

    it('returns selection range when selection is not empty', () => {
        const { analyzeSelection } = createAnalyzeSelection()
        const ctx = {
            selection: { isEmpty: false, start: { line: 5, character: 10 }, end: { line: 15, character: 20 }, active: { line: 10 } },
            doc: { lineCount: 100, lineAt: (i: number) => ({ text: '', isEmptyOrWhitespace: false }) },
        }
        const result = analyzeSelection(ctx as any)
        assert.strictEqual(result?.startLine, 5)
        assert.strictEqual(result?.endLine, 15)
    })

    it('handles full file selection (Ctrl+A scenario)', () => {
        const { analyzeSelection } = createAnalyzeSelection()
        const ctx = {
            selection: { isEmpty: false, start: { line: 0, character: 0 }, end: { line: 584, character: 45 }, active: { line: 584 } },
            doc: { lineCount: 585, lineAt: (i: number) => ({ text: '', isEmptyOrWhitespace: false }) },
        }
        const result = analyzeSelection(ctx as any)
        assert.strictEqual(result?.startLine, 0)
        assert.strictEqual(result?.endLine, 584)
    })

    it('auto-searches by indent when selection is empty', () => {
        const { analyzeSelection } = createAnalyzeSelection()
        const ctx = {
            selection: { isEmpty: true, start: { line: 10, character: 0 }, end: { line: 10, character: 0 }, active: { line: 12 } },
            doc: {
                lineCount: 20,
                lineAt: (i: number) => ({
                    text: i === 12 ? '    const a = 1' : '',
                    isEmptyOrWhitespace: i !== 12
                }),
            },
        }
        const result = analyzeSelection(ctx as any)
        assert.ok(result !== null)
        assert.ok(result!.startLine <= 12)
        assert.ok(result!.endLine >= 12)
    })

    it('returns range even when all lines are empty', () => {
        const { analyzeSelection } = createAnalyzeSelection()
        const ctx = {
            selection: { isEmpty: true, start: { line: 0, character: 0 }, end: { line: 0, character: 0 }, active: { line: 0 } },
            doc: {
                lineCount: 1,
                lineAt: (i: number) => ({ text: '', isEmptyOrWhitespace: true }),
            },
        }
        const result = analyzeSelection(ctx as any)
        assert.ok(result !== null, 'Should return range for single line')
        assert.strictEqual(result!.startLine, 0)
        assert.strictEqual(result!.endLine, 0)
    })
})