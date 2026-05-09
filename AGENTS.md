# Agent Instructions for Development

After making code changes, always verify by running:

```bash
npm run lint    # Check linter
npm run test   # Run tests
```

## Bug Fix Process (TDD)

When user asks to fix a bug or error:

1. **Create failing test first** - Write a test in `test/align.test.ts` that reproduces the bug
2. **Run test to confirm failure** - `npm run test` should show the new test failing
3. **Fix the code** - Implement the fix in `src/extension.ts`
4. **Run tests** - All tests should pass
5. **Update lint** - `npm run lint` should pass
6. **Package and test** - `npm run package` and test the extension

This applies to ALL bug fixes, not just alignment issues.

## Important Limits

**If stuck after 3-5 iterations trying to fix a bug:**
- Stop reasoning in circles
- Report to user what the issue is and ask for guidance
- Do NOT continue endless debugging loops

**Time limit per fix:** If a simple fix isn't working after reasonable attempts, ask for clarification rather than continuing indefinitely.

# Agent Instructions for Release Process

After successfully improving the code, follow these steps to release a new version:

## 1. Version Bump

Update version in `package.json`:
- Change `"version": "X.Y.Z"` to the next version number

## 2. Update CHANGELOG.md

Add new section at the top of `CHANGELOG.md`:

```markdown
# vX.Y.Z [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/vX.Y.Z)

- Brief description of the changes
```

## 3. Build and Package

Remove old VSIX if exists:
```bash
rm -f vscode-better-align-columns-X.Y.Z.vsix
```

Build and package the extension:
```bash
npm run package
```

Or use vsce:
```bash
npx vsce package
```

4. **Verify Release by Installing and Reloading VS Code**

To ensure the new version is working correctly as part of the release process, install the newly packaged extension and reload VS Code:
```bash
code --uninstall-extension inexsu.vscode-better-align-columns 2>/dev/null || true
code --install-extension vscode-better-align-columns-X.Y.Z.vsix --force
code --reload-window
```

Reload VS Code after install (if auto-reload doesn't work):
```bash
osascript -e 'tell app "Code" to quit' && open -a "Visual Studio Code"
```

## 5. Verify Extension

After installation, verify the extension details in VS Code:
- Open Extensions panel (Ctrl+Shift+X)
- Search for "Better Align"
- Check that version shows X.Y.Z and description is correct

If description shows outdated info, rebuild with:
```bash
npx vsce package
```

## 6. Create Git Commit

Create a commit with all changes:
```bash
git add -A && git commit -m "vX.Y.Z: Description of changes"
```

## Example

For a fix improving the "Invalid array length" error handling:

1. Update `package.json`: `"version": "X.Y.Z"`
2. Add to `CHANGELOG.md`:
   ```markdown
   # vX.Y.Z [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/vX.Y.Z)

   - Fix "Invalid array length" error on large alignments
   ```
3. Run: `npx vsce package`
4. Install: `code --uninstall-extension inexsu.vscode-better-align-columns 2>/dev/null || true && code --install-extension vscode-better-align-columns-X.Y.Z.vsix --force && code --reload-window`
5. Verify extension details in VS Code Extensions panel
6. Commit: `git add -A && git commit -m "vX.Y.Z: Fix Invalid array length on large alignments"`
