# v1.6.5 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.6.5)

- Fixed comparison operators >=, <=, != being split by alignment

# v1.6.4 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.6.4)

- Fixed typo in format.test.ts (>=)

# v1.6.3 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.6.3)

- Added VS Code reload instructions to AGENTS.md

# v1.6.2 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.6.2)

- Added AGENTS.md development instructions
- Minor formatting improvements

# v1.6.1 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.6.1)

- Fixed ESLint curly rule violations (53 errors)

# v1.6.0 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.6.0)

- New alignment engine: pure functions, state machine, SRP
- Fixed property access alignment (`let x = x.x` now properly aligns)
- Fixed operator position alignment (all operators in same column)
- Tests now show input/output for visual verification

# v1.5.2 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.5.2)

- Fix alignment for lines ending with closing brackets (], ), })

# v1.5.1 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.5.1)

- Fix comma alignment issue (no extra spaces before commas on repeated format)

# v1.5.0 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.5.0)

- Fix colon alignment (all `:` now align to same column)

# v1.4.9 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.9)

- Fix "Illegal value for `line`" error on large selections

# v1.4.8 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.8)

- Remove telemetry dependency
- Refactor formatter.ts to use separate modules (tokenizer, languageConfig, types)
- Fix "Invalid array length" error on large alignments

# v1.4.7 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.7)

- Fix extra spaces being added to single-line comments

# v1.4.6 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.6)

- Fix "Invalid array length" error on large files

# v1.4.5 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.5)

- Add support for 'from' keyword vertical alignment in TypeScript, TypeScript React, and JavaScript files

# v1.4.4 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.4)

- Fix error in PHP

# v1.4.3 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.3)

- CI: Update publishing workflow to use `HaaLeo/publish-vscode-extension@v2`, chain VSIX from Open VSX output, and remove redundant artifact download in release job
- Add language-aware comment support for multi-language alignment


# v1.4.2 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.2)

- Fix assignment like C style

# v1.4.1 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.1)

- Fix tab indentation replaced by space indentation
- Align command support `?:` operator

# v1.4.0 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.4.0)

- Fix errors align with empty line
- Fix format with double colon
- Add support for three character operators
- Fix incorrect indent during align with blocks
- Add credit for origin author's contribution
- Don't edit file if there is no any changes
- Fix alignment with double slash comment
- Fix add spaces if double align codes

# v1.3.2 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.3.2)

- Add support autohotkey syntax `:=`
- Update badges for vscode marketplace in readme

# v1.3.1 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.3.1)

- Improve extension stability and quality
- Update Dependencies

# v1.3.0 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.3.0)

- Fix commands broken if cursor in empty line
- Add web extension support

# v1.2.0 [#](https://github.com/InExSu/vscode-better-align/releases/tag/v1.2.0)

- Initial release
