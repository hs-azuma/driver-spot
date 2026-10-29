# ネイティブSupabaseの再開条件

2026-10-29。**このホストでの実行・復元は未完了**。本番や有料クラウドを代用にしない。

## 現在の証拠

```sh
python3 -B scripts/native-preflight.py
```

結果はdocs/native-preflight-20261029.json。未充足時の終了コード2は復元成功ではない。
実行ファイルの有無、glibc、非root実行、ユーザー名前空間を読み取り/子プロセスで確認するだけ。
サービス・コンテナ・ユーザーは作成せず、権限拡張・接続文字列の入力も行わない。

本ホスト: Linux x64、Docker/Podman/psql/CLIなし。UIDマッピングはroot1件のみ。
非rootへの切替はEINVAL、ユーザー名前空間作成も失敗。

## Dockerなしの選択肢も調査済み

公式資料にはCLI2.119.0以降の実験的stack/nativeランタイムがある。
「Dockerがないから必ず不可能」とは扱わない。
ただしPostgres initdbはrootで動かず、rootの場合は非rootアカウントの実行が必要。
このホストの制約ではその条件を満たせないため、CLI/サービス本体を大容量取得して強行しない。
CLI候補2.122.0は公開npmメタデータで確認しただけで、インストール/--help/サービス起動は未実施。

## 別の対応環境で確認する順序

1. 既存の対応Linuxで、非root実行とglibc、tar、ディスク容量を確認。新しい有料VMは作らない。
2. 公開CLIの候補版を固定し、--versionと--helpで実際のコマンドと対応状況を確認する。
3. `supabase init --help`、`supabase stack --help`、`supabase stack start --help`、`supabase stack stop --help`を確認する。
4. リポジトリの既存supabaseディレクトリとは別の空の作業ディレクトリを用意する。
5. 確認した版の設定でexperimental stack/nativeを明示し、専用SUPABASE_HOMEに状態を隔離する。
6. DB17、localhostのみのポート、外部送信禁止、SMTP/LINE/Resend/cron/worker停止を確認してから起動する。
7. CLIが取得するアーカイブの版/チェックサムを保存し、DB/Auth/PostgREST/Storage/Edgeの実行版を記録する。
8. ローカルの架空ユーザー・データのみで、復元候補DDL・権限・Authトリガーを段階適用する。
9. 本人/他人/匿名の拒否、退会の原子性、Storage所有物、複数接続の採用/夜勤/通知キューを確認する。
10. 暗号化バックアップ→復号→別の隔離DB復元と、pg_dump/pg_restoreの結果を記録する。
11. 自分が作った検証スタックだけを停止する。共有スタックを一括停止/破棄しない。

CLIの仕様は実験的で変わるため、未確認の起動スクリプト/設定を実行可能な完成品として置いていない。
本番link/push/deploy、実データ輸入、実送信は上記手順に含めない。
ローカルのsecret/service keysも公開GitHubへ置かず、試験用の非公開一時ファイルで扱う。
本番の実データバックアップは別の保管/鍵/保持の決定が先。

公式: https://supabase.com/docs/guides/local-development/docker-and-native-runtimes
https://supabase.com/docs/guides/local-development/running-multiple-local-projects
https://supabase.com/docs/guides/local-development
