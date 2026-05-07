# Agent Instructions for Release Process

After successfully improving the code, follow these steps to release a new version:

## 1. Version Bump

Update version in `package.json`:
- Change `"version": "X.Y.Z"` to the next version number

## 2. Update CHANGELOG.md

Add new section at the top of `CHANGELOG.md`:

```markdown
# vX.Y.Z [#](https://github.com/InExSu/vscode-better-align/releases/tag/vX.Y.Z)

- Brief description of the changes
```

## 3. Build and Package

Remove old VSIX if exists:
```bash
rm -f vscode-better-align-X.Y.Z.vsix
```

Build and package the extension:
```bash
npm run package
```

Or use vsce:
```bash
npx vsce package
```

## 4. Install and Reload VS Code

Install the new extension and reload:
```bash
code --uninstall-extension chouzz.vscode-better-align 2>/dev/null || true
code --install-extension vscode-better-align-X.Y.Z.vsix --force
code --reload-window
```

## 5. Create Git Commit

Create a commit with all changes:
```bash
git add -A && git commit -m "vX.Y.Z: Description of changes"
```

## Example

For a fix improving the "Invalid array length" error handling:

1. Update `package.json`: `"version": "X.Y.Z"`
2. Add to `CHANGELOG.md`:
   ```markdown
   # vX.Y.Z [#](https://github.com/InExSu/vscode-better-align/releases/tag/vX.Y.Z)

   - Fix "Invalid array length" error on large alignments
   ```
3. Run: `rm -f vscode-better-align-X.Y.Z.vsix && npx vsce package`
4. Install: `code --uninstall-extension chouzz.vscode-better-align 2>/dev/null || true && code --install-extension vscode-better-align-X.Y.Z.vsix --force && code --reload-window`
5. Commit: `git add -A && git commit -m "vX.Y.Z: Fix Invalid array length on large alignments"`
