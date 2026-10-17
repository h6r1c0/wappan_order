# 繰り返し印刷とBrave PDF作成のチェックリスト

開始基準: main `e92fed1`、公開資産 `index-DGYWaukp.js` / `index-BVD5nnLX.css`、本番Supabase revision 44。印刷以外の業務ロジック・データは変更しない。

## 実装前調査と方式
- [x] 現在のprint呼び出し、Safari専用の2回目分岐、DOM保持、beforeunloadを確認。2回目の案内はアプリの分岐による
- [x] 独立HTMLと独立PDFを比較。HTML印刷は再度ブラウザ印刷とヘッダー設定に依存するため、独立PDFを選択。初回はPDF表示後に端末の印刷／保存操作が必要
- [x] 既存の帳票寸法・商品順・略称・枠配置・数量抽出を保持
- [x] 日本語フォントの配布元・OFLライセンスを `src/assets/fonts/README.md` と同ディレクトリに記録

## 印刷導線
- [x] 1回目・再印刷・帳票切替・別注文回・キャンセル後に同じボタンから新しい帳票を開く（Chromium / WebKit自動テスト）
- [x] ユーザークリック内でプレビューを確保し、ポップアップ拒否・生成失敗・連打に対処（WebKit自動テスト）
- [x] 古い帳票へ切り替わらず、開いたPDFの参照を早く破棄しない（閉じたタブと古い代替リンクだけ次操作で解放）
- [x] Safari前提の一律説明を除き、必要な時だけ短いエラー・代替リンクを表示
- [x] PDF本文にサイト名・印刷日時・URLを含めず、閲覧PDFとして印刷する

## 帳票・互換性
- [x] 販売表: A4縦・20mm下線4列・固定列・コンパクト見出し・販売済み対象を保持。ChromiumとWebKit生成PDFをレンダリングして確認
- [x] 仕分け: A4縦・4列・縦2～4枠・多い枠から配置・略称・点線を保持
- [x] 1ページ相当/人数多め/混在枠/長い商品名をPDFレンダリングで確認。16人例は1ページ、21人例は2ページで空白ページなし
- [x] Chromium・WebKit、320/375/430px・PCの入口と繰り返し動作を確認（CI成功、スクリーンショットと帳票を目視確認）
- [x] iPhone Safari・Brave・Androidの実機は利用不可。WebKit/iPhone幅、Brave UAでの同一経路、Chromium/Android相当の自動テストと区別
- [x] Braveの終了はアプリ原因と断定しない。native HTML印刷→PDF化を避け、独立PDFの表示・保存をBrave実機で未検証と記録

## 保全・公開
- [x] npm test（57成功・既存1スキップ）、build成功、GitHub ActionsでChromium/WebKit browser testと既存業務回帰成功
- [x] 商品ID・注文・販売・集金・欠品・履歴に書き込みなし。ブラウザ試験ではSupabase RPC書き込み0。本番revision 44を開始時に読み取り
- [ ] 差分・チェックリスト再監査、main反映、Actions検証/公開、公開資産確認
