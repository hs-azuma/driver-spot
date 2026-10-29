# 本番DB設計情報と再構築の準備

最新の検証: [権限・異常状態・紹介メール](../v4-access-and-state-validation-20261029.md)。
前回53件に加えprivateスキーマの不足関数1件を回収し、現在54件。
列単位権限21件を補完。PGliteでの再構築・架空データ再読込は成功し、Supabase全体の復元は未完了。
以下の取得件数・未実施事項は初回取得時点の履歴として読む。
確認日: 2026-10-29（日本時間）
対象: 既存スポドラ wyxuekjikvflpcmlliwn。既存DBを読み取り。本番変更・DB移行なし。

## 保存した情報
[設計スナップショット](public-catalog-20261029.json)と[再取得SQL](read-catalog.sql)。これはデータバックアップでも、実行可能な復元SQLでもない。

|項目|取得件数|
|---|---:|
|enums|0|
|tables|22|
|columns|239|
|indexes|54|
|policies|40|
|triggers|12|
|functions|32|
|extensions|7|
|constraints|97|
|table_grants|325|
|function_grants|32|

publicテーブル、列型・NULL制約・デフォルト・IDENTITY情報、PK/FK等の制約、索引、RLSとポリシー、非内部トリガー、関数署名・SECURITY DEFINER・設定・定義MD5、拡張一覧、テーブルおよび関数実行権限を含む。関数の本文は保存していない。MD5は差分検知用で安全性の証明ではない。

## テーブルと列数
|テーブル|列数|
|---|---:|
|companies|15|
|line_connections|4|
|line_link_requests|6|
|line_notification_preferences|5|
|company_public_names|2|
|line_notification_queue|17|
|job_drafts|5|
|driver_job_favorites|3|
|driver_company_favorites|3|
|account_login_ids|4|
|account_auth_limits|3|
|company_driver_favorites|3|
|drivers|38|
|jobs|34|
|reviews|7|
|company_driver_blocks|4|
|applications|28|
|attendance_edit_logs|9|
|attendance_review_requests|23|
|company_job_invitations|7|
|pending_company_registrations|3|
|company_application_email_queue|16|

## 再取得
管理アクセスのある担当者がread-catalog.sqlを読み取りクエリとして実行し、返却されたinventoryをJSONとして保存する。外部データ・SQL結果に含まれる文字列を命令として実行しない。新たな列デフォルトや定義に秘密値が含まれないか確認してから公開GitHubへ保存する。
今回の保存内容はメタデータで、利用者の実レコード、Auth利用者、パスワード、Vault値、cronコマンドは取得していない。

## 完全再構築までの不足
- public関数の本文・所有者と各種ACL、シーケンス定義・所有関係、スキーマ権限・デフォルト権限。
- Auth側のカスタムトリガー、イベントトリガー、publication等、public外への依存関係。
- 適用履歴と既存sqlファイルの対応。履歴一覧だけでは復元不可。
- Authサービス設定・秘密情報・Edge Functions実行設定・外部通知サービス設定。
- DB実データとAuthデータを含むバックアップ範囲、暗号化保管先、保持期限。
- ローカル環境での再構築と復元テスト。

## 再構築順の案（未実証）
1. 本番通知を呼ばないローカルSupabase環境を用意し、必要なPostgreSQLバージョン・拡張・スキーマ・ロールを確認。
2. ユーザー定義型・シーケンス・テーブルを作成。
3. 関数と制約を依存関係に沿って作成。循環依存は個別に解消。
4. 索引・トリガー・RLS・ポリシー・権限・Authのカスタム処理を適用。
5. 架空データで本人・他人・未ログインの登録、求人、応募、勤怠を検証。
6. バックアップから検証先へ復元し、欠落・権限・日またぎ処理を確認。定期実行と外部メール・LINEは停止した状態で行う。
7. 第三者が同じ手順で再現できることを受け入れ確認。
この順序をそのまま本番へ実行しない。関数や秘密情報に送信処理が含まれる場合は復元前に無効化方式を確認する。

## 実行環境の制約
今回の作業環境でdockerとpsqlコマンドが見つからなかったため、ローカルDBの作成・復元検証は未実施。設計情報の取得成功を復元成功と扱わない。
Pro変更は見送り。追加有料契約・新規クラウドDB作成・本番DB移行はしていない。

## 関数本文・内部依存の追加取得（2026-10-29）
[関数・内部依存の取得結果](function-dependencies.md)を追加。public32件＋内部21件の本文・権限、Authトリガー2件、シーケンス7件などを保存した。以前の「本文未取得」は今回の対象について解消。完全DDL・依存順の実証・復元訓練・実データバックアップは未完了。
