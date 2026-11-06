# Edge Functionsの厳密型検査と依存固定

Node 24.22.1、Deno 2.9.6（npm lockfile固定）を使用します。
インストール時のlifecycle scriptsを無効にし、同梱されたプラットフォーム別Deno実行ファイルを直接使用します。

```bash
npm ci --prefix tools/edge-check --ignore-scripts --no-audit --no-fund
node tools/edge-check/verify.mjs
```

各Functionのdeno.jsonでstrictを有効にし、`deno check`で全Functionとローカル依存を確認し、間接依存の解決内容もlockfileで固定します。
`deno.lock`の更新を通常実行では拒否します。意図的な更新時だけ`--update-lock`を使い、差分と型検査を確認してください。
ハンドラーの実行やDB接続、デプロイはしません。依存解決には初回に公開レジストリーへの通信が必要です。
依存取得失敗も型検査失敗と区別して記録し、成功に置き換えません。

4箇所のJSR型参照を2.118.0へ固定し、同じ実行用SDK 2.105.0の参照をnpm形式へ揃える候補です。
これは本番への適用前です。型検査成功と、外部配信成功・本番Denoビルド一致は別の確認です。
`line-link.html`の既存SDK2.95.0は維持し、実LINE連携を確認してから更新を検討します。

検証用CIは標準公開ランナーだけを使用し、非公開リポジトリや有料ランナーでは動きません。
最終結果は[8項目の台帳](../../docs/v4-eight/README.md)に記録します。

## 外部型宣言の既知の制限

`--all`の追加監査ではSDK2.105.0のWebAuthn型宣言とTypeScript6のDOM宣言に不整合を確認しました。
アプリ10 Functionsのstrict検査と、外部ライブラリー自身の型宣言の再検査は区別します。
通常のDeno検査を使用し、この外部型宣言の問題を成功扱いにしません。`skipLibCheck`や`@ts-nocheck`でアプリの検査を無効化しません。
SDKの実行バージョンは今回変更せず、上流の互換版へ移す際は別の依存更新・画面/Functions回帰検証を行ってください。
