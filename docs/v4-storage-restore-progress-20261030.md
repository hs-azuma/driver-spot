# Storageファイル本体の暗号化復元検証

更新: 2026-10-30（日本時間）。本番・main・実データ・課金設定は変更していない。
実行対象は従来と同じ無料標準の公開GitHubランナーと、その中だけの架空Supabase。

実結合・DB/Storage復元の合計69項目が成功。
成功実行: https://github.com/hs-azuma/driver-spot/actions/runs/40900855294
対象コミット: `75ea456e7f10fbd62681f0385695b880fd00e888`。

## 追加した検証

- 架空テキスト、7バイトのバイナリ、0バイトの空ファイルを使用する。
- 実Storage APIでダウンロードし、名前・MIME・バイト数・SHA256・本体をメモリー上のマニフェストへまとめる。
- AES-256-GCM/scryptで暗号化。誤鍵・改ざんの拒否、復号後の本体ハッシュを確認する。
- 暗号化バックアップができた後、今回の架空ソースファイルだけを削除し、取得できなくなったことを確認する。
- 別の非公開バケットへ、元の架空所有者のJWTで再アップロードする。
- 復元した3ファイルのバイト数・SHA256・MIME、所有者の読込、他人・匿名の拒否を実APIで検証する。
- 復元先に所有ファイルがあれば退会preflightが引き続き保留になることを確認する。
- この後に従来のDB暗号化・別DBへのpg_restore・カタログ/行数照合も続けて実行する。

スクリプト: [Storage試験](../tools/native-runner/storage-roundtrip.mjs)、[全体手順](../tools/native-runner/README.md)。
最新の実行状態・source_commit・各チェック・ファイルのハッシュは[結果JSON](native-ci-20261029/result.json)。
前段階の36項目成功記録は[保存した前回結果](native-ci-20261029/previous-pass-20261029.json)。
自動点検は[最新点検結果](third-party-readiness-20261029.json)、ソース再現は[再現結果](handover-cleanroom-20261029.json)。

## 到達点の限界

同じ使い捨てサービス内の別バケットへの復元。別ホスト/別プロジェクトへの移行ではない。
復元時にAPIで新規オブジェクトを作るため、元のobject UUID・時刻・署名URLは保持しない。
元の架空ユーザーが同じ環境内に存在する条件。別環境のAuth ID対応付けや任意のメタデータ/バケット設定の完全移管は未確認。
保管するのは検査名とハッシュ等だけで、アーカイブ本体・JWT・暗号鍵はGitHub/Driveへ保存しない。
したがって実バックアップの鍵管理/保持期間の決定、実データ取得、第三者本人の受け入れは引き続き必要。

## 参照した仕様

公式Storageバケット: https://supabase.com/docs/guides/storage/buckets/fundamentals
公式upload: https://supabase.com/docs/reference/javascript/storage-from-upload
公式download: https://supabase.com/docs/reference/javascript/storage-from-download
changelog.mdは今回タイムアウトし取得できなかった。固定SDK2.105.0の実サービス試験を証拠とし、全変更履歴を点検済みとはしない。

## 再開上の注意

CIブランチの初回保存95ab73b…でベースツリーを欠かし、ワークフローが起動しなかった。
前回の完全なCIツリーを明示して75ea456…へ復旧後、ワークフローの存在と実行成功を確認した。
今後の保存ではベースツリーSHAを明示し、保存後にworkflow/sourceの読み戻しと実行SHAを照合する。
