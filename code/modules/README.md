# Application module boundaries

The new application keeps domain modules separate from App Router presentation code.
Each module owns its public interface and tests behavior through that interface; pages
and route handlers must not reimplement module policy.

| Module              | Responsibility                                     | Planned task    |
| ------------------- | -------------------------------------------------- | --------------- |
| `auth/`             | Cloud identity and Local Mode identity             | T4.2–T4.3       |
| `catalog/`          | Curated Content loading, validation, and queries   | T1.2–T1.5       |
| `content-resolver/` | Cloud/Local resolved-content boundary              | T3.1–T3.2, T5.2 |
| `freshness/`        | Read-only material status and host-command results | T6.4–T6.7       |
| `learning-state/`   | Progress, notes, bookmarks, and outcomes           | T4.1–T4.8       |
| `observability/`    | Privacy-first aggregate operational metrics        | T7.6            |
| `reader/`           | Safe Markdown/MDX presentation and navigation      | T2.5, T5.3      |
| `runtime/`          | Deployment-mode configuration                      | T1.1            |
| `search/`           | Public and allowed Local Material search indexes   | T6.1–T6.3       |

The Catalog API reads only the Git-managed `code/content/` directory. It does not
read SQLite or `local-courses/`; Content Resolver owns later access to Local
Material.
