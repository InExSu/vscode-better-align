# Claude Code Configuration for vscode-better-align-columns

## Project Overview
VS Code extension for better vertical alignment with/without selection in any language for any characters or words.

## Architecture
- **src/extension.ts**: Effect layer - VS Code API interactions, _Decor functions
- **src/fsm_Main.ts**: Pure core - FSM a_FSM_Main, types, utilities

## FSM Architecture (Shalyto A.N.)
Main automaton: `a_FSM_Main` with states:
1. `block_Find` - find next block of lines
2. `lines_Sanitize` - mask non-code (\0)
3. `chars_Scan` - build raw token map
4. `map_Normalize` - normalize map → AlignColumn[]
5. `lines_Align` - apply map to original lines
6. `result_Emit` - return result

## Development Commands
```bash
npm run lint   # Check code style
npm run test   # Run tests
npm run package # Build and package
```

## Release Process
1. Update version in package.json (semver)
2. Update CHANGELOG.md
3. `rm -f vscode-better-align-columns-*.vsix && npm run package`
4. `code --install-extension vscode-better-align-columns-X.Y.Z.vsix`
5. Push the commit to the remote repository (e.g., `git push`).

## Key Principles
- TypeScript for VS Code extensions
- Railway pattern (Result type) for error handling
- Explicit assumptions and effects
- Minimal code - only what's requested
- TDD workflow: red → green → refactor → commit