## Intent Detection Language Coverage Matrix

This matrix provides a clear overview of which scenarios are covered for each language in the test suite.

### Comment Detection

| Language        | Empty Comment (on/after) | Non-Empty Comment (on/after) | Block Comment (in/on/after) | JSDoc Comment (in/on/after) | Doc Comment (in/on/after) | No Comment Large File | Comment in Empty Function (on/after) |
| --------------- | :----------------------: | :--------------------------: | :-------------------------: | :-------------------------: | :-----------------------: | :-------------------: | :----------------------------------: |
| TypeScript      |            ✅            |              ✅              |             ✅              |             ✅              |            NA             |          ✅           |                  ✅                  |
| TypeScriptReact |            ✅            |              ✅              |             ✅              |             ✅              |            NA             |          ✅           |                  ✅                  |
| JavaScript      |            ✅            |              ✅              |             ✅              |             ✅              |            NA             |          ✅           |                  ✅                  |
| JavaScriptReact |            ✅            |              ✅              |             ✅              |             ✅              |            NA             |          ✅           |                  ✅                  |
| Ruby            |            ✅            |              ✅              |             ❌              |             NA              |            NA             |          ✅           |                  ✅                  |
| Go              |            ✅            |              ✅              |             ✅              |             NA              |            ❌             |          ✅           |                  ✅                  |
| Java            |            ✅            |              ✅              |             ✅              |             NA              |            ✅             |          ✅           |                  ✅                  |
| Kotlin          |            ✅            |              ✅              |             ✅              |             NA              |            ✅             |          ✅           |                  ✅                  |
| Rust            |            ✅            |              ✅              |             ✅              |             NA              |            ✅             |          ✅           |                  ✅                  |
| Vue             |            ✅            |              ✅              |             ✅              |             NA              |            ❌             |          ✅           |                  ✅                  |
| YAML            |            ✅            |              ✅              |             NA              |             NA              |            NA             |          ✅           |                  NA                  |
| HTML            |            ✅            |              ✅              |             ✅              |             NA              |            NA             |          ✅           |                  NA                  |

- `on`: the cursor is on the same line as a comment
- `after`: the cursor is below a comment
- `in`: the cursor is within a block comment

### Empty Function Detection

| Language        | Declaration | Expression | Arrow/Lambda | Method | Closure | Implementation | Class | Constructor | Generator |    Macro    |
| --------------- | :---------: | :--------: | :----------: | :----: | :-----: | :------------: | :---: | :---------: | :-------: | :---------: |
| TypeScript      |     ✅      |     ✅     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    ✅     |     NA      |
| TypeScriptReact |     ✅      |     ✅     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    ✅     |     NA      |
| JavaScript      |     ✅      |     ✅     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    ✅     |     NA      |
| Go              |     ✅      |     NA     |      ✅      |   ✅   |   NA    |       NA       |  NA   |     NA      |    ✅     |     NA      |
| Java            |     ✅      |     NA     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    NA     |     NA      |
| Kotlin          |     ✅      |     NA     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     NA      |    NA     |     NA      |
| Rust            |     ✅      |     NA     |      NA      |   ✅   |   ✅    |       ✅       |  NA   |     ✅      |    NA     | PartialImpl |
| Vue             |     ✅      |     ✅     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    ✅     |     NA      |
| Ruby            |     ✅      |     ✅     |      ✅      |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    NA     |     NA      |
| Python          |     ✅      |     NA     |   NotImpl    |   ✅   |   NA    |       NA       |  ✅   |     ✅      |    NA     |     NA      |
| YAML            |     NA      |     NA     |      NA      |   NA   |   NA    |       NA       |  NA   |     NA      |    NA     |     NA      |

**Notes:**

- "NA" (Not Applicable) is used for languages that don't have a specific function type
- "NotImpl" (Not Implemented) there is no implementation to cover with tests
- "PartialImpl" (Partially Implemented) covers some cases but not all
