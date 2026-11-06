# 本番の読み取り診断と現行候補の切り戻し確認

2026-11-06（日本時間）。本番変更と追加課金は0件。調査対象は既存のdriver-spot。個人の行、認証情報、ファイル本体は取得していない。

## F18 読み取り診断

既存の管理接続で[読み取り専用SQL](../database/predeploy-read-only.sql)を実行した。REPEATABLE READ・READ ONLY、statement_timeout 5秒、lock_timeout 1秒、最後にROLLBACKを使用。
実行ロールの対象テーブルSELECT権限とRLSを迂回できる監査権限を確認し、RLSで一部しか見えていない結果を全件として扱う問題を除外した。

| 確認対象 | 結果 |
|---|---|
| プロジェクト | ACTIVE_HEALTHY、PostgreSQL 17.6.1.166 |
| publicテーブルとRLS | 22テーブル、RLS無効0件 |
| 制約・索引 | 未検証制約0件、無効索引0件 |
| 応募と定員 | 定員超過、無効定員、参照先不在、重複応募はすべて0件 |
| 勤怠の時刻 | 出勤なしの退勤、退勤が出勤より前の記録はともに0件 |
| 採用定員ガード | v4_guard_hiring_capacityは未適用 |
| 関数実行権限 | private系スキーマで匿名実行可能0件。publicのSECURITY DEFINERで匿名実行可能11件 |
| 判定 | check-predeploy.pyでREVIEW_REQUIRED。自動判定の停止理由はhiring_guard_not_installed。本番適用判断は保留 |

診断の完了はF18で記録し、ガードや権限の変更と反映後確認はF20・F21で扱う。

## Security Advisorの照合

Advisorの指摘を既存台帳と照合した。自動修正は実施していない。

- RLSが有効でポリシーなしの7テーブルは認証・連携・通知キュー等。サーバー専用テーブルの経路と既存権限を照合して判断し、画面ユーザーに一括公開する変更は行っていない。[指摘の説明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- public.set_application_workflow_timestampsのsearch_path未固定を記録。[指摘の説明](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- 匿名実行可能なSECURITY DEFINERは11件、ログインユーザー実行可能は12件。匿名のapply_attendance_roundingを含む。関数の認可、トリガー専用か、現行画面の呼び出し先を照合してから個別に変更する。[匿名権限の指摘](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)・[ログイン権限の指摘](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- 漏えい済みパスワードの検出設定は無効と報告された。利用可否・費用条件と所有者の判断を確認する対象として残す。[指摘の説明](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

実際の権限越え更新を本番で再現する操作は実施していない。既存の架空DBの再現結果と修正候補を再利用する。

## F04・F14の部分確認

Storageは現在バケット0件・オブジェクト0件。候補のHTML/JS/TSの代表的なStorage利用箇所の検索と合わせ、現行アプリ内に本体移行対象は見つかっていない。外部文書・旧配布物の参照と過去の退避ファイルは対象一覧の確認が必要なため、F04を完了にはしていない。

GitHubのrulesets一覧は空。mainの従来型ブランチ保護の照会は、接続アプリの管理権限不足で403になった。保護なしと断定せず、設定確認をF14に残す。

## F02 現行候補6組の切り戻し

[組合せ試験](../../tools/restore-lab/rollback-checks.mjs)で、下記6組の非空部分集合すべてを対象にする。適用は記載順、切り戻しは逆順。各パターンは同じ架空DB上の独立したSAVEPOINTから実行する。

1. 求人INSERT制限と勤怠・勤務履歴保持
2. 旧企業登録と勤怠丸め関数の権限
3. 応募時の初期状態・条件固定
4. 退会時の履歴保持
5. 日またぎ勤務の重複防止
6. 同時採用時の定員制限

切り戻し後に、関数定義ハッシュ、所有者、匿名・本人・サービスロールの有効権限、列権限、RLS、テーブルACL、ポリシー、public/Authトリガーを元の状態と比較する。
架空の試験でベースラインに戻した後、SAVEPOINTも戻す。既存のベースライン権限問題を再び許すため、実際の切り戻しには操作停止と承認が必要。
実データの損失を回復する手段はF08・F09のバックアップと復元で管理する。
63パターンすべて成功。既存の業務・権限・復元試験と合わせ365チェック成功、既知の指摘6件を継続記録した。結果は[隔離DB結果](../database/restore-candidate/lab-result.json)。候補SQLや適用順が変わる場合は該当する組合せを再検証する。
