# スポドラ

スポットドライバーと企業の求人・応募・勤怠管理サービス。
本番: https://spodora.com / ソース: hs-azuma/driver-spot

## 第4版の最新引き継ぎ地点

[63項目の総合チェックリスト](docs/handover/transfer-checklist-20261105.md)、[残項目の実施条件](docs/handover/completion-gates-20261106.md)、[追加調査と地域の修正候補](docs/handover/free-preparation-20261106.md)から再開してください。

[以前の8項目の台帳](docs/v4-eight/README.md)と[再開手順](docs/v4-eight/resume.md)に検証経路を記録しています。
現在の結果と検証したソースは[8項目の状態](docs/v4-eight/status.json)で確認できます。
画面と実DBの結合、10 Functionsのstrict型検査、依存固定、バックアップ用ツール、読み取り診断、運用案を対象にしています。
旧自動書き換え2件は承認範囲でmainへ適用済みです。[適用記録](docs/handover/workflow-retirement-applied-20261106.json)を参照してください。保存・退会・匿名化の運用案はレビュー用の準備です。
外部SDK型宣言の互換性制限は[型検査のREADME](tools/edge-check/README.md)に記録しています。

[2026-10-31の16項目](docs/v4-sixteen/README.md)は前回の検証履歴です。
架空データの検証成功は、実データのバックアップ、全サービスの移行、実機・実配信、第三者本人の受領を意味しません。
実データの扱いと本番適用の条件は、引き続き承認待ちです。

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
