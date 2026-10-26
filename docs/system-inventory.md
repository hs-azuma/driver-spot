# 構成・管理台帳
調査日: 2026-10-27。調査対象コミット: 367a69d5638ad35008fdc71f7c0c2844cfc0a791。

## 確認済み
|対象|構成・確認事項|管理上の制約|
|---|---|---|
|ソース|GitHub hs-azuma/driver-spot、Public、main|個人所有。接続APIでAdmin=trueを確認。法人への移管は未実施|
|本番画面|spodora.com、GitHub Pagesの公開成功履歴、CNAMEあり|main変更で公開。公開前の全テスト必須化は未実施|
|本番接続先|wyxuekjikvflpcmlliwn.supabase.co|公開画面・ソース双方で確認。現在の管理用接続には権限なし|
|別システム|AI経営管理はbjzbmmisugnqfuyzmxpu|接続先は別。スポドラDBの専用性は内部確認が必要|
|画面|ルートHTML、assetsの共通JS/CSS、areas.js|ビルド不要。ローカル画面も本番接続になる|
|バックエンドソース|supabase/functionsの8ディレクトリ|実デプロイとの一致は未確認|
|DB変更|sqlとsupabase/schema|基礎スキーマ・適用順・適用履歴が不足|
|通知|Resend、LINE、Supabase Auth|契約者・請求先・DNS設定・本番秘密情報の所在は未確認|

## 機能ソース
account-auth / application-result-email / company-job-invite / delete-account /
email-unsubscribe / line-account / line-notifications / line-webhook。
画面から呼ぶshare-driver-spot-emailはソース未収録。実環境からの取得が必要。

## 秘密情報の「名前」のみ
Edge Functions: SUPABASE_URL、SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY、
RESEND_API_KEY、LINE_CHANNEL_ACCESS_TOKEN、LINE_CHANNEL_SECRET。
GitHub Actions: SUPABASE_ACCESS_TOKEN、RESEND_AUTH_API_KEY。
一覧はソース上の参照であり、実際の登録・有効性を確認したものではない。
公開用キーとサーバー秘密鍵は区別する。値をこの台帳へ記載しない。

## 所有者が確認する項目
- スポドラSupabaseの所有組織、管理者2名以上、MFA・復旧手段、プラン・請求先。
- ドメイン登録会社・契約者・更新期限・DNS管理者。
- Resend/LINEの所有者・請求先・サーバー設定・移管方法。
- GitHub Pages設定、GitHub Secrets、ブランチ保護、履歴の秘密情報検査。
- DB、Auth、Storage、定期実行、Webhook、RLS、関数権限の実環境一覧。

現在のSupabase接続で確認できる組織は「浪速運送 AI経営管理」。
スポドラのデータ移行が必要という意味ではなく、まず既存所有者の管理アクセスを確認する。
