# v6.16.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.16.6)

- fix: Filter out `{` in object literals to prevent misalignment when selecting code with `Alt+A`
- refactor: Use switch in `map_BuildRaw` for filtering tokens, cleaner than nested ifs

# v6.16.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.16.5)

- fix: Filter out `:` in TypeScript function return types to prevent misaligned `:` in return statements

# v6.16.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.16.4)

- fix: Remove `"type": "module"` from package.json to fix `ReferenceError: require is not defined` — Alt+A now works
- chore: Rename webpack configs `.cjs` → `.js`, update ignore/scripts

# v6.16.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.16.3)

- fix: Cmd+A (full file selection) now passes whole document to block finder instead of cursor-indent-based subset

# v6.16.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.16.2)

- fix: `map_Normalize` no longer skips columns with mixed alignment characters — picks dominant char instead, fixes `=` alignment when `{` is in same block
- test: Simplified test suite to single integration test with blank-line preservation
- chore: Moved tests from `src/test/` to `test/`

# v6.15.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.15.0)

- fix: Full file selection (Cmd+A) now properly aligns code by using standard block splitting
- refactor: Removed custom grouping logic that caused incorrect alignment with multiple indentation levels

- refactor: Improve alignment logic robustness based on user feedback. The `lines_Align` function now uses a pre-calculated token map (`a_RawMap`) instead of re-parsing lines, which prevents inconsistencies and ensures idempotent behavior.
- chore: Thanks to the user for reporting the issue and providing a test case.

# v6.13.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.13.0)

- test: Fix idempotency test to use all lines as one block

# v6.12.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.12.0)

- fix: Fix full file selection detection - check line position, not just line number

# v6.11.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.11.0)

- fix: When user selects code, split into blocks by indentation and align each block separately

# v6.10.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.10.0)

- feat: When user selects code, align all selected lines as one block regardless of indentation

# v6.9.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.9.0)

- refactor: Rewrite fsm_Main.ts per AI Prompt_This.md
- refactor: Add a_FSM_Main main FSM with states block_Find → lines_Sanitize → chars_Scan → map_Normalize → lines_Align → result_Emit
- refactor: Add pure functions: lines_Sanitize, chars_FindGreedy, map_BuildRaw, map_Normalize, lines_Align

# v6.8.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.8.0)

- refactor: Export fn_ExecutePipelineState for direct testing
- test: Add idempotency test using fn_ExecutePipelineState directly

# v6.7.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.7.0)

- test: Add full pipeline idempotency test (blocks_Find → line_Parse → block_Align)

# v6.6.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.6.1)

- fix: Improve idempotency - repeated alignments no longer add unnecessary spaces
- fix: Use actual content length before marker for padding calculation
- refactor: Updated tests with better assertions and edge cases

# v6.6.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.6.0)

- refactor: Apply noun_Verb naming and Hungarian notation to functions and variables
- refactor: Extract case logic into SRP functions in ScannerState.CodeReading
- refactor: Add exhaustive switch checking with fn_Unreachable
- refactor: Extract GroupingBlocks logic into separate SRP functions
- refactor: Convert buildPairwisePositionMap to FSM with SRP
- refactor: Extract pipeline state execution to fn_ExecutePipelineState
- tests: Add comprehensive tests for buildPairwisePositionMap
- docs: Update FSM documentation with mermaid diagrams

# v6.5.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.5.0)

- feat: Second automated release cycle

# v6.4.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.4.0)

- Initial implementation of automated release flow, adhering to AGENTS.md guidelines.

# v6.3.8 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.8)

- Обновлены скрипты и документация конечного автомата

# v6.3.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.7)

- Добавлена диаграмма состояний FSM

# v6.3.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.6)

- Test: Idempotency - repeated alignments don't add spaces

# v6.3.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.5)

- Fix: >= detection handles already-aligned code correctly

# v6.3.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.4)

- Fix: >= operator properly kept together, not split into > and =

# v6.3.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.3)

- Fix: >= in code like `startCol >= maxCol` kept as-is

# v6.3.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.2)

- Fix: >= operator no longer split into > and =

# v6.3.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.1)

- Fix: Improved nesting depth tracking for generic type parameters and objects

# v6.3.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.3.0)

- Fix: Generic type parameters (`<T>`) are now excluded from alignment markers

# v6.2.9 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.9)

- Fix: Alignment characters inside nested objects/arrays are now ignored, only top-level alignment occurs.

# v6.0.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.7)

- Fix: Improved alignment logic to correctly handle blocks with lines that do not contain alignment markers.

# v6.0.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.6)

- Fix: Correctly handle compound assignment operators (e.g., `+=`, `-=`) to prevent them from being split during alignment.

# v6.0.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.5)

- Fix: "command not found" error by correcting the command name in the extension's activation logic.

# v6.0.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.4)

- Fix: "command not found" error by correcting the command name in the extension's activation logic.

# v6.0.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.3)

- Bug fixes and improvements

# v6.0.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.2)

- Fix: Refactored code to improve readability and maintainability.
- Fix: Several bugs in the parsing and alignment logic.
- Fix: Improved the FSM for parsing lines.

# v6.0.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.1)

- Fix: undefined vs null TypeScript error in editor_Get

# v6.0.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.0.0)

- Refactor: Complete rewrite following AI Prompt_General.md architecture
- Add: FSM-based state machines with noun_Verb naming
- Add: Result type pattern with ok/err
- Add: Railway programming with rwd/a_Chain
- Fix: Alignment skips content inside strings

# v5.0.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v5.0.0)

- Add: Universal position-based alignment - aligns any delimiter count per line without prefix matching
- Add: Slot-based algorithm groups delimiters by index and aligns to max position
- Fix: Comma alignment in arrays with different element counts
- Fix: Compound assignment operators (+=, -=, etc.) no longer split during alignment
- Add: Compound operators (+=, -=, *=, /=, %=, etc.) added to multiCharOps list

# v4.0.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v4.0.5)

- Add: Depth-based comma alignment - only align commas at the same nesting depth
- Add: `pure_CountNestingAt` tracks bracket depth when scanning align points

# v4.0.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v4.0.4)

- Fix: Do not break multi-char operators (<=, >=, ===, etc.) during alignment
- Add: `pure_GetMultiCharOperatorPositions` marks all positions of multi-char operators as taken
- Add: `pure_IsMultiCharOp` helper for multi-char operator detection

# v4.0.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v4.0.3)

- Fix: Align mixed object literals with partial common prefix (e.g., `lineComments:` and `python:`)
- Improve: `pure_FindCommonPrefix` uses coverage threshold instead of strict equality

# v4.0.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v4.0.2)

- Fix: Align full document when selecting entire file or no selection

# v4.0.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v4.0.1)

- Merge align algorithms into single extension.ts

# v4.0.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v4.0.0)

- Major refactor: Significant changes to extension.ts
- Remove: Tests

# v3.0.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v3.0.4)

- Fix: Auto-expand full document when cursor has no selection
- Add: VS Code Output Channel logging

# v3.0.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v3.0.3)

- Remove: Integration tests (no longer needed)
- Improve: Show align chars and sample lines in success message

# v3.0.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v3.0.2)

- Add: Detailed step-by-step messages on align (Load/Validate/Process/Write)
- Add: Show block and line count on success

# v3.0.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v3.0.1)

- Fix: Added missing pure_FindAlignPoints function

# v3.0.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v3.0.0)

- Fix: Command name changed from codeAlign.alignSelection to vscode-better-align-columns.align
- Refactor: Unified alignChars and multiCharOps for consistent operator alignment
- Add: PHP language config with ->, <=>, ?? operators
- Add: SRP-compliant pure functions with switch-based state machine
- Add: 82 tests covering alignment logic, block comments, multi-char operators

# v2.0.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v2.0.7)

- Fix: User code fixes in src/extension.ts

# v2.0.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v2.0.1)

- Add: Comprehensive test suite with 37 tests
- Add: OpenBrace/Semicolon/Colon alignment tests
- Add: String handling and block comment detection tests

# v2.0.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v2.0.0)

- Refactor: Complete rewrite of tokenizer with state machine architecture
- Add: OpenBrace and OpenParen as significant alignment tokens
- Add: Semicolon alignment inside code blocks
- Add: Structural prefix key matching for block alignment
- Add: Comma/semicolon column alignment (N-th occurrence)
- Fix: PHP generics handling (`array<T>`, `Map<K,V>`)
- Fix: Spaceship operator `<=>` support
- Fix: Block comment start recognition (`/* */`)
- Fix: URL detection (`://` not treated as comment)

# v1.10.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.10.0)

- Rename: Commands from `vscode-better-align` to `vscode-better-align-columns`

# v1.9.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.9.1)

- Fix: Settings namespace changed from `betterAlign` to `betterAlignColumns` to avoid conflicts with original extension

# v1.9.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.9.0)

- Add: PHP support for `->` operator (method chaining)
- Add: PHP support for `<?php` / `<?=` tags
- Add: PHP support for generic type annotations (e.g., `array<string>`, `array<array<string>>`)
- Add: PHP support for spaceship operator `<=>`
- Add: PHP tokenization tests

# v1.8.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.8.0)

- Rename: Extension is now "Better Align Columns"

# v1.7.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.7.1)

- Refactor: Code formatting with improved alignment

# v1.7.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.7.0)

- Fix: Don't treat `://` (URLs) as line comments
- Fix: Use actual whitespace character codes in tokenizer (not escaped string literals)
- Fix: Track escape sequences properly in strings (handle `"` correctly)
- Fix: Handle brackets without backslash escaping
- Fix: Improve `wordsBefore` logic for multi-word prefixes
- Fix: Normalize surroundSpace values (no more negative indices)
- Fix: Comma alignment improvements
- Fix: Improved trailing comment alignment
- Fix: Clean up EOL handling

- Fix: Improved tokenizer and formatter logic to prevent corruption of comparison operators (`===`, `!==`) and string literals during alignment.

# v1.6.8 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.8)

- Fix: Corrected tokenization logic to prevent corruption of comparison operators (`===`, `!==`) and compound assignment operators.

# v1.6.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.7)

- Fix: Corrected syntax errors (incorrect `== =` to `===`, `!= =` to `!==`) and formatting issues in `src/extension.ts`.

# v1.6.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.6)

- Added Comparison token type (>=, <=, !=, ==)
- Switch-based classifier replaces nested ifs

# v1.6.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.5)

- Fixed comparison operators >=, <=, != being split by alignment

# v1.6.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.4)

- Fixed typo in format.test.ts (>=)

# v1.6.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.3)

- Added VS Code reload instructions to AGENTS.md

# v1.6.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.2)

- Added AGENTS.md development instructions
- Minor formatting improvements

# v1.6.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.1)

- Fixed ESLint curly rule violations (53 errors)

# v1.6.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.6.0)

- New alignment engine: pure functions, state machine, SRP
- Fixed property access alignment (`let x = x.x` now properly aligns)
- Fixed operator position alignment (all operators in same column)
- Tests now show input/output for visual verification

# v1.5.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.5.2)

- Fix alignment for lines ending with closing brackets (], ), })

# v1.5.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.5.1)

- Fix comma alignment issue (no extra spaces before commas on repeated format)

# v1.5.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.5.0)

- Fix colon alignment (all `:` now align to same column)

# v1.4.9 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.9)

- Fix "Illegal value for `line`" error on large selections

# v1.4.8 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.8)

- Remove telemetry dependency
- Refactor formatter.ts to use separate modules (tokenizer, languageConfig, types)
- Fix "Invalid array length" error on large alignments

# v1.4.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.7)

- Fix extra spaces being added to single-line comments

# v1.4.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.6)

- Fix "Invalid array length" error on large files

# v1.4.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.5)

- Add support for 'from' keyword vertical alignment in TypeScript, TypeScript React, and JavaScript files

# v1.4.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.4)

- Fix error in PHP

# v1.4.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.3)

- CI: Update publishing workflow to use `HaaLeo/publish-vscode-extension@v2`, chain VSIX from Open VSX output, and remove redundant artifact download in release job
- Add language-aware comment support for multi-language alignment


# v1.4.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.2)

- Fix assignment like C style

# v1.4.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.1)

- Fix tab indentation replaced by space indentation
- Align command support `?:` operator

# v1.4.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.4.0)

- Fix errors align with empty line
- Fix format with double colon
- Add support for three character operators
- Fix incorrect indent during align with blocks
- Add credit for origin author's contribution
- Don't edit file if there is no any changes
- Fix alignment with double slash comment
- Fix add spaces if double align codes

# v1.3.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.3.2)

- Add support autohotkey syntax `:=`
- Update badges for vscode marketplace in readme

# v1.3.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.3.1)

- Improve extension stability and quality
- Update Dependencies

# v1.3.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.3.0)

- Fix commands broken if cursor in empty line
- Add web extension support

# v6.2.8 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.8)

- Fix: Property names in type definitions not modified (start stays as start)
- Add test for nested objects in type definitions

# v6.2.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.7)

- Fix: Idempotent behavior for aligned code
- Refactor: Symbol-based grouping in align algorithm

# v6.2.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.6)

- Fix: Full file selection aligns all code, idempotent behavior

# v6.2.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.5)

- Fix: Full file selection now aligns all code as one block

# v6.2.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.4)

- Refactor: Separate pure logic from VS Code API

# v6.2.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.3)

- Refactor: Extract A1 pipeline automaton code to separate file for testability

# v6.2.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.2)

- Fix: Lint auto-fix for curly braces

# v6.2.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.1)

- Added test for Record type definitions alignment
- Further improvements to idempotent behavior

# v6.2.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.2.0)

- Improved alignment algorithm with FSM state machines
- Better idempotent behavior

# v6.1.9 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.9)

- Fix: Function argument alignment works correctly

# v6.1.8 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.8)

- Fix: Improved function argument alignment works correctly

# v6.1.7 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.7)

- Fix: Align all markers of same symbol across ALL lines that match
- Improved handling of function call arguments

# v6.1.6 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.6)

# v6.1.5 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.5)

- Code formatting improvements (removed extra spaces)

# v6.1.4 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.4)

- Code formatting improvements

# v6.1.3 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.3)

- Refactor: Use shift variable to track cumulative insertions in applyPositionMap
- Fix: Comments and code formatting improvements

# v6.1.2 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.2)

- Fix: Transitive propagation for multi-line alignment in one pass (idempotent)
- Refactored algorithm into pairwise sliding window + transitive propagation

# v6.1.1 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.1)

- Fix: Alignment now works correctly in one pass (idempotent)
- Fix: Better alignment for TypeScript type annotations with `:` and `=`

# v6.1.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v6.1.0)

- Add tests for alignment functions without VS Code dependencies
- Test output shows input and output lines for visual verification

# v1.2.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.2.0)

- Initial release
