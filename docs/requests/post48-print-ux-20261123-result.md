依頼記録: docs/requests/post48-print-ux-20261123.json
対象ID: WAP-0042, WAP-0043, WAP-0047, WAP-0083, WAP-0086
今回対象外のID: WAP-0091（ヘルプ・受付・Museは本人指定の対象外）
台帳未反映の要望: なし

| ID | 対応結果 | 証拠・残る作業 | 実機確認 |
| --- | --- | --- | --- |
| WAP-0042 | 部分完了 | `src/style.css` の青い利益カード・集計カード・目標リンクの筆跡を調整。CIの画面画像と本人iPhoneで質感確認待ち | 未確認 |
| WAP-0043 | 部分完了 | `src/style.css` のL字と上下3用途タブの共通選択表現。CIの画面画像と本人iPhoneで入力保持確認待ち | 未確認 |
| WAP-0047 | 部分完了 | `src/print-preview.js` の動的モジュール依存をなくし、`src/print-prep.jsx` と `src/collections.jsx` からPDF保存・共有の代替を提供。A4 PDF3種を描画。黒画面のiPhone Safari再現・本人実機のプレビュー/紙面確認待ち | 不合格（PR #48のiPhone黒画面） |
| WAP-0083 | 部分完了 | `src/reports.jsx` の日本語由来名・選択点の日付・明細対応。本人iPhone確認とPR CI待ち。金額計算は未変更 | 未確認 |
| WAP-0086 | 部分完了 | `src/style.css` の工程・集計の筆跡とタブの工程色。CIの3幅画像・本人実機の視認性確認待ち | 未確認 |

確認範囲: main `57b4110`、PR #48統合済み。公開Pagesは現行 `index-CcItLE8q.js`・`index-WzuUjOye.css` と追加 `print-pdf-H1kpo6yz.js`、日本語フォントのHTTP 200を確認。現行追加モジュールの欠落は再現せず、iPhoneでの黒画面とエラーの因果関係は未確定。隔離fixtureの販売記録・個人仕分け・集金袋ラベルPDFはA4各1ページで文字を描画確認。`npm test` は208成功・2既存skip、`npm run build` 成功。ローカルChromiumはコンテナのsocket制限で起動不可。PRのCI Chromium/WebKit確認待ち。新PR・公開・本人実機は未完了。本番会計データへの書込みはなし。
