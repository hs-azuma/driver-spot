# 第4版の再開記録（2026-10-29 JST）

## 基準

- main: `41d6223854a780713686d02ae73d028eb17aa2c4`
- 引き継いだ作業ブランチ: `docs/v4-restore-readiness-20261029`
- 開始コミット: `5df78865bd6d7f308a1a4d8c39f869674985f19c`
- Supabase driver-spot / wyxuekjikvflpcmlliwn: 読み取りでACTIVE_HEALTHY、PostgreSQL 17.6.1.166を確認。
- 本番サイト・DB・Auth設定・Secrets・課金・公開設定は変更していない。

## 追加成果

1. `database/restore-metadata-20261029.json`: IDENTITY7件の所有テーブル/列・依存種別・ACL、22テーブルの所有者/ACL、7拡張の配置を取得。利用者行・認証情報・シーケンス現在値は取得していない。
2. `scripts/restore-audit.py`: 保存定義の欠落、public関数本文MD5、RLS、IDENTITY所有、ACL/拡張配置の収録範囲をオフライン検査。
3. `database/restore-audit-20261029.json`: 検査結果と元資料SHA256。PASS_METADATA_ONLY、エラー0。
4. `scripts/local-backup-drill.py`: ネットワーク/ポート/ホストマウントなしの使い捨てコンテナで架空データのpg_dump/pg_restoreを行う試験コード。アプリ復元試験ではない。
5. `local-reconstruction-runbook.md`: 完全再構築の段階、停止条件、実データ保管条件、認証/RLS/勤怠/採番/通知の受け入れ手順。
6. 新しい5テストを既存npm testに組み込み。CIは既存設定のままこの検査を実行できる。

## 検証結果

- `npm test`: Node 48テスト、Python既存6＋新規5テスト、HTML内JS20件、すべて成功。
- `python3 -B scripts/restore-audit.py`: メタデータ整合性成功。53関数中public32件の本文MD5がカタログと一致。
- `python3 -B scripts/local-backup-drill.py`: 終了コード2。Docker未導入のため処理前に停止。架空データ往復・アプリ再構築・実データ復元は未実施。
- `git diff --check`: 成功。

## セキュリティ上の確認事項

SECURITY DEFINERかつPUBLIC実行権限が明示またはデフォルトで残る関数を10件抽出。
トリガー専用/イベントトリガー用関数も含むため、10件すべてを悪用可能な脆弱性と判定したものではない。
各関数の直接呼び出し可否、引数、本人確認、search_path、最小権限を検証する必要がある。
既存Draft PR #1は今回未適用・未再検証。本番権限は変更していない。

## 次回の開始点

1. この記録と`local-reconstruction-runbook.md`を読む。ブランチ先頭とmainとの差分を再確認。
2. 無料Docker互換基盤が使える隔離実行環境で架空データ往復試験を実行。
3. Supabase CLI/PG17/Auth/Storageの版を固定し、空DB初期構築DDLと依存順を確定。現状のスナップショットをそのまま実行しない。
4. ローカルで全アプリオブジェクトを再構築し、権限とRLS拒否試験。PR #1もここで検証。
5. 暗号化保管先・鍵管理・責任者・保持期限・RPO/RTOを決めてから実データバックアップへ進む。
6. 第三者の実演・契約者/MFA/予備管理者確認後に完全引き継ぎ判定。

未完了を完了扱いにしない。本番への適用・公開・重要設定変更は所有者の事前承認を要する。
