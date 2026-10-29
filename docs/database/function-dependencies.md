# DB関数と内部依存関係の取得結果
確認日: 2026-10-29。既存本番の読み取りのみ。

[取得定義JSON](function-dependencies-20261029.json) / [再取得SQL](read-function-dependencies.sql)

## 今回取得したもの
- publicの関数32件: 本文、署名、所有者、ACL。
- spodora_private / spodora_job_counts / spodora_reviewsの内部関数21件とスキーマ権限。
- publicのシーケンス7件: 型・開始値・増分・最大最小値等。現在値は取得しない。bigint最大値はJSONの数値丸めを避けるため文字列保存。
- auth.usersのカスタムトリガー2件。
- イベントトリガー7件の登録情報。
- publicスキーマとデフォルト権限。publicのpublicationテーブル登録は0件。
- 上記spodora内部スキーマのテーブル・ビュー・シーケンスは今回の一覧で0件。関数はpublicテーブル等を利用する。

## 復元で落としてはいけない経路
|入口|内部依存|役割|
|企業メール確認|auth.usersトリガー → spodora_private.finish_confirmed_company_registration|確認後の企業登録|
|ドライバー作成|auth.usersトリガー → public.create_driver_profile_from_auth|プロフィール作成|
|QR・勤怠修正・給与確認|public関数 → spodora_private|本人・勤務の処理|
|勤務評価|public.submit_work_review → spodora_reviews.submit_work_review|双方評価|
|公開求人の採用人数|public.get_job_hiring_counts → spodora_job_counts.hired_counts|採用人数集計|
|通知|spodora_private内のキュー作成・取得 → Functions|メール・LINEの対象作成|

## 依然未完了
- 関数定義だけではテーブル・制約・索引・シーケンス所有関係の完全DDLにならない。
- システム由来のイベントトリガーの関数本文は対象外。Supabase標準環境との照合が必要。
- 個別関数間の依存順、拡張配置、ロール・所有者・ACLの再現と検証。
- Auth設定・Secrets・通知サービスの設定とDB外の管理情報。
- 実データバックアップ・安全な保管・復元訓練。
- 認可不備の修正案はDraft PR #1にあり、本取得は改善実施を意味しない。

## 安全な利用
JSONのdefinitionは本番取得のコードであり、新しいDBや本番へ自動実行しない。SECURITY DEFINER・トリガー・外部送信の依存をレビューし、通知停止した検証先でのみ再構築順を検証する。公開リポジトリに本番データ・認証キーを保存しない。
今回は関数本文を閲覧し、代表的キー形式と長い文字列・認証情報関連の文字列を確認してから保存した。秘密値は含めていない。
Pro変更、本番設定変更、新規クラウドDB作成、DB移行、メール・LINE送信は行っていない。
