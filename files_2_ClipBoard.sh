#!/bin/bash
FILES=(
  src/extension.ts
  src/fsm_Main.ts
)

CLIP=""
for f in "${FILES[@]}"; do
  CLIP+="=== $f ===
$(cat "$f")

"
done

echo -n "$CLIP" | pbcopy
echo "Copied ${#FILES[@]} files to clipboard"
