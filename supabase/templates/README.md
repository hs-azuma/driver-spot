# 登録確認メールの日本語テンプレート

## 反映状態
2026-10-06：準備済み。本番のSupabase Auth設定には未反映。
GitHub Pagesへの公開だけではAuthメール設定は変更されない。

## 適用対象
Supabaseプロジェクト wyxuekjikvflpcmlliwn の Confirm sign up テンプレート。
件名：【スポドラ】メールアドレスの確認
本文：confirm-signup-ja.html
Management APIの変更内容：confirm-signup-ja.json（上記2項目のみ）。

## 適用と確認
既存の正規管理アクセスを確認し、DashboardのEmail Templatesから件名と本文を保存、
または公式Management APIのconfig/authにJSONをPATCHする。
認証・SMTP・確認メールの有効/無効・リダイレクト設定は変更しない。
ConfirmationURLのプレースホルダーを保持する。
保存後に設定を読み直し、件名・本文が一致することを確認する。
確認メールの実送信では日本語件名・本文・リンク表示と正常なメール確認を確認する。

## ユーザーのアクセスに関する指示
既存の接続と過去に成功した方法を先に確認し、同じログイン・許可要求を繰り返さない。
実行を確認できていない設定変更を完了と報告しない。

公式仕様：https://supabase.com/docs/guides/auth/auth-email-templates
