# 実Supabase復元・バックアップ準備・第三者受け入れ

更新: 2026-10-29。開始コミット `db6e4e2c187f2f9ab1a3e11ca179a37578a7ad17`。
本番サイト/DB/Auth/main/公開方法を変更していない。新たな課金契約・有料ランナー・Secretsの追加なし。

## 3項目の到達点

|対象|今回できたこと|残っていること|
|---|---|---|
|実Supabaseでの結合・復元|無料の公開標準GitHubランナーで実GoTrue/PostgREST/Storage、PG17.11、DB暗号化→別DB復元の36項目が成功|実データ、Storageファイルの復元、global roles/サービス設定、Edge/実通知/複数接続、正確な本番ビルド|
|実データバックアップ|既存Driveに空の専用フォルダ作成。共有なし・所有者のみを確認。範囲/鍵/保持の決定票と停止条件を保存|鍵管理者・別の鍵保管場所・保持期間・復旧目標・取得/復旧担当の指定。実データ未取得、鍵未生成|
|第三者の実受け入れ|再現・復旧・障害切り分け・権限移管の実演票/署名欄、現行コードと検証証拠の自動点検を用意|受取人の指定、本人確認、個別権限/MFA、本人の実演と署名。招待/連絡は未実施|

## 実行結果とソース

- 成功したCI: https://github.com/hs-azuma/driver-spot/actions/runs/40878778833
- 実行コミット: `9bccdcc180f9c7b0dd0fcffa0d756a6bc4d63d13`。
- [36項目と対象ソースのSHA256](native-ci-20261029/result.json)。docsブランチでも同じ対象ハッシュを照合する。
- [固定CLI/コントローラーの構成](../tools/native-runner/README.md)。結果保存先は専用 `ci/v4-native-results-20261029`。
- ローカル補助ラボ: [264項目](database/restore-candidate/lab-result.json)。Auth/Storageはここではfixture。
- [別フォルダ再現](handover-cleanroom-20261029.json)と[現行証拠の点検](third-party-readiness-20261029.json)。

native CIは本番Secretsや本番接続文字列を受け取らず、架空ユーザーだけを新規作成する。
CLI2.122.0固定、Node24.22.1固定、標準ubuntu-24.04、専用SUPABASE_HOME。
公開リポジトリの標準ランナーを使い、課金につながる成果物/キャッシュ保存は行わない。
公開設定が変われば無料条件も見直す。公式料金説明: https://docs.github.com/en/billing/concepts/product-billing/github-actions

## 実際に確認した内容

- 22アプリテーブル/54取得関数を含むDDLと6件の修正案を、新規ローカルDBへ構築。
- 5架空ユーザーの実パスワード認証。本人だけのプロフィール取得、他人/匿名の拒否、企業の求人・本人の応募。
- 業務履歴がある人のGoTrue退会拒否、空アカウントのAuth/プロフィール同時削除。
- Storageの非公開バケット・架空ファイル保存/読込、所有ファイルがある人の削除保護。
- 527,862バイトの架空DB pg_dumpを暗号化/復号。誤鍵・改ざん拒否。
- 別DBへpg_restoreし、アプリカタログとAuth/アプリ/Storageメタデータの行数を照合。

ダンプ本体、復号鍵、ローカルJWTは公開保存しない。サイズとハッシュだけを記録した。
同じクラスタの別DBへの復元であり、全サービスを別ホストへ完全復元した試験ではない。
データ照合は上記範囲であり、全行全列の値・採番の継続をnativeで網羅したとは扱わない。
CLI固定だけでサービス全バイナリの版固定を保証しない。PG17.11は本番17.6.1.166と一致しない。

## 試験で見つかった差と対策

1. Docker方式3回は配布元のダウンロード上限で起動前に失敗。公式native配布に切り替えた。
2. nativeのAuthテーブル所有者はsupabase_auth_admin。新規fixtureだけ移行ロールへ所有者ロールを付与し、取得済みトリガーを構築した。本番権限変更ではない。
3. 実Storage保存後のAuth削除は、元の修正案では拒否されなかった。サービス側の自動保護に依存せず、[退会SQL](../sql/review-v4-withdrawal-retention.sql)にowner_id/旧ownerの所有物チェックを追加。preflightとAuth BEFORE DELETEの両方で止める。取得不能なら例外で停止する。
4. 補助SQLラボにも所有者形式・履歴保護の4件を追加し264項目。nativeでも所有者の退会拒否/プロフィール/ファイル保持を実確認。

修正案は本番未適用。本番Storageのアクセス権限とカラム、サービス版は適用前レビュー対象。
[判断資料](release/v4-production-review-20261029.md)の旧ハッシュをそのまま使わず、新たな差分へ再固定する。
初期失敗記録もnative-ci-20261029配下へ保存した。失敗を成功で上書きして隠さない。

## 再開順序

1. READMEとこの記録、JSONのsource_sha256を確認する。
2. `python3 -B scripts/verify-handover.py` でソースコピーから全補助ラボを再現する。
3. `python3 -B scripts/audit-handover.py` でリンク/依存/試験ソース/最新native証拠を照合する。
4. native再実行は専用CIブランチ/手順を使い、新規架空環境だけを対象とする。
5. [バックアップ決定票](handover/backup-custody-decision-20261029.md)を埋め、`python3 -B scripts/check-backup-custody.py` を確認。現在の終了コード2は未決定を示す。
6. 受取人が決まれば[実演・署名票](handover/receiver-acceptance-20261029.md)で独立した本人の受け入れを行う。

保管先の正確なURL/鍵の実体/担当者の個人連絡先は公開GitHubへ置かない。
自動点検の合格だけで本番承認、実バックアップ完了、第三者署名済みとしない。
