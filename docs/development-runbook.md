# 開発・検証・公開手順

## 再現
1. GitHubからリポジトリをcloneする。
2. Node.js 24.22.1（.nvmrc）とPython 3.12を用意する。Windowsはpython、その他はpython3コマンドを利用。
3. ルートでnpm testを実行。追加npmパッケージは不要。
4. Nodeテスト、Pythonモックテスト、HTML内JSの構文検査がすべて成功することを確認。

scripts/check.mjsは固定のオフライン検証だけを起動する。sql/testsは実DBを前提とするため実行対象外。
SQLは本番で試さず、再現した検証DBで所有権・RLS・通知まで確認する。
Deno/Edge Functionsの全型検査と全画面E2Eは未整備。実機確認も別途必要。

## 変更
- 作業ブランチで変更し、対象の仕様・テストを更新する。
- npm testを実行し、失敗時は本番実装とテストのどちらが原因か確認する。
- 外部AI・開発会社もREADMEから同じ手順を利用する。
- 新しい管理アカウントを共用せず、担当者別に最小権限を付与する。

## 現在の公開
mainを更新するとGitHub Pagesの公開処理が動く。
既存のActionsには認証設定を書き換えるものとソースを書き換えてpushするものがある。
.github/workflowsとscriptsの変更は通常の画面修正と分けて影響を確認する。
現状、全テスト成功が公開条件ではない。CI・ブランチ保護・公開ゲートは別途整備する。

## 公開後
Actionsの公開成功と対象画面を確認。ログイン、求人、応募、打刻、通知を変更範囲に応じて確認する。
通知を伴う本番テストは送信先・内容を明示して実施する。実ユーザーで無断検証しない。
障害時はrecovery-runbook.mdに従う。

## 自動検証CI
.github/workflows/offline-checks.ymlはmain更新・Pull Request・手動起動時にnpm testを実行する。
権限はcontents:readのみ、checkoutの認証情報は保持せず、Secretsは渡さない。
DB操作・通知送信・デプロイは行わない。既存のPages公開と独立して動くため、テスト失敗による公開停止はまだ保証しない。
テストを公開の必須条件にする設定は、ブランチ保護・公開方法の変更案を確認後に実施する。
