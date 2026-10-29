# 新規登録の確認メール（日本語）

## 状態

2026-10-06 16:18 JST、本番に日本語の確認メールと Resend SMTP を適用し、取得し直した設定値の照合に成功しました。
実際のメール受信と確認リンクによる登録完了は、まだ確認していません。
実行記録: https://github.com/hs-azuma/driver-spot/actions/runs/37424038211 （attempt 3、成功）。
件名: 【スポドラ】メールアドレスの確認。送信者: スポドラ <noreply@spodora.com>。
GitHub Actions の成功は設定値の照合を意味し、メールの受信確認とは区別します。

## 一度だけ必要な接続設定

リポジトリ hs-azuma/driver-spot の Settings → Secrets and variables → Actions に登録します。
鍵をチャット、ソース、ログに貼らないでください。

- `SUPABASE_ACCESS_TOKEN`: この本番プロジェクトの Auth 設定読み取り・更新を許可する管理トークン。利用できる場合は対象プロジェクトを限定した fine-grained token を使用します。必要権限は公式の GET/PATCH Auth config API を確認してください。
- `RESEND_AUTH_API_KEY`: 送信元 spodora.com に限定した Sending access の Resend キー。custom SMTP が未設定の場合だけ使用します。既に SMTP が設定されていれば不要です。

spodora.com は 2026-10-06 に Resend の verified / sending enabled を確認済み。
初回登録後、Actions の「Apply Japanese signup email」を再実行します。
以後、main に確認メールの JSON を更新すると自動適用し、取得し直して照合します。
管理トークンの失効・権限不足などは実行結果で確認できます。

## 処理の範囲

`scripts/apply-auth-email.py` は固定した本番プロジェクト wyxuekjikvflpcmlliwn にのみアクセスします。
変更は確認メールの件名と本文の2項目です。custom SMTP が未設定の場合は、Resend SMTP と
送信元「スポドラ <noreply@spodora.com>」も設定します。既存 SMTP は変更しません。
メール認証、登録可否、リダイレクト URL、他のメールテンプレートは変更しません。
設定取得結果・トークン・SMTP パスワードはログに出しません。API のリダイレクトも許可しません。

## 完了確認

1. Actions の適用と読み戻し照合が成功していること。
2. テスト登録で届いたメールの件名・本文・確認リンクが日本語であること。
3. 確認リンクから登録が完了すること。

## 継続作業の方針

既存コネクターと自動処理の結果を先に確認し、画面の案内・スクリーンショット依頼を繰り返さない。
コードの準備、実設定への適用、実際の受信確認を分けて記録し、未確認の作業を完了と報告しない。
この自動処理は Auth 確認メール用です。他の管理作業も同じ権限でできるとは判断しません。

## 公式資料

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/reference/api/v1-update-auth-service-config
- https://resend.com/docs/send-with-supabase-smtp
