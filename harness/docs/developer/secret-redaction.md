# Secret Redaction

The `lib_secret_redaction` package provides secret detection and redaction capabilities using rules derived from the [Gitleaks project](https://github.com/gitleaks/gitleaks).

## Updating Gitleaks Rules

Our Gitleaks rules are adapted from the upstream Gitleaks project. To update them:

1. Grab a copy of the latest Gitleaks rules from the repo
1. Convert TOML to JSON, replace the `rawConfig` object in `packages/lib_secret_redaction/src/gitleaks_rules.ts`
1. Run `bun run autofix` to format the JSON as TypeScript

### Quick Update Script

Here is a Python 3.11+ one-liner that fetches and converts the latest rules:

```python
python3 -c "import tomllib, json, urllib.request; response = urllib.request.urlopen('https://raw.githubusercontent.com/gitleaks/gitleaks/refs/heads/master/config/gitleaks.toml'); print(json.dumps(tomllib.loads(response.read().decode('utf-8')),indent=2))"
```

## Secret Redaction Process

The language server goes through two stages when using these rules - initialisation and evaluation.

### Initialisation - Rule Parsing and Optimization

The raw Gitleaks rules are stored as JSON with regex patterns as strings. At runtime, the `GitleaksRuleParser` service pre-processes these rules for better performance:

1. **Regex precompilation**: All regex patterns (rule matchers, allowlists, path filters) are compiled from strings to `RegExp` objects once at startup
1. **Regex syntax conversion**: Gitleaks uses Go regex syntax, which is converted to JavaScript-compatible patterns (e.g., handling `(?i)` case-insensitivity flags)
1. **Keyword trie construction**: All rule keywords are aggregated into an [Aho-Corasick](https://en.wikipedia.org/wiki/Aho%E2%80%93Corasick_algorithm) trie for efficient multi-pattern matching
1. **Condition normalization**: Allowlist conditions (`AND`, `&&`, `or`, etc.) are normalized to a consistent format

This parsing happens once when the service is instantiated, so rule evaluation at detection time only uses the precompiled structures.

<details>
<summary>Click to expand</summary>

```mermaid
flowchart TB
    Start([Start: SecretRedactor Constructor]) --> Init[Initialize Components]

    Init --> ParseRules[Parse Raw Gitleaks Rules<br/>GitleaksRuleParser.constructor]
    ParseRules --> CompileRegex[Compile Regex Patterns<br/>- Rule regex patterns<br/>- Path patterns<br/>- Allowlist patterns]
    CompileRegex --> ConvertRegex[Convert PCRE Regex to JS<br/>- Handle case insensitivity prefix<br/>- Set appropriate flags: g, m, i]
    ConvertRegex --> ParseAllowlists[Parse Global & Rule Allowlists<br/>- Normalize conditions: AND/OR<br/>- Compile allowlist regexes]
    ParseAllowlists --> BuildKeywords[Extract All Keywords from Rules<br/>- Aggregate unique keywords<br/>- Already lowercased in raw config]
    BuildKeywords --> BuildTrie[Build Aho-Corasick Trie<br/>- Efficient multi-pattern search<br/>- Store all unique keywords]
    BuildTrie --> InitComplete[Initialization Complete<br/>- Rules parsed & compiled<br/>- Keyword trie ready<br/>- Allowlists prepared]
    InitComplete --> End([Ready for Redaction])

    classDef initClass fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000000
    class Init,ParseRules,CompileRegex,ConvertRegex,ParseAllowlists,BuildKeywords,BuildTrie,InitComplete initClass
```

</details>

### Rule evaluation

This is the "hot path" where some content needs to be checked/redacted, for example when we are generating code suggestions as the user is typing.

#### Pre-filtering

Global allowlist checking, keyword matching to skip redactions and creates a smaller specific set of rules to check

<details>
<summary>Click to expand</summary>

```mermaid
flowchart TB
    RedactStart([redactSecrets called]) --> CheckEmpty{Content Empty?}
    CheckEmpty -->|Yes| ReturnUnchanged[Return Original Content]
    CheckEmpty -->|No| CheckGlobalPath

    subgraph GlobalFiltering ["Global Filtering"]
        CheckGlobalPath{Path in Global<br/>Allowlist?}
        CheckGlobalPath -->|Yes| ReturnUnchanged
        CheckGlobalPath -->|No| ScanKeywords[Scan Content for Keywords<br/>Using Aho-Corasick Trie]
        ScanKeywords --> BuildKeywordSet[Build Set of Found Keywords<br/>- Convert content to lowercase<br/>- Extract all matching keywords]
    end

    BuildKeywordSet --> SelectRules

    subgraph RuleSelection ["Rule Selection & Iteration"]
        SelectRules[Select Rules for Evaluation]
        SelectRules --> RuleLoop{For Each Rule}
        RuleLoop --> CheckRuleKeywords{Rule Keywords<br/>Found in Content?}
        CheckRuleKeywords -->|No Keywords in Rule| EvaluateRule[Call evaluateRule<br/>No keyword filtering]
        CheckRuleKeywords -->|Keywords Not Found| NextRule[Skip Rule]
        CheckRuleKeywords -->|Keywords Found| EvaluateRule
        NextRule --> RuleLoop
        EvaluateRule --> CollectMatches[Collect Matches<br/>from Rule Evaluation]
        CollectMatches --> RuleLoop
    end

    RuleLoop -->|All Rules Processed| ApplyRedactions

    subgraph RedactionApplication ["Apply Redactions"]
        ApplyRedactions[Sort Matches by Position<br/>Reverse Order]
        ApplyRedactions --> ReplaceSecrets[Replace Secrets with Asterisks<br/>- Process from end to start<br/>- Preserve indices]
        ReplaceSecrets --> RedactionComplete[Return Redacted Content]
    end

    RedactionComplete --> End([End])
    ReturnUnchanged --> End

    classDef decisionClass fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#000000
    classDef processClass fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#000000

    class CheckEmpty,CheckGlobalPath,CheckRuleKeywords,RuleLoop decisionClass
    class RedactStart,ScanKeywords,BuildKeywordSet,SelectRules,EvaluateRule,CollectMatches,NextRule,ApplyRedactions,ReplaceSecrets,RedactionComplete,ReturnUnchanged processClass
```

</details>

#### Per-rule evaluation

Runs each rule, applying different checks/flows depending on the rule type

<details>
<summary>Click to expand (big...)</summary>

```mermaid
flowchart TB
    RuleEval([evaluateRule Start]) --> HasPath{Rule Has<br/>Path Constraint?}

    subgraph PathMatching ["Path Constraints"]
        HasPath -->|No| CheckRegex
        HasPath -->|Yes| PathMatches{Path Matches<br/>Pattern?}
        PathMatches -->|No| RuleNoMatch[Return Empty Matches]
        PathMatches -->|Yes| IsPathOnly{Path-Only Rule?<br/>No Regex}
        IsPathOnly -->|Yes| RedactEntireFile[Return Entire File<br/>as Single Match]
        IsPathOnly -->|No| CheckRegex
    end

    subgraph RegexMatching ["Regex Pattern Matching"]
        CheckRegex{Rule Has Regex?}
        CheckRegex -->|No| RuleNoMatch
        CheckRegex -->|Yes| ApplyRegex[Apply Regex Pattern<br/>matchAll with flags]
        ApplyRegex --> HasMatches{Matches Found?}
        HasMatches -->|No| RuleNoMatch
        HasMatches -->|Yes| ProcessMatches
    end

    subgraph MatchProcessing ["Match Processing"]
        ProcessMatches[For Each Regex Match] --> ExtractSecret

        subgraph SecretExtraction ["Secret Extraction"]
            ExtractSecret[Extract Secret from Match]
            ExtractSecret --> HasSecretGroup{Has secretGroup?}
            HasSecretGroup -->|Yes| UseSpecificGroup[Use Specified Group<br/>groups at secretGroup index]
            HasSecretGroup -->|No| FindFirstGroup[Find First Non-Empty<br/>Capture Group]
            UseSpecificGroup --> ValidGroup{Group Valid?}
            ValidGroup -->|No| SkipMatch[Skip This Match]
            ValidGroup -->|Yes| SecretExtracted[Secret Extracted]
            FindFirstGroup --> SecretExtracted
        end

        SecretExtracted --> CheckEntropy

        subgraph EntropyCheck ["Entropy Validation"]
            CheckEntropy{Rule Has<br/>Entropy Threshold?}
            CheckEntropy -->|No| CheckGlobalAllowlist
            CheckEntropy -->|Yes| CalcEntropy[Calculate Shannon Entropy]
            CalcEntropy --> EntropyOK{Entropy ><br/>Threshold?}
            EntropyOK -->|Below/Equal| SkipMatch
            EntropyOK -->|Above| CheckGlobalAllowlist
        end

        subgraph AllowlistChecks ["Allowlist Evaluation"]
            CheckGlobalAllowlist[Check Global Allowlist]
            CheckGlobalAllowlist --> GlobalRegex{Matches Global<br/>Regex Patterns?}
            GlobalRegex -->|Yes| SkipMatch
            GlobalRegex -->|No| GlobalStopwords{Contains Global<br/>Stopwords?}
            GlobalStopwords -->|Yes| SkipMatch
            GlobalStopwords -->|No| CheckRuleAllowlist

            CheckRuleAllowlist[Check Rule Allowlists]
            CheckRuleAllowlist --> DetermineTarget[Determine Target<br/>- secret: default<br/>- match<br/>- line]
            DetermineTarget --> CheckCondition{Allowlist<br/>Condition?}

            CheckCondition -->|OR| OrLogic[OR Logic:<br/>Any Match Allows]
            OrLogic --> OrChecks{Path OR Regex<br/>OR Stopword<br/>Match?}
            OrChecks -->|Yes| SkipMatch
            OrChecks -->|No| AddToRedaction

            CheckCondition -->|AND| AndLogic[AND Logic:<br/>All Must Pass]
            AndLogic --> AndChecks{Path AND Regex<br/>AND Stopword<br/>All Match?}
            AndChecks -->|Yes| SkipMatch
            AndChecks -->|No| AddToRedaction
        end

        AddToRedaction[Add Match to<br/>Redaction List]
        SkipMatch --> NextMatch[Process Next Match]
        AddToRedaction --> NextMatch
        NextMatch --> ProcessMatches
    end

    ProcessMatches -->|All Matches Processed| RuleComplete[Return Matches]
    RuleNoMatch --> RuleComplete
    RedactEntireFile --> RuleComplete

    RuleComplete --> End([End])

    classDef decisionClass fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#000000
    classDef processClass fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#000000

    class HasPath,PathMatches,IsPathOnly,CheckRegex,HasMatches,HasSecretGroup,ValidGroup,CheckEntropy,EntropyOK,GlobalRegex,GlobalStopwords,CheckCondition,OrChecks,AndChecks decisionClass
    class RuleEval,ApplyRegex,ProcessMatches,ExtractSecret,UseSpecificGroup,FindFirstGroup,SecretExtracted,CalcEntropy,CheckGlobalAllowlist,CheckRuleAllowlist,DetermineTarget,OrLogic,AndLogic,AddToRedaction,SkipMatch,NextMatch,RuleNoMatch,RedactEntireFile,RuleComplete processClass
```

</details>

#### Redaction

If any rules matched and identified sensitive ranges in the content, we redact it.
