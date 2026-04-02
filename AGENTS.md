# AgentFlow Configuration

## Agents

```yaml
agents:
  planner:
    model: claude-opus-4-6
    approvalRequired: false
    timeoutMinutes: 45
  coder:
    model: claude-sonnet-4-6
    approvalRequired: true
    approvalAfterLines: 100
    timeoutMinutes: 45
  tester:
    model: claude-sonnet-4-6
    approvalRequired: true
    timeoutMinutes: 45
  reviewer:
    model: claude-opus-4-6
    approvalRequired: true
    timeoutMinutes: 45
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
