# External infrastructure budget: template (ARD section 9)

The in-house team fills this in once a provider is chosen. It covers external costs only and excludes internal salaries. Show prices in EUR, state the tax treatment, and give the estimate date and source.

## Assumptions
| Item | Initial | Higher-usage scenario |
|---|---|---|
| Registered workers | _e.g. 50_ | _e.g. 500_ |
| Peak concurrent users (shift start) | | |
| Clock events per day | | |
| DB size after 12 months | | |
| Backup retention | | |

## Recurring monthly costs
| Category | Service / SKU | Production | Dev/test | Fixed or usage-based | Notes |
|---|---|---|---|---|---|
| Compute (app) | | | | | |
| Managed Postgres | | | | | Include HA / minimum charges |
| Backup storage / PITR | | | | | |
| Data transfer | | | | | |
| Logs / monitoring | | | | | |
| Domain + TLS | | | | | |
| Other subscriptions | | | | | Identify reusable company licences |
| **Monthly total** | | | | | |
| **Annual equivalent** | | | | | |

## One-off external setup costs
| Item | Cost | Notes |
|---|---|---|

## Optional paid services (each needs separate business approval)
| Service | Purpose | Monthly |
|---|---|---|

## Operating responsibility
| Area | Owner |
|---|---|
| Cloud account and billing | |
| Deployment | |
| Backups and restore tests | |
| Access administration | |
| Ongoing maintenance | |

The estimate should show normal costs after any introductory credits or free allowances expire.
