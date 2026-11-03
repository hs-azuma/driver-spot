# 次の担当者・別AIの再開手順

1. GitHubの`docs/v4-restore-readiness-20261029`の最新SHAと、[8項目の状態](status.json)を読む。
2. mainの最新SHAを取得し、本番反映されていない候補であることを確認する。作業ブランチはPages公開先ではない。
3. Node `.nvmrc`（24.22.1）とPython3.12を用意し、`npm test`を実行する。DBや通知には接続しない。
4. [各ラボの再現手順](../../tools/native-runner/README.md)を読む。静的画面をそのまま開くと本番へ接続するため、必ず隔離ハーネスでテストする。
5. ローカルの追加ラボはrestore-lab/browser-lab/sdk-lab/business-labの各READMEに従う。
6. Denoは[専用手順](../../tools/edge-check/README.md)。通常はfrozen lockで検査し、更新時は意図した依存差分をレビューする。
7. native実結合は専用CIブランチ`ci/v4-native-validation-20261029`だけで実行。対象リポジトリ公開・標準無料ランナー・本番Secrets不使用を確認する。
8. `ci/v4-native-results-20261029`の結果を取得し、source_commitと各source_sha256が検査したソースと一致するか確認する。古い成功を新ソースの証拠に使わない。
9. 本番適用前は[現行候補一覧](../release/v4-current-candidate-20261031.json)、[本番レビュー](../v4-sixteen/production-review.md)、[読み取り診断](predeploy.md)、[旧自動更新案](../review/workflows/README.md)を確認する。
10. 実データを扱う前に[バックアップ管理決定票](../handover/backup-custody-decision-20261029.md)を埋める。本番データ・鍵・認証値はGitHubやActionsログへ置かない。

## 中断からの復帰

未成功ならstatus.jsonの項目とnative結果のfailed_stageを先に確認します。失敗も記録し、成功と混ぜません。
ネットワーク取得失敗を型の成功扱いにしません。型検査ではハンドラーを起動する必要はありません。
修正後は関係する検査だけを再実行し、成功したソースのSHAと結果を同時に保存します。
最終整合点検は`python3 -B scripts/audit-dependencies.py`、`python3 -B scripts/verify-handover.py`、`python3 -B scripts/audit-handover.py`、`python3 -B scripts/v4-progress.py`、`python3 -B scripts/check-eight.py`の順に実施します。失敗を無視しないでください。
文書の「準備完了」は、本番適用・実バックアップ・第三者本人の受け入れを意味しません。
特定のAIアカウント・個人のローカルファイル・チャットだけに依存する秘密保管を作りません。
