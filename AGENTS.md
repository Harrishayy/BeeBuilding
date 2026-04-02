# AgentFlow Configuration

## Agents

```yaml
agents:
  planner:
    model: claude-opus-4-6
    approvalRequired: false
    timeoutMinutes: 30
  coder:
    model: claude-sonnet-4-6
    approvalRequired: true
    approvalAfterLines: 100
    timeoutMinutes: 30
  tester:
    model: claude-sonnet-4-6
    approvalRequired: true
    timeoutMinutes: 30
  reviewer:
    model: claude-opus-4-6
    approvalRequired: true
    timeoutMinutes: 30
```

## Gates

```yaml
gates:
  afterPlanning: optional
  afterCoding: optional
  afterTesting: required
  afterReview: required
```

## Settings

```yaml
settings:
  gitMergeStrategy: squash
```
