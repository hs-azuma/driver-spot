# 業務操作の検証ラボ

Linux x64 / Node24.22.1。依存は隣接するsdk-labとbrowser-labのlockfileを使う。
このpackage.json自身には外部依存がなく、追加のlockfile/インストールは不要。

```sh
npm ci --prefix tools/sdk-lab --ignore-scripts --no-audit --no-fund
npm ci --prefix tools/browser-lab --ignore-scripts --no-audit --no-fund
npm --prefix tools/business-lab test
```

初回以外はciに--offlineを付けて既存キャッシュから導入できる。
結果: docs/business-lab-20261029/result.json。失敗はFAILで上書き。

## 51ケース

31ケース: 実際の求人掲載/採用/見送り関数をHTMLから読み込み、Node VMで架空DOM・実SDK/架空HTTPを使って実行。
20ケース: 390px/1280pxのChromiumで給与確認モーダルとattendance.htmlを実行。
給与確認モーダルは実assets/attendance-review.jsと計算資産を使った検証専用のホスト画面。
QR打刻は実attendance.htmlとQR資産を使う。カメラ撮影/画像認識は行わない。

SDKは2.105.0。API URL/公開鍵/ユーザー/JWTは架空値。
リクエストは転送しないfetch、または同じ架空オリジンのメモリ応答だけで、外部はabort/CSPで遮断。
メール通知ヘルパーは採用/見送り試験ではスタブ、求人掲載試験では実SDKのFunction要求に架空HTTPを返す。
実際の受信者やプロバイダーへ送信しない。

確認: 更新0件/権限拒否/通信例外/連続操作で誤った結果通知をしない。
求人掲載の応答不明では再掲載を止め、確定した掲載を通知失敗でやり直さない。
給与は基本報酬と交通費の表示・同意・差戻し理由・承認RPCを確認。割増/税/振込は試験対象外。
QRは出勤→退勤、無効URL、拒否、重複クリックのRPC呼出しを確認。

## 限界

求人入力フォーム全体と採用一覧全体のクリック試験は未実施。
RLS/トリガー・JWT署名・同時採用/定員・実メール/LINE・実機カメラ・実GoTrue/PostgRESTは未検証。
保持ガード・給与・QRのDBロジックは別の架空PGlite試験で扱い、ネイティブSupabaseと同一とはみなさない。
