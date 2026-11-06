# 旧自動書き換え2件の適用結果

2026-11-06（日本時間）。F19完了。所有者の承認に基づき、mainの `37074c2e6355c2ddc563fe2698ca591c9ca8dc6f` で2ファイルを適用した。[適用記録](../../handover/workflow-retirement-applied-20261106.json)。

| 対象 | 適用後の動作 |
|---|---|
| .github/workflows/rebrand-spodora.yml | workflow_dispatchによる手動の読み取り点検 |
| .github/workflows/update-driver-experience.yml | 同上 |

両方ともcontents:read、checkoutのコミット固定、資格情報の永続化なし、標準ubuntu-24.04、3分上限。
確認処理はdriver.htmlとindex.htmlの存在を調べて結果を表示する。

## 確認した結果

- mainの差分は承認された2ファイルだけ。候補と適用後の内容が一致した。
- 変更前の実行中・待機中ジョブは0件。
- 通常のOffline checksとPagesの再公開が成功した。
- 変更コミットから旧自動書き換え2件は自動起動せず、mainに追加の書き換えコミットも発生しなかった。
- 適用済み設定を含む隔離再構築は[実行42195192121](https://github.com/hs-azuma/driver-spot/actions/runs/42195192121)で10段階成功した。
- 依存台帳のunfixed_action_refsは0件になった。

手動点検ジョブそのもののdispatch実行は未実施。今回の確認は設定の読取、mainの通常検証、適用済みソースの再構築を対象とした。

## 変更案と今後の扱い

candidate.ymlは適用済み内容の参照用。patchは適用前のmain `41d6223854a780713686d02ae73d028eb17aa2c4` に対する履歴資料。
再変更は適用済みのmainを基点にレビューする。旧自動書き換えを復活させる変更は別の承認単位とする。
CIのパッチ点検は、現行ファイルがcandidateと一致する適用済み状態、または旧ファイルへパッチが適用できる状態を確認する。
残るアプリ・DB・Functionsの本番反映はF20・F21で管理する。
