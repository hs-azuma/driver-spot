# 参照した公式資料と境界

確認日: 2026-11-04。

- [Supabase Changelog](https://supabase.com/changelog)：TLS変更とPG更新の関連項目を確認。本番更新は行わない。
- [Functionsの依存管理](https://supabase.com/docs/guides/functions/dependencies)：Function別deno.jsonで分離し、依存を固定。
- [Database Backups](https://supabase.com/docs/guides/platform/backups)：DBとStorage実体を別の保全対象として扱う。
- [Deno TypeScript設定](https://docs.deno.com/runtime/reference/ts_config_migration/)と[deno check](https://docs.deno.com/runtime/reference/cli/check/)：アプリのstrict検査と`--all`による外部型宣言再検査を区別。

今回の型宣言互換性の発見は、当該固定バージョンに対する実行結果に基づく。上流の最新修正状況を推測してSDKを変更しない。
固定バージョンは再現性のための指定であり、脆弱性がないことや本番Edge Runtimeと一致することの保証ではない。

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)：公開リポジトリの標準ホストランナーが無料である条件を確認。今回のCIは標準ubuntu-24.04のみ、成果物/キャッシュ保存なし。有料ランナーや有料リソースを作成しない。
