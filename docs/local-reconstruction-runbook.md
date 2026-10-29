# ローカル再構築・バックアップ復元手順

最新: [再構築の実行検証](v4-reconstruction-validation-20261029.md)。
Docker不要の[補助ラボ](../tools/restore-lab/README.md)で、54関数を含むDDL適用と69項目の検証が成功。
以下の「DB試験未実行」は初回環境確認時点の記録。ネイティブSupabase/本番実データの復元は引き続き未完了。

更新: 2026-10-29 JST。状態: 準備中。完全再構築・実データ復元は未成功。
対象ブランチ: `docs/v4-restore-readiness-20261029`。本番へ適用しない。

## 入口と実行できる検査

Node 24.22.1 / Python 3.12を使い、clone先ルートで実行する。

```sh
npm test
python3 -B scripts/restore-audit.py
python3 -B scripts/local-backup-drill.py
```

上からオフライン回帰テスト、保存定義の整合性検査、隔離コンテナ内の架空データによる
pg_dump/pg_restore往復試験。3番目だけDockerと事前取得済み`postgres:17.6`が必要。
コンテナ実行基盤は無料で利用可能なものを選び、企業利用時のライセンスを確認する。
このスクリプトはイメージを自動取得しない。コンテナはネットワークなし、公開ポートなし、
ホストのマウントなし、使い捨てメモリ領域のみ。終了時に自分が作ったコンテナだけ削除する。
本番接続文字列、APIキー、データファイルを受け取る入口はない。

`PASS_METADATA_ONLY`は定義の整合性だけ、`PASS_SYNTHETIC_ONLY`は架空テーブルの往復だけを示す。
どちらもスポドラ復元成功を意味しない。Dockerがない場合は終了コード2で停止する。
2026-10-29の本環境ではDocker・psql・postgres・Supabase CLIがなく、DB試験は未実行。

## 完全再構築の順序と停止条件

|段階|作業|合格条件・停止条件|
|---|---|---|
|1|Supabase CLIとDocker互換基盤を用意。バージョンを固定して記録。CLIの`--help`で操作を確認|本番へのlink、push、deployは禁止。追加クラウド作成なし|
|2|アプリとは別の空ディレクトリでローカルSupabaseを初期化|既存リポジトリのsupabase/functions・schemaを上書きしない|
|3|PostgreSQL 17とAuth/Storageバージョンを確認。localhost限定・外部送信遮断|本番は17.6.1.166。メジャーや管理テーブルの差があれば停止|
|4|拡張配置・標準スキーマ・標準ロールを確認|read-restore-metadata.sqlの結果と照合。標準管理オブジェクトを手作業で代替しない|
|5|不足DDLを取得し、レビューしたローカル専用構築SQLを作成|既存sql/*.sqlをファイル名順に流さない。初期テーブル定義を含む完全DDLはまだ未確定|
|6|内部スキーマ、型、テーブル・IDENTITYを作成|7シーケンスはいずれもIDENTITY所有。別途CREATE SEQUENCEすると二重作成になる|
|7|非FK制約→内部関数と公開ラッパー→FK・追加索引→トリガーを依存順で適用|SQL関数の参照先と%rowtypeを検証。循環依存は個別に解決し、本文検証の無効化を成功扱いしない|
|8|RLS・ポリシー・所有者・ACL・デフォルト権限を復元|Supabase標準のデフォルトGRANTが余分に残らないこと。null ACLはアクセス禁止を意味しない|
|9|Auth独自トリガー2件を追加|標準Authトリガーを削除・二重登録しない。登録前後の企業・運転者分離を確認|
|10|架空ユーザー・企業・求人・応募・勤怠を作成|メール・LINE・cron・Webhooks・Functionsワーカーは停止状態|
|11|DDLと権限を再取得して比較。機能・拒否試験|件数一致だけでは不十分。定義・所有者・ACL・実際のアクセス結果を比較|
|12|隔離DBをバックアップし別の隔離DBへ復元|下記受け入れ表を満たすまで「復旧可能」としない|

### 残っているDDL取得

テーブル・列ACLのgrant option/付与者、シーケンス所有関係と設定、拡張配置、
スキーマACL、デフォルトACL、public外オブジェクト、ビュー、イベントトリガー、
publication、cronの必要性を照合する。シーケンス所有・テーブルACL・拡張配置は今回取得済み。
public関数32件の本文MD5は保存カタログと全件一致。
内部関数21件は本文を保存しているが、今回の監査は内部関数の本番との再照合ではない。
`internal.sequences`はpublicの7件を重複収録しているため別物として扱わない。

## 実データバックアップの準備

公式手順のroles/schema/data分離を基準にし、使用CLIの`db dump --help`で仕様を確認する。
Supabase標準オブジェクトの扱いが異なるため、生のpg_dump全体をそのままSupabaseへ戻さない。
この文書に本番の接続情報・秘密値は記載しない。

バックアップは利用者データを含む。暗号化保管先、鍵の別管理、実行責任者、保持期限、
RPO/RTOが未決定のため、今回は本番実データを取得していない。
DB/Auth、Storage実ファイル、Functions、Auth設定、Secrets、DNS、Resend/LINE設定は別管理する。
GitHubにはDDL・架空データ・個人情報のない検証結果だけを置く。
暗号化後のハッシュ、取得時刻、対象範囲、ツール版、復号・復元の成功を記録する。
キューとcronは復元前から外部送信を遮断し、古い未送信通知を復元後に自動再送しない。

## 復元の受け入れ表

|確認|必要な証拠|
|---|---|
|定義|22テーブル、239列、97制約、54索引、40ポリシー、12トリガー、53関数、Authトリガー2、IDENTITY7の定義比較|
|採番|既存IDより大きいIDでINSERT成功、バックアップ復元後も衝突なし|
|認証|企業メール未確認/確認済・運転者・ログインID・復旧導線。旧トークンの扱いも明記|
|求人・応募|公開求人閲覧、所有企業だけ変更、他社・他人の応募操作拒否|
|勤怠|本人打刻・企業修正・理由履歴・日またぎ・丸め・二重実行|
|RLS|未ログイン、本人、別ユーザー、別企業、service_roleを分けてSELECT/INSERT/UPDATE/DELETEとRPCを検証|
|通知|キュー作成と送信を区別。外部メール・LINEへの送信ゼロを確認|
|バックアップ|別DBへの復元、データ件数/内容、制約、所有者、権限、採番、Auth、Storage実体の検証|
|第三者|チャット履歴なしでREADMEから再現し、証跡と所要時間を記録|

## 参考資料

- https://supabase.com/docs/guides/local-development
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://supabase.com/docs/guides/local-development/restoring-downloaded-backup

2026-10-29に公式ドキュメントとchangelogを確認。CLI/イメージの版が未固定のため、
ここではローカルSupabaseの起動設定を確定済みとはしていない。
