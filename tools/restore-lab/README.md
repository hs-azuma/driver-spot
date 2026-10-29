# 隔離再構築ラボ

DockerなしでPostgreSQLのアプリDDLを検証する無料の補助環境。
PGlite 0.3.14（PostgreSQL 17.5 / WebAssembly）を固定し、lockfileを収録。
本番17.6.1.166やSupabase全サービスと同じ環境ではない。

リポジトリのルートで実行する。

```sh
python3 -B scripts/build-restore-candidate.py
npm ci --prefix tools/restore-lab --ignore-scripts --no-audit --no-fund
npm --prefix tools/restore-lab test
npm test
```

初回のnpm ciだけパッケージ取得のネットワークを使う。DB検証は接続先URLを受け取らず、
パスなしのPGliteをメモリ上に作成する。SQLはローカルファイルから読み、
本番SDK、通知ワーカー、HTTPクライアントは読み込まない。APIキーやDBパスワードは不要。
ルートのnpm testはパッケージ不要のオフラインテスト。ラボは上記コマンドで別に実行する。

## 何を確認するか

- 22テーブル、239列、97制約、54索引、40ポリシー、publicトリガー12件とAuthトリガー2件、54関数。
- PK/UNIQUE由来の31索引と追加23索引を区別。7つのIDENTITYはテーブルと同時作成し、二重作成しない。
- 保存カタログとの定義・RLS・関数本文ハッシュ・テーブル権限・関数権限の比較。
- 21列の個別SELECT権限。所有者だけのアクセス、他人の更新、他社勤怠修正の拒否。
- 運転者のAuth登録トリガー、企業の確認後登録トリガー、企業名同期。
- 本人以外での応募拒否、日またぎ勤怠の丸め、修正履歴。
- 現行の匿名求人登録の問題と、レビューSQL適用後の匿名/他社拒否・自社登録成功。
- 全DDLのROLLBACK後にオブジェクトが残らないこと。
- 同じDDLの再構築、架空データだけのメモリ内確定、PGliteデータディレクトリをgzipでexport/reload。
- 再読込後のカタログ、架空データ、企業名同期結果、自動採番の継続。採番の欠番は正常として扱う。

出力は`docs/database/restore-candidate/lab-result.json`。
バックアップの実体はメモリ上だけで保持して破棄し、サイズとSHA256のみ結果に記録する。
実行時刻などによりバックアップのハッシュは毎回変わり得る。

## 成功の意味と限界

成功ステータスにも`WITH_KNOWN_FINDINGS`が含まれる。現行の権限問題を直したという意味ではない。
Authは小さなテーブルとauth.uid()の模擬実装。HTTP認証、パスワード、JWT検証、
WebAuthn、SMTP/LINE、Supabase標準イベントトリガー、拡張、cron、Storageは対象外。
バックアップはPGlite専用の架空データ再読込試験で、pg_dump/pg_restoreや本番復元の証明ではない。
実データ保管、ネイティブSupabaseでの検証、第三者受け入れを終えるまで完全引き継ぎ完了としない。

`sql/review-v4-job-insert-hardening.sql`もローカルでのみ試す。本番適用は所有者の事前承認が必要。
