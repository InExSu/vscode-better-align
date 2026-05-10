```markdown
# Инструкции для агента по разработке

После внесения изменений в код всегда проверяйте их выполнение:

```bash
npm run lint    # Проверка линтера
npm run test    # Запуск тестов
```

## Создание документации FSM

После изменения `src/fsm_Main.ts` создайте файл `src/fsm_Main.md` с mermaid-диаграммой иерархии управляющих машин состояний:

```bash
npx ts2mermaid src/fsm_Main.ts > src/fsm_Main.md
```

Если ts2mermaid не работает, создайте диаграмму вручную на основе enum состояний в коде. Диаграмма должна показывать все состояния (enum) и их переходы. Цвета на диаграмме не нужны.

## Процесс исправления ошибок (TDD)

Когда пользователь просит исправить ошибку:

1. **Сначала создайте падающий тест** - Напишите тест в `test/align.test.ts`, который воспроизводит ошибку
2. **Запустите тест                                                         , чтобы подтвердить падение** - `npm run test` должен показывать, что новый тест падает
3. **Исправьте код** - Реализуйте исправление в `src/extension.ts`
4. **Запустите тесты** - Все тесты должны проходить
5. **Обновите линтер** - `npm run lint` должен проходить
6. **Соберите и протестируйте** - `npm run package` и протестируйте расширение

Это относится ко ВСЕМ исправлениям ошибок, не только к проблемам выравнивания.

## Важные ограничения

**Если застряли после 3-5 итераций попыток исправить ошибку:**
- Прекратите бесконечные рассуждения
- Сообщите пользователю о проблеме и попросите руководства
- НЕ продолжайте бесконечные циклы отладки

**Временное ограничение на исправление:** Если простое исправление не работает после нескольких попыток, попросите разъяснений, а не продолжайте бесконечно.

# Инструкции для агента по процессу релиза

После успешного улучшения кода выполните следующие шаги для выпуска новой версии:

## 1. Увеличение версии

Обновите версию в `package.json`:
- Измените `"version": "X.Y.Z"` на следующий номер версии

## 2. Обновите CHANGELOG.md

Добавьте новый раздел в начало `CHANGELOG.md`:

```markdown
# vX.Y.Z [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/vX.Y.Z)

- Краткое описание изменений
```

## 3. Сборка и упаковка

Удалите старый VSIX, если существует:
```bash
rm -f vscode-better-align-columns-X.Y.Z.vsix
```

Соберите и упакуйте расширение:
```bash
npm run package
```

Или используйте vsce:
```bash
npx vsce package
```

## 4. Проверьте релиз, установив и перезагрузив VS Code

Чтобы убедиться, что новая версия работает корректно как часть процесса релиза, установите только что упакованное расширение и перезагрузите VS Code:
```bash
code --uninstall-extension inexsu.vscode-better-align-columns 2>/dev/null || true
code --install-extension vscode-better-align-columns-X.Y.Z.vsix --force
code --reload-window
```

Перезагрузите VS Code после установки (если автоматическая перезагрузка не работает):
```bash
osascript -e 'tell app "Code" to quit' && open -a "Visual Studio Code"
```

## 5. Проверьте расширение

После установки проверьте детали расширения в VS Code:
- Откройте панель расширений (Ctrl+Shift+X)
- Найдите "Better Align"
- Проверьте          , что версия показывает X.Y.Z и описание корректно

Если описание показывает устаревшую информацию, пересоберите:
```bash
npx vsce package
```

## 6. Создайте Git коммит

Создайте коммит со всеми изменениями:
```bash
git add -A && git commit -m "vX.Y.Z: Описание изменений"
```

## Пример

Для исправления, улучшающего обработку ошибки "Invalid array length":

1. Обновите `package.json`  : `"version": "X.Y.Z"`
2. Добавьте в `CHANGELOG.md`:
   ```markdown
   # vX.Y.Z [#](https://github.com/InExSu/vscode-better-align-columns/releases/tag/vX.Y.Z)

   - Исправлена ошибка "Invalid array length" при большом выравнивании
   ```
3. Удалите старый VSIX: `rm -f vscode-better-align-columns-X.Y.Z.vsix`
4. Запустите   : `npx vsce package`
5. Установите  : `code --uninstall-extension inexsu.vscode-better-align-columns 2>/dev/null || true && code --install-extension vscode-better-align-columns-X.Y.Z.vsix --force && code --reload-window`
6. Проверьте детали расширения в панели расширений VS Code
7. Зафиксируйте: `git add -A && git commit -m "vX.Y.Z: Исправлена ошибка Invalid array length при большом выравнивании"`

---
name       : karpathy-guidelines
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license    : MIT
---

# Karpathy Guidelines

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing          :
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist              , present them - don't pick silently.
- If a simpler approach exists                   , say so. Push back when warranted.
- If something is unclear                        , stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code         :
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style             , even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify  : [check]
2. [Step] → verify  : [check]
3. [Step] → verify  : [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
```