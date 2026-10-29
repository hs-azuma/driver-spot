# 本番Edge FunctionsとGitHubの照合

2026-10-29の作業ブランチでは、紹介メール関数に410停止案を準備したため、本番取得時の内容から意図的に変更している。
この停止案は本番未適用。[最新検証](v4-access-and-state-validation-20261029.md)を参照。
以下は2026-10-27に取得した本番との照合履歴であり、修正案のデプロイ成功を表すものではない。
確認日: 2026-10-27（日本時間）
比較元GitHubコミット: 707355188008f9f05ace2acc93f43d8d1da82cf6
対象: 既存スポドラ本番プロジェクト。管理APIで取得したソースファイルを比較した。

|Function|本番version|照合結果|
|---|---:|---|
|application-result-email|19|末尾の空行のみ相違|
|share-driver-spot-email|5|本番から新規収録|
|delete-account|4|完全一致|
|line-webhook|3|完全一致|
|line-account|5|完全一致|
|line-setup-once|4|本番から新規収録|
|line-notifications|2|完全一致|
|email-unsubscribe|1|完全一致|
|company-job-invite|3|末尾の空行のみ相違|
|account-auth|6|完全一致|

既存8件の取得ファイルに処理内容の差なし。application-result-email/common.tsとcompany-job-invite/common.tsは本番側に末尾改行が1つ多い。GitHub側を上書きしていない。
未収録2件のindex.tsを本番取得内容のまま追加。秘密鍵の埋め込みがないことをコード閲覧・代表的トークン形式検査で確認。メール・LINE送信、本番デプロイ、DB変更はしていない。

## 再公開時の注意
- line-setup-onceはHTTP 410を返す無効化済みコード。過去の診断処理を復活させない。本番verify_jwt=true。
- 他の9件は本番verify_jwt=false。これは各関数内での認可の有無とは別。再公開時には既存設定と各処理の認証方法を確認する。
- share-driver-spot-emailには認証・送信回数制限の不足という未解決課題がある。収録は改善済みを意味しない。利用箇所・既存仕様を調べて改善案を用意する。
- 本比較は取得されたソースファイルの照合。ランタイム、Secretsの値、Auth設定、DB権限、通知の実動作まで一致検証したものではない。
- バックアップは依然未整備。Freeに定期バックアップが含まれないことは管理画面で確認済み。契約変更・外部バックアップ作成・復元テストは未実施。
