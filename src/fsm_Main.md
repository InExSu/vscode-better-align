# FSM Documentation

## FSMState (a_FSM_Main — главная машина выравнивания)
```mermaid
graph LR
    blocks_Split --> blocks_Process
    blocks_Process --> result_Emit
```

Состояния:
- `blocks_Split` — разбивка строк на блоки по вектору признаков (§2.1)
- `blocks_Process` — выравнивание каждого блока (§2.3)
- `result_Emit` — выход

## GroupingState (legacy — blocks_Find по отступу)
```mermaid
graph LR
    WaitingForStart --> Accumulating
    Accumulating --> WaitingForStart
```

Заменён на `blocks_Split` (группировка по вектору признаков P(f), а не по отступу).

## PipelineState (pipeline_Build)
```mermaid
graph LR
    Idle --> LoadConfig
    LoadConfig --> DetectLanguage
    DetectLanguage --> FindBlocks
    FindBlocks --> ParseLines
    ParseLines --> Align
    Align --> ReplaceText
    ReplaceText --> Done
    ReplaceText --> Error
    LoadConfig --> Error
    DetectLanguage --> Error
    FindBlocks --> Error
    ParseLines --> Error
    Align --> Error
```

## BlockSearchState (extension.ts — blockSearchFSM)
```mermaid
graph LR
    WaitingForData --> ValidatingContext
    ValidatingContext --> AnalyzingSelection
    AnalyzingSelection --> ExtractingLines
    ExtractingLines --> GroupingBlocks
    GroupingBlocks --> Done
    AnalyzingSelection --> Error
    ValidatingContext --> Error
```
