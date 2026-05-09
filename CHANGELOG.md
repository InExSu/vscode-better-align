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
- Fix: Track escape sequences properly in strings (handle `\\"` correctly)
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

# v1.2.0 [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/v1.2.0)

- Initial release
