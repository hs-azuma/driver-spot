# 第4版：再構築の実行検証と次の引き継ぎ地点

更新: 2026-10-29 JST。開始コミット: `3745166f891772399314f09a85384df2407fcfc9`。
本番サイト・DB・Auth設定・権限・課金・公開設定の変更なし。外部通知なし。

## 今回の結果

Docker/PostgreSQLの通常インストールは利用不可だったが、無料のPGliteを補助環境に採用。
PostgreSQL 17.5 WebAssembly上でアプリDDLを実行し、69項目の検査が成功した。
これはSupabase全体や本番実データの復元成功ではない。

|対象|結果|
|---|---|
|再構築DDL|22テーブル・239列・97制約・54索引・40ポリシー・54関数・通常/Authトリガー14件・IDENTITY7件を構築|
|定義比較|保存カタログのテーブル、列、制約、索引、ポリシー、トリガー、public関数本文ハッシュ、テーブル/関数権限が一致|
|本番読み取り照合|既存53関数＋回収1関数＝54件の保存本文ハッシュが本番と一致|
|アクセス試験|本人閲覧、他人の変更拒否、所有者変更拒否、なりすまし応募拒否、他社勤怠修正拒否|
|業務処理|企業名同期、運転者登録、企業メール確認後のDB登録、日またぎ勤怠150分と修正履歴|
|架空バックアップ|メモリ内のDBをexport/reload。カタログ・架空求人・企業名・採番継続を確認|
|セキュリティ修正案|匿名/他社名義の求人作成を拒否し、自社求人作成を維持する案をローカル検証。本番未適用|

## 実行して初めて分かった不足

1. `public.companies`のトリガーが`private.sync_company_public_name()`を参照していた。
   前回の関数取得はpublicとspodora系スキーマが対象で、privateスキーマの1関数が抜けていた。
   最初のDDL実行で「schema private does not exist」と停止したため、読み取りで回収した。
   `database/private-dependencies-20261029.json`に保存。以後の対象は54関数。
2. テーブル単位の権限に加えて、21列に個別SELECT権限があった。
   本番ワーカーの情報取得やブロック判定で必要になるため、取得して再構築候補へ反映。
3. 前回の権限抽出はPUBLICの明示/デフォルト実行権限だけを確認していた。
   anon/authenticatedに直接付いた実効権限も含めるよう修正。
   現在のpublic SECURITY DEFINER確認対象はanon11件、authenticated12件、和集合12件。
   トリガー専用関数を含むため、この件数をそのまま悪用可能な脆弱性数とは扱わない。

## 新たに再現した権限問題と対策案

架空データの隔離環境で、anonが既存企業のIDを指定して求人をINSERTできた。
原因はanonのINSERT権限と、`Public jobs insertable`の無条件ポリシーの組合せ。
本番APIで攻撃試験はしていない。本番の変更もしていない。

`sql/review-v4-job-insert-hardening.sql`では当該ポリシーを除去し、anonのINSERTを剥奪。
既存の`Companies manage own jobs`ポリシーを残す。
匿名登録拒否・他社名義登録拒否・自社登録成功の3点をローカルで検証した。
本番前には企業画面の求人登録・下書き公開・外部連携の回帰、バックアップと切戻しの確認が必要。
旧登録・勤怠再計算・紹介メールの対策案であるDraft PR #1は別途未適用。

Supabase Security Advisorsも読み取りで確認。RLS有効でポリシーなしの内部テーブル7件は
通常ロールを拒否する用途の可能性があり、無条件ポリシーを追加しない。
`set_application_workflow_timestamps`のsearch_path未固定、漏えいパスワード保護未設定も確認。
設定変更・有料機能の有効化はしていない。

参考:
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## 再実行と成果

[ラボ手順](../tools/restore-lab/README.md)、[生成SQL](database/restore-candidate/application-review.sql)、
[マニフェスト](database/restore-candidate/manifest.json)、[実行結果](database/restore-candidate/lab-result.json)。
生成SQLは明示的なローカル指定を要求し、通常は最後にROLLBACKする。SQL本文の検証は有効。
ラボ内のバックアップ試験だけ、接続情報を持たないメモリDBにCOMMITしてexport/reloadする。
実体は破棄し、GitHubには架空試験の結果・コード・定義のみを保存する。

## 完了判定と残り

|引き継ぎ条件|現在|
|---|---|
|アプリ定義の収録|private依存・列権限を補完済み。将来の追加オブジェクトにも追従が必要|
|空DBへのアプリDDL適用|PGliteで実行成功。Supabase標準環境での適用は未完了|
|権限・業務処理|限定69項目成功。全操作・全Functions・全画面E2Eは未完了|
|架空データのバックアップ再読込|PGliteで成功。ネイティブpg_dump/pg_restoreは未完了|
|実データの暗号化バックアップ|保管先・鍵管理・責任者・保持期限・RPO/RTOが未決定。未取得|
|本番セキュリティ改善|対策案のみ。承認・適用・本番事後確認は未実施|
|独立した管理権限と復旧手段|MFA・予備管理者・外部契約/Secrets移管の受け入れ確認が残る|
|第三者による実演|未実施。文書だけで完全引き継ぎ可能とはしない|

次回は本記録から開始し、ブランチ先頭を確認する。無料のローカル試験は引き続き可能。
有料化は必要条件ではない。本番変更を行う場合は具体的な適用案と影響を提示して承認を得る。
