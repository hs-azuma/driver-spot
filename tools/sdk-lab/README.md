# 実SDK・架空HTTPの検証ラボ

Node24.22.1、Python3.12、Linux x64。
本番へのアクセスや有料サービスの作成は行わない。URL/鍵を入力する引数もない。

```sh
npm ci --prefix tools/browser-lab --ignore-scripts --no-audit --no-fund
npm ci --prefix tools/sdk-lab --ignore-scripts --no-audit --no-fund
npm --prefix tools/sdk-lab test
```

既存キャッシュのみならciへ`--offline`を追加。
全体をソースコピーから確認する場合は`python3 -B scripts/verify-handover.py`。
通常の`npm test`は依存を自動取得せず、このラボも自動実行しない。

## 固定した実物

- @supabase/supabase-js2.105.0。Auth/Functions/PostgREST/Realtime/Storageサブパッケージも同版。
- ブラウザーは同パッケージ内のUMDビルドをメモリから読み込む。SDKの実装自体は変更しない。
- 2.105.0は既存driver.htmlと同じ版。apply-confirm.html、company.html、delete-accountのimportも同じ版へ固定する候補。
- lockfileとnpmのintegrityを保存。ブラウザー本体/Playwrightの依存は隣のbrowser-labの固定版を使う。

## 33ケースの範囲

1件の版一致、16件の実SDKと退会ハンドラー、16件の実SDKブラウザー操作（390px/1280px）。
退会は依存注入された既存handler.tsをNodeのTypeScript型除去で読み込む。Denoを模擬したとは扱わない。
SDKが作る実際のmethod/path/body/header/return representationとエラー型を検査する。
ログには呼出しの認証値を残さず、結果とソースSHA256だけを保存する。

Node側はcreateClientのglobal.fetchを転送機能のない関数へ差し替える。
https://sdk-fixture.invalid以外は拒否し、既定fetchへフォールバックしない。
実SDKのcreateClientを使うためのfetch・サーバー用非永続セッション設定だけをテスト側で注入する。
本番ハンドラー自身のAPI呼出し順やbodyは変更していない。

ブラウザー側は実HTML・ローカルJSを使い、createClientのURL/公開鍵の引数だけを架空値へ置換する。
合成JWTを専用コンテキストのlocalStorageに用意する。JWTは実サーバーで署名検証したものではない。
全リクエストはルートでメモリ配信/架空HTTP応答/abortのいずれか。
CSPは同じ架空オリジンの通信だけを許可し、外部接続・frame・workerを遮断する。service workerも停止。
実本番へ転送するプロキシ機能や実Authセッションの読込はない。

## 確認できた具体的な契約

- 本人確認で得たUUIDがRPCとAuth削除へ渡り、リクエスト本文で指定した他人のIDは使わない。
- getUser、withdrawal_preflight、logout?scope=global、admin/users/本人UUIDの順。
- admin削除bodyはshould_soft_delete:false。プロフィールを直接DELETEしない。
- 保持拒否・RPCなし・認証拒否・失効要求失敗では、その段階で停止する。
- 応募POSTの本人driver_id/応募中、取消DELETEのidフィルタとreturn=representation。
- 409応答はFunctionsHttpError.contextのResponseからJSONとして読み取れる。
- この固定版で応募POSTの通信例外/503/409時は1回の送信で、SDKが自動再送しない。
- ページがエラーを成功表示せず、応募不明/重複で再送を止める。

SDKの再試行説明には資料間で差異があったため、固定した2.105.0の実装と実行を優先した。
ここから他のSDK版や他のHTTPメソッドの再試行保証へ一般化しない。
再試行設定の製品コード変更は今回行っていない。

## 証拠と未確認

`docs/sdk-lab-20261029/result.json`。失敗もFAILとして上書きする。
実SDKと画面/ハンドラーの接続までは確認したが、応答元は架空のHTTPである。
本物のGoTrue/PostgREST、JWT署名、RLS、Storage所有物、DBガード・競合、ネイティブSupabase復元、
Denoの型/バンドル、esm.sh/jsDelivrの配信可否、iPhone Safari/Androidは別途確認が必要。
合成JWTを実用認証として使わない。テスト用CSP/URL置換を本番のセキュリティ設定とはみなさない。

参照: [公式deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)、
[公式signOut](https://supabase.com/docs/reference/javascript/auth-signout)、
[公式再試行の変更記録](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors)、
[公式再試行ガイド](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js)。
