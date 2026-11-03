# Edge Functionsの厳密型検査と依存固定

Node 24.22.1、Deno 2.9.6（npm lockfile固定）を使用します。
インストール時のlifecycle scriptsを無効にし、同梱されたプラットフォーム別Deno実行ファイルを直接使用します。

```bash
npm ci --prefix tools/edge-check --ignore-scripts --no-audit --no-fund
node tools/edge-check/verify.mjs
```

各Functionのdeno.jsonでstrictを有効にし、`deno check --all`で間接依存も含めて確認します。
`deno.lock`の更新を通常実行では拒否します。意図的な更新時だけ`--update-lock`を使い、差分と型検査を確認してください。
ハンドラーの実行やDB接続、デプロイはしません。依存解決には初回に公開レジストリーへの通信が必要です。
依存取得失敗も型検査失敗と区別して記録し、成功に置き換えません。

4箇所のJSR型参照を2.118.0へ固定し、同じ実行用SDK 2.105.0の参照をnpm形式へ揃える候補です。
これは本番への適用前です。型検査成功と、外部配信成功・本番Denoビルド一致は別の確認です。
`line-link.html`の既存SDK2.95.0は維持し、実LINE連携を確認してから更新を検討します。

検証用CIは標準公開ランナーだけを使用し、非公開リポジトリや有料ランナーでは動きません。
最終結果は[8項目の台帳](../../docs/v4-eight/README.md)に記録します。
