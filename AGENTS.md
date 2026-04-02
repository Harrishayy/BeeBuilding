# BeeBuilding Hive Configuration

## Bees

```yaml
agents:
  scout_bee:
    model: claude-opus-4-6
    approvalRequired: false
    timeoutMinutes: 30
  worker_bee:
    model: claude-sonnet-4-6
    approvalRequired: true
    approvalAfterLines: 100
    timeoutMinutes: 30
  tester_bee:
    model: claude-sonnet-4-6
    approvalRequired: true
    timeoutMinutes: 30
  guard_bee:
    model: claude-opus-4-6
    approvalRequired: true
    timeoutMinutes: 30
```

## Queen's Gates

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
