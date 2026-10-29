# 本番に接続しないブラウザー検証

Linux x64、Node24.22.1、Python3.12での再現を対象とする。
公開された固定依存を取得するだけで、有料サービスの作成・ログイン・本番操作は行わない。

```sh
npm ci --prefix tools/browser-lab --ignore-scripts --no-audit --no-fund
npm --prefix tools/browser-lab test
```

既存キャッシュだけを使う場合はciに`--offline`を追加。初回の依存取得にはネットワークが必要。
本番のURL・APIキー・ログイン情報・データを入力する引数はない。
テストは約70MBの圧縮ブラウザーを展開するため、一時ディスクとメモリに余裕を持たせる。
通常の`npm test`はブラウザーを自動インストール/起動しない。全体の再現は`python3 -B scripts/verify-handover.py`。

## 何を実行するか

- そのままのapply-confirm.html、driver.html、company.htmlと既存のローカルJS/CSS/画像を使用。
- Supabase SDKは読み込まず、ページ初期化前に架空SDKを差し込む。
- `https://spodora.test`の選んだファイルだけをPlaywrightのルートでメモリ配信し、実サーバーへ送らない。
- その他のURLとGET以外の通信はabort。テスト用CSPでconnect/frame/worker/formも禁止。service workerも無効化。
- 390px/1280pxの実描画、マウス/チェック/ダイアログ/遷移、連続操作、通信例外と退会拒否を確認。
- テスト用日本語フォントNoto Sans JPをローカルから注入する。製品コードのフォント変更ではない。

結果は`docs/browser-lab-20261029/result.json`。失敗でもFAILを上書きする。
画面画像8枚は同フォルダ。画面・実行ソース・lockfileのSHA256を記録する。
Git管理情報のないソースコピーでも実行でき、その場合base_commitはnullになる。
全体のソース対応は別フォルダ再現JSONのsource_sha256で確認する。
画像は架空の人物/企業/求人のみで、ネイティブダイアログの文面はJSON側の検査結果で確認する。
部分失敗時の画像が残る場合でも、成功判断はresult.jsonのstatusと各testを用いる。

## 起動方式

Playwright標準ブラウザーのZIP取得はこのホストでは失敗した。
代わりに`@sparticuz/chromium@153.0.0`の固定されたBrotliバイナリを使う。
既定の展開処理のchownがホスト非対応だったため、Node標準Brotli処理で新しい一時フォルダへ展開する。
OSパッケージ・OS所有権・ホストのブラウザープロファイルは変更しない。終了時に一時フォルダを削除する。
GPUのない環境向けにGPU/ソフトウェアGPUを無効化。
ホスト制約によりno-sandbox/single-processで、信頼されたローカルソースと架空データだけを開く。
任意の外部サイト閲覧や本番ユーザーのセッションを扱う用途に転用しない。

固定依存: playwright-core1.62.1 / Chromium153.0.0（実ブラウザー153.0.8010.0）/ Noto Sans JP5.3.1。
標準インストール手順・対応ブラウザーは[Playwright公式](https://playwright.dev/docs/browsers)、
代替バイナリの仕様は[配布元](https://github.com/Sparticuz/chromium)を参照。
本テストで組み合わせの起動・操作を確認したもので、標準のPlaywright同梱ブラウザーそのものではない。

## 限界

実Supabase SDK、実Auth、Storage、RLS、ロック、HTTP応答、実メール/LINEは動かしていない。
架空SDKは呼出しと表示の検証用で、DBの認可・定員の競合を模倣して保証するものではない。
iPhone Safari/Android、顔認証、カメラ、地図やメールアプリの起動も別途必要。
試験用CSPとフォントを注入した環境であり、本番CSPや本番の通信構成を検証したとは扱わない。
