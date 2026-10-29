# スポドラ

スポットドライバーと企業の求人・応募・勤怠管理サービス。
本番: https://spodora.com / ソース: hs-azuma/driver-spot

## 第4版の最新引き継ぎ地点

[2026-10-29 業務検証と履歴保護](docs/v4-business-validation-20261029.md)から再開してください。
54関数を含むアプリDDLと152項目を無料の隔離ラボで検証済み。
本番変更・実データバックアップ・Supabase全サービスの復元・第三者受け入れは未完了です。
[再実行手順](tools/restore-lab/README.md)と[残作業](docs/handoff-backlog.md)を参照してください。

## 開発・保守の入口

- [第4版・仕様と開発方針](docs/spodora-v4-handoff.md)
- [第三者への引き継ぎ受け入れ手順](docs/handover-acceptance.md)
- [構成・管理台帳](docs/system-inventory.md)
- [開発・検証・公開手順](docs/development-runbook.md)
- [障害・バックアップ・復旧手順](docs/recovery-runbook.md)
- [引き継ぎ課題と優先順位](docs/handoff-backlog.md)
- [実運用前の法的確認事項](docs/implementation-legal-checklist.md)

## 検証

Node.js 24.22.1、Python 3.12を使用。追加npm依存のインストールは不要。
リポジトリのルートで `npm test`（または `node scripts/check.mjs`）。
モックを使った検証と構文検査だけを実行し、DB・認証設定の変更やメール・LINE送信は行わない。
実際のiPhone/Androidでの顔認証、カメラ、メール受信の動作を保証するものではない。

静的HTML/JavaScriptのため、ビルドは不要。現在、mainへの変更はGitHub Pagesで公開される。
画面をローカルで開くと本番Supabaseへ接続するため、ログイン・登録・応募・打刻を試す検証環境として使用しない。

## 管理原則

第三者が開発・保守・運用を引き継げることを前提にする。
仕様変更は関連文書・テストも更新し、未確認事項を確認済みと扱わない。
本番DB・認証・通知・契約・所有権・公開方法の重要な変更は事前に説明する。
秘密鍵・パスワード・個人情報・本番バックアップをリポジトリへ置かない。

現行SQLは追加変更の記録であり、空のDBを構築する完全なマイグレーションではない。
