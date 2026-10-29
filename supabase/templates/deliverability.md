# 登録確認メールの配信改善（2026-10-06）

確認メールの入口を https://spodora.com/auth-confirm.html に統一。ページを開くだけでは認証せず、本人のクリックで既存のSupabase確認リンクへ進む。確認リンクはURLフラグメントから読み、履歴から取り除く。外部画像・分析・保存・自動リダイレクトなし。認証先は本番Supabaseプロジェクト、用途はsignup、完了後の行き先は既存スポドラ画面のみを許可。リンクの使用後・期限切れ処理は従来のSupabase認証と同じ。

本番ページの公開をHTTPと画面で確認済み。メールテンプレート変更のコードは保存済みだが、本番Authへの切り替えは未適用。管理APIのGETがHTTP 500を返し、3回の読み取り再試行でも失敗。最新実行: https://github.com/hs-azuma/driver-spot/actions/runs/37432084427 。GET失敗のためPATCHは行っていない。Supabase復旧後、この実行の失敗ジョブを再実行し、設定読み戻しと実メールリンクを確認する。

DMARCは未適用。DNSのNSはns1〜3.xdomain.ne.jp。2026-10-06に_dmarc.spodora.comが存在しないことを公開DNSで確認。XServerアカウントログイン後の新環境本人確認で、コード送信時に「ご利用いただけないページです」となり停止。成功と記録しない。

DNSに追加する初期値: ホスト名 _dmarc / 種別 TXT / 内容 v=DMARC1; p=none; adkim=r; aspf=r / TTL 3600。既存レコードが作成されていれば重複追加しない。メールの受信が無効なので架空のレポート受信先を指定しない。認証失敗時の拒否・隔離は全送信経路の認証確認後に判断する。SPF、DKIM、メール用MX、サイト用A/CNAME、NSは変更しない。

設定の照合と、各受信サービスでの実際の受信トレイ到達は別に確認する。迷惑メールを完全に防げると約束しない。

公式資料: https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails / https://resend.com/docs/dashboard/domains/dmarc
