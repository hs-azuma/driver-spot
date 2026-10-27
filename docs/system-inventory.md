# 構成・管理台帳
更新日: 2026-10-27。最新の詳細は[第4版引き継ぎ](spodora-v4-handoff.md)と[Functions照合結果](edge-functions-audit-20261027.md)を参照。

## 確認済み
|対象|構成・確認事項|管理上の制約|
|---|---|---|
|ソース|GitHub hs-azuma/driver-spot、Public、main|個人所有。接続APIでAdmin=trueを確認。法人への移管は未実施|
|本番画面|spodora.com、GitHub Pagesの公開成功履歴、CNAMEあり|main変更で公開。公開前の全テスト必須化は未実施|
|本番接続先|wyxuekjikvflpcmlliwn.supabase.co|公開画面・ソース双方で確認。再接続後に管理APIアクセスを確認|
|別システム|AI経営管理はbjzbmmisugnqfuyzmxpu|接続先は別。スポドラDBの専用性は内部確認が必要|
|画面|ルートHTML、assetsの共通JS/CSS、areas.js|ビルド不要。ローカル画面も本番接続になる|
|バックエンドソース|supabase/functionsの10ディレクトリ|本番10件と照合。既存8件は処理一致、未収録2件は回収・保存済み|
|DB変更|sqlとsupabase/schema|基礎スキーマ・適用順・適用履歴が不足|
|通知|Resend、LINE、Supabase Auth|契約者・請求先・DNS設定・本番秘密情報の所在は未確認|

## 機能ソース
account-auth / application-result-email / company-job-invite / delete-account /
email-unsubscribe / line-account / line-notifications / line-webhook。
share-driver-spot-emailおよび無効化済みline-setup-onceも本番から回収・収録済み。

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

スポドラの所属組織はDRIVER SPOT。Team画面でログイン中アカウントのOwner表示、画面上1名・MFA×を確認。無料プランにSupabase定期バックアップは含まれない。ユーザー意向によりPro変更は見送り。外部手動バックアップ・復元訓練は未実施。publicの22テーブルはRLS有効だが、権限の安全性は別途検証が必要。

旧企業登録・勤怠再計算・紹介メールの改善案は[Draft PR #1](https://github.com/hs-azuma/driver-spot/pull/1)。未マージ・本番未適用。
