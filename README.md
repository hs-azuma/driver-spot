# スポドラ

スポットドライバーと企業の求人・応募・勤怠管理サービス。
本番: https://spodora.com / ソース: hs-azuma/driver-spot

## 第4版の最新引き継ぎ地点

[2026-10-31 残る16項目の実行台帳](docs/v4-sixteen/README.md)から再開してください。
現行の追加試験は進行中。旧成功記録だけで現行の変更を合格とは扱わない。
鍵管理と実受け入れの保留条件は[前段階の進捗](docs/v4-three-track-progress-20261029.md)を参照。
54関数を含むアプリDDLと264項目を無料の隔離ラボで検証済み。
通常の応募確認画面37件を含むNode160件、隔離Chromiumで38ケースも成功。
実SDKと架空HTTPの33ケースも成功。無料の使い捨て環境で実Auth/DB/Storageと暗号化DB/Storage本体復元の69項目も成功。
iPhone/Android実機の結合確認は未完了です。
業務51ケースを追加。依存台帳・実行環境判定・第三者向け自動点検を整備。
実行用SDKの可変指定は0。全サービスの復元と第三者本人の受け入れは未完了です。
本番適用の条件は未充足です。
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
