# 第三者向け・再構築と復旧検証の実行手順

2026-10-31。対象は架空データだけ。本番へのlink/push/deploy、実データ取り込み、実通知は含めない。
特定のAIは不要。Git・固定Node・Python・標準GitHub Actionsで実行する。

## 1. 取得と検証

```sh
git clone --branch docs/v4-restore-readiness-20261029 https://github.com/hs-azuma/driver-spot.git
cd driver-spot
node --version
python3 --version
npm test
npm ci --prefix tools/restore-lab --ignore-scripts --no-audit --no-fund
npm ci --prefix tools/browser-lab --ignore-scripts --no-audit --no-fund
npm ci --prefix tools/sdk-lab --ignore-scripts --no-audit --no-fund
python3 -B scripts/verify-handover.py
python3 -B scripts/audit-handover.py
```

Nodeは.nvmrcの24.22.1、Python3.12。通常npm testはパッケージ追加も本番接続もしない。
初回の固定パッケージ取得にはネットワークが必要。verify-handoverは用意したキャッシュで別フォルダから再現する。
そのため完全オフラインの新しい端末には、先にパッケージと対応ブラウザーの取得が必要。

## 2. native試験の実行方法

- 実行元は専用 `ci/v4-native-validation-20261029`。mainにpushしない。
- GitHub Actionsの既存native実行を再実行するか、専用ブランチを取得してそのブランチへ変更をpushする。
- ソースがdocsブランチより古ければ、対象ファイルを比較して専用CIブランチへ反映する。強制pushやブランチ丸ごとの置換はしない。
- 必要権限はリポジトリのソース取得・CI実行。結果保存ジョブだけが専用結果ブランチに書き込む。
- nativeジョブのGitHubトークンはcontents:read。公開リポジトリ確認の固定URLへの問い合わせにだけ使い、サービス起動前に環境から除く。
- 公開リポジトリの標準ubuntu-24.04を使う。有料ランナー・成果物保存・キャッシュ保存を追加しない。非公開化時には停止し、料金条件を再確認する。
- Supabase/Resend/LINEの本番Secretsは設定しない。既存の本番環境を検証の代用にしない。

コントローラーはGITHUB_ACTIONS・対象リポジトリ・対象ブランチ・非root・公開状態を確認する。
このホストはrootのみのため直接起動しない。環境変数を偽装してガードを外す手順はない。

## 3. 実際の処理順

1. 固定CLI2.122.0の--version/--helpを確認する。
2. Linux nativeのFunctionsも読み込めるよう、ホーム配下にmkdtempで専用作業領域とSUPABASE_HOMEを作る。DB17、Auth/REST/Storageだけを起動する。
3. statusのAPI/DBがループバックであることを検証する。任意の接続先は入力として受け取らない。
4. 新規fixture内だけで移行ロールへAuth所有者ロールと試験用JWTロールを付与する。本番ロール変更ではない。
5. 取得済みアプリDDLとレビューSQLを構築し、架空ユーザーを作る。
6. 実API・複数DB接続・通知リース・強制停止/WAL復旧を確認する。外部送信workerは呼び出さない。
7. pg_dumpをメモリー上で暗号化/復号し、同じクラスタの別DBへ復元する。切れたダンプの失敗とrollbackも確認する。
8. 可搬用ダンプはstorage.objectsの行データを除く。バケット設定/権限はDBで復元し、オブジェクトはStorage APIで作り直す。
9. アプリ/認証行のハッシュ、全カタログ、非公開関数/列/採番/Authトリガー権限、採番の現在値を採取する。
10. 元のサービスを停止し、別作業領域・別SUPABASE_HOMEのDBだけを起動する。cluster identifierが異なり、アプリテーブルがないことを確認する。
11. 空の復元先だけでreset-fixture-default-acl.sqlを実行する。既存DBには使わない。
12. pg_restore --single-transaction --exit-on-errorで復元し、元と権限/全行ハッシュ/採番値を照合する。
13. Auth/REST/Storageを起動し、保存した架空パスワードで再ログインする。ファイル本体を所有者JWTで再アップロードする。
14. 新しい求人/応募の採番継続、他人/匿名拒否、業務と応答喪失の照合を確認する。
15. コピーしたFunctionsと既存のverify_jwt設定で実行を確認する。実プロバイダーの鍵は入れない。
16. 自分で作成したスタックだけを停止する。標準ランナー破棄で架空データを破棄する。

## 4. 成功と停止の判断

- 最新結果のstatus、source_commit、source_sha256を確認する。別ソースの成功で現在を合格にしない。
- failed_stageがあれば全体成功ではない。成功済みの部分と未達の部分を分ける。
- dump/Storage本体/復号鍵/JWTは保存しない。公開するのはチェック名、サイズ、ハッシュ、制限だけ。
- 復元先の権限が広がったら停止する。照合対象を減らして成功扱いしない。
- 403/配布上限/対応外機能は、認証範囲や公式手順を確認する。課金・本番利用・秘密値の追加で解決しない。
- DB停止/再起動/復元は、今回の専用作業領域・ループバック・クラスタ識別子の確認ができる場合だけ。

## 5. 復元時に変わるもの

元アカウントのUUIDは架空Authダンプで保持する。Storage object UUID・作成時刻・旧署名URLは保持しない。
ドメイン、サイトURL、メール/LINE設定、外部契約、cron、Webhook、Vaultの値、API鍵は別の管理項目。
実データでは鍵と暗号化本体を別管理し、取得範囲・保持・復旧目標・担当者を決めてから行う。
本番の17.6系とnativeの17.11は同一ビルドではない。別ホスト/別クラウドの完全移行や実機・実配信の保証とはしない。
