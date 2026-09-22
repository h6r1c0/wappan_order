# わっぱん 注文・集計

おひさま保育園の係向け、スマートフォン用Webアプリです。Supabase AuthとクラウドDBを使い、複数端末で同じ注文・販売・集計データを共有します。

## 利用開始

[初回セットアップ](docs/SETUP.md)に、実行するSQLと画面での操作をまとめています。DB未接続の場合は案内画面になり、個人情報は入力・閲覧できません。

1. 「商品・購入者」でExcelの商品を確認して取り込む。
2. 「注文」で納品日を作り、個人・園内販売・行事・マルシェの用途を同じ納品回で管理する。個人注文は手入力またはLINE文の貼り付け候補から確認して保存する。
3. 欠品は了承した購入者の数量を修正。「納品・精算」で納品書の仕入税込総額を入力する。
4. 園内販売は購入者・外部販売・販売先未確認を選ぶ。マルシェは任意の単品価格・セット価格と入金状態を記録する。行事余剰は仕入原価を保ったまま販売側へ振り替える。
5. 「集計」で年度利益、個人請求、過去実績、利益調整を確認する。

[9月11日分の照合手順](docs/ACCEPTANCE.md) / [会計・保存設計](docs/DESIGN.md) / [手書き写真取込の評価](docs/PHOTO_IMPORT_EVALUATION.md)

## 開発

Node.js 22.12以降（CIは24）。

```sh
npm ci
cp .env.example .env
npm run dev -- --host 127.0.0.1
npm test
npx playwright install chromium
npx playwright test
npm run build
```

`.env`へSupabaseのProject URLと公開用Publishable key（またはanon key）を設定します。Service Role / Secret Keyを設定しないでください。

- React + Vite、SheetJS CE 0.20.3（Excel取込時だけ読み込み）
- SupabaseのDB migration: `supabase/migrations/` を番号順に適用
- GitHub Actions: 計算・DB・ブラウザーのテスト後にビルド。Pagesへの公開は手動ワークフローまたは設定済みの場合に実行。
- ユーザーの注文データはリポジトリへ保存しません。画像2点は既存素材をそのまま使用します。
- ブラウザーテストは検証用のAuth/APIで業務フロー・複数端末・競合を確認。DBテストはPGliteのPostgresでRLS・RPCを実行します。実際のSupabaseプロジェクト接続後の端末間確認は別途必要です。

## 第一版の対象外

購入者向け公開フォーム、LINE API連携、納品書OCR、手書き写真OCR、通知、商品ごとの画像管理、マーケティング、複雑な在庫・行事管理は含みません。手書き販売記録はスマートフォンのタップ入力で登録できます。
