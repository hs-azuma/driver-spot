# 隔離再構築ラボ

最新の[暗号化復元・再現検証](../../docs/v4-encrypted-backup-handover-20261029.md)では260項目が成功。
お気に入り・ブロック・評価・キャンセル保護・通知キュー・給与確認・QRを追加。
修正案は本番未適用。`lab-result.json`に実行時刻・検査項目・ソースSHA256と既知の問題を記録する。

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
- 完了済み応募DELETEの履歴保護案と通常応募キャンセルの継続、求人制限と合わせた切り戻し。
- 相互評価の双方保持、お気に入り/ブロックの所有者制限、給与確認・保証金額、QR再発行。
- DB通知キューの期限/回数上限/宛先変更/再試行リース。複数接続の競合試験は対象外。
- 匿名勤怠再計算・旧登録の認可、取消求人/初期状態の制限、修正案の組合せで給与/QRを再検証。
- 退会時の業務履歴保持、同一Auth DELETE内のプロフィール削除とエラー時の復元、日またぎ勤務の重複。
- 架空DB/SQL/設定ひな形の暗号化・復号・復元、誤鍵/改ざん拒否。鍵とバックアップ実体は保存しない。

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
`sql/review-v4-application-delete-guard.sql`と`sql/review-v4-hardening-rollback.sql`もレビュー専用。
新しいアクセス制限/切り戻しSQLは`python3 -B scripts/build-access-review.py`で保存定義から再生成する。
夜間の制限/切り戻しは`python3 -B scripts/build-integrity-review.py`で再生成する。
ソースだけを別フォルダに移した再現試験は`python3 -B scripts/verify-handover.py`。依存導入に既存npmキャッシュを使う。
