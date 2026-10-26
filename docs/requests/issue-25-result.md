## Issue #25：要望の取りこぼし防止を既存基盤へ統合

依頼記録: docs/requests/issue-25.json
対象ID: WAP-0001, WAP-0002, WAP-0003, WAP-0004, WAP-0005, WAP-0006, WAP-0007, WAP-0008, WAP-0009, WAP-0010, WAP-0011, WAP-0012, WAP-0013, WAP-0014, WAP-0015, WAP-0016, WAP-0017, WAP-0018, WAP-0019, WAP-0020, WAP-0021, WAP-0022, WAP-0023, WAP-0024, WAP-0025, WAP-0026, WAP-0027, WAP-0028, WAP-0029, WAP-0030, WAP-0031, WAP-0032, WAP-0033, WAP-0034, WAP-0035, WAP-0036, WAP-0037, WAP-0038, WAP-0039, WAP-0040, WAP-0041, WAP-0042, WAP-0043, WAP-0044, WAP-0045, WAP-0046, WAP-0047, WAP-0048, WAP-0049, WAP-0050, WAP-0051, WAP-0052, WAP-0053, WAP-0054, WAP-0055, WAP-0056, WAP-0057, WAP-0058, WAP-0059, WAP-0060, WAP-0061, WAP-0062, WAP-0063, WAP-0064, WAP-0065, WAP-0066, WAP-0067

前WorkのPR #26・2コミット・54件を継承。業務等53件＋管理基盤1件に、GitHub履歴から不足13件を追加回収し67件。アプリ本体・業務データは変更しない。元会話全文・画像全件は未確認。

| ID | 対応結果 | 証拠・残る作業 | 実機確認 |
| --- | --- | --- | --- |
| WAP-0001 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx` `src/style.css` `tests/browser/ux-density.spec.js`。以前の省スペース化後も編集欄が広すぎると再指摘。 | 未確認 |
| WAP-0002 | 台帳へ回収 | `6204a5e` `src/style.css` `tests/browser/ux-density.spec.js`。以前に線が消えた再発を記録。 | 未確認 |
| WAP-0003 | 台帳へ回収 | `6204a5e` `src/shortage-ui.jsx`。10/16既存記録は revision 40 の欠品確認に由来し、本人の当時の認識は断定不能。 | 未確認（旧版の表示に不合格） |
| WAP-0004 | 台帳へ回収 | `6204a5e` `src/sales-workspace.jsx` `tests/browser/workflow.spec.js`。大きな行・往復の再発を受けて行内編集。 | 未確認 |
| WAP-0005 | 台帳へ回収 | `6204a5e` `tests/browser/accounting-cases.js`、`tests/domain.test.js`。 | 未確認 |
| WAP-0006 | 台帳へ回収 | `6204a5e` `src/sales-workspace.jsx` `tests/browser/workflow.spec.js`。 | 未確認 |
| WAP-0007 | 台帳へ回収 | `6204a5e` `src/orders.jsx` `src/style.css` `tests/browser/ux-density.spec.js`。一度改善後の縦長化を再発として記録。 | 未確認（旧版で不合格） |
| WAP-0008 | 台帳へ回収 | `6204a5e` は表示のみ変更。`tests/browser/workflow.spec.js`。 | 確認済み（前Workの継承記録、10/16従前照合のみ。本人の原発言は今回未取得） |
| WAP-0009 | 台帳へ回収 | `6204a5e` `src/orders.jsx` `tests/browser/ux-density.spec.js`。 | 未確認 |
| WAP-0010 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx`。 | 未確認 |
| WAP-0011 | 台帳へ回収 | `aa76ca8` `tests/batch-import.test.js`、`6204a5e` 回帰。 | 未確認 |
| WAP-0012 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx` `src/style.css`。 | 未確認（旧版の大きな編集欄に不合格） |
| WAP-0013 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx`。 | 未確認 |
| WAP-0014 | 台帳へ回収 | `9612ef0` `src/batch-import.js` `tests/import-hold-diff.test.js`。 | 未確認 |
| WAP-0015 | 台帳へ回収 | `9612ef0` `tests/import-hold-database.test.js`。 | 未確認 |
| WAP-0016 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx`。 | 未確認 |
| WAP-0017 | 台帳へ回収 | `6204a5e` `src/line-import.js` `tests/import-hold-diff.test.js`。 | 未確認（旧版の全商品候補に不合格） |
| WAP-0018 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx`。 | 未確認 |
| WAP-0019 | 台帳へ回収 | `6204a5e` `src/batch-import.jsx`。 | 未確認 |
| WAP-0020 | 台帳へ回収 | `src/product-names.js` と `6204a5e` の照合条件。 | 未確認（旧版の登録名で再発） |
| WAP-0021 | 台帳へ回収 | `9612ef0` `tests/import-hold-diff.test.js`。本番の特別単位と通常単位は別ID。 | 未確認 |
| WAP-0022 | 台帳へ回収 | `9612ef0` `tests/import-hold-diff.test.js`。 | 未確認 |
| WAP-0023 | 台帳へ回収 | `aa76ca8` `tests/excel-lifecycle.test.js`。 | 未確認 |
| WAP-0024 | 台帳へ回収 | `aa76ca8` `tests/fixed-price-flow.test.js`。 | 未確認 |
| WAP-0025 | 台帳へ回収 | `aa76ca8` `tests/fixed-price-flow.test.js`。 | 未確認 |
| WAP-0026 | 台帳へ回収 | `aa76ca8` `tests/master-cleanup.test.js`。 | 未確認 |
| WAP-0027 | 台帳へ回収 | `aa76ca8` `tests/fixed-price-flow.test.js`。実データ精度の最新再評価はこの棚卸しで未実施。 | 未確認 |
| WAP-0028 | 台帳へ回収 | `aa76ca8` `tests/fixed-price-flow.test.js`。 | 未確認 |
| WAP-0029 | 台帳へ回収 | `aa76ca8` `src/orders.jsx`。 | 未確認 |
| WAP-0030 | 台帳へ回収 | `29b03ed` `tests/domain.test.js`。 | 未確認 |
| WAP-0031 | 台帳へ回収 | `29b03ed` `tests/collection-workflow.test.js`。 | 未確認 |
| WAP-0032 | 台帳へ回収 | `8165776` `tests/collection-database.test.js`。 | 未確認 |
| WAP-0033 | 台帳へ回収 | `0af34de` `tests/collection-workflow.test.js`。 | 未確認 |
| WAP-0034 | 台帳へ回収 | `face2aa` `tests/domain.test.js`。 | 未確認 |
| WAP-0035 | 台帳へ回収 | `face2aa` `tests/domain.test.js`。 | 未確認 |
| WAP-0036 | 台帳へ回収 | `a445423` `tests/round-progress.test.js`。 | 未確認 |
| WAP-0037 | 台帳へ回収 | `b7c5c83` `tests/round-progress.test.js`。 | 未確認 |
| WAP-0038 | 台帳へ回収 | `b7c5c83` `tests/round-close-database.test.js`。 | 未確認 |
| WAP-0039 | 台帳へ回収 | `a445423` `tests/domain.test.js`。 | 未確認 |
| WAP-0040 | 台帳へ回収 | `a445423` `tests/round-activity.test.js`。 | 未確認 |
| WAP-0041 | 台帳へ回収 | `6204a5e` `src/style.css` `tests/browser/ux-density.spec.js`。 | 未確認 |
| WAP-0042 | 台帳へ回収 | `6204a5e` は対象部品の一部に適用。全記号・全リンクの統一は部分完了。 | 未確認 |
| WAP-0043 | 台帳へ回収 | `6204a5e` `src/style.css`。 | 未確認 |
| WAP-0044 | 台帳へ回収 | `20516c6` `face2aa` `6204a5e`。前回報告は全画面統一を部分完了とした。 | 未確認 |
| WAP-0045 | 台帳へ回収 | `b7c5c83` `src/orders.jsx`。 | 未確認 |
| WAP-0046 | 台帳へ回収 | `20516c6` `tests/print-prep.test.js`。 | 未確認 |
| WAP-0047 | 台帳へ回収 | `3d3e161` `f0efdda` `tests/browser/print-webkit.spec.js`。 | 未確認 |
| WAP-0048 | 台帳へ回収 | `883e5e0` `tests/snack-billing.test.js`。 | 未確認 |
| WAP-0049 | 台帳へ回収 | `docs/BUSINESS_RULES.md` `tests/domain.test.js`。 | 未確認 |
| WAP-0050 | 台帳へ回収 | `883e5e0` `tests/other-sales.test.js`。 | 未確認 |
| WAP-0051 | 台帳へ回収 | `29b03ed` `20516c6` `tests/domain.test.js`。 | 未確認 |
| WAP-0052 | 台帳へ回収 | `20516c6` `tests/browser/ux-density.spec.js`。 | 未確認 |
| WAP-0053 | 台帳へ回収 | `6204a5e` 公開前後 revision 79・同一ハッシュと報告。今回の文書作業も変更禁止。 | 対象外 |
| WAP-0054 | 部分完了 | `scripts/check-request-ledger.mjs`、依頼記録と67件を照合。残：別Chatの受領時自動登録の実運用確認。Issue #25へ継続。 | 対象外 |
| WAP-0055 | 台帳へ回収 | `a6b4018` `tests/print-pdf.test.js`。3代目が履歴から追加回収。元の利用者原文は未取得。 | 未確認 |
| WAP-0056 | 台帳へ回収 | `ad5bad0` `tests/print-prep.test.js`。3代目追加回収。実機合格は未取得。 | 未確認 |
| WAP-0057 | 台帳へ回収 | `217bc4d` `aa34da3` `src/ui.jsx` `tests/browser/workflow.spec.js`。3代目追加回収。IME候補の専用自動試験は未確認。原発言の細部は未確認。 | 未確認 |
| WAP-0058 | 台帳へ回収 | `d050475` `src/ui.jsx` `tests/browser/workflow.spec.js`。3代目追加回収。実機合格は未取得。 | 未確認 |
| WAP-0059 | 台帳へ回収 | `bf2f0bd` `src/sales.jsx`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0060 | 台帳へ回収 | `bf2f0bd` `src/sales.jsx` `src/ui.jsx`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0061 | 台帳へ回収 | `f0af0b5` `src/markets.jsx` `src/sales.jsx`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0062 | 台帳へ回収 | `d050475` `src/sales.jsx`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0063 | 台帳へ回収 | `d050475` `src/style.css`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0064 | 台帳へ回収 | `src/ui.jsx` `src/style.css`。PR #1は未統合の旧系列で、後続PR #5/#6と現行コードを照合する。。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0065 | 台帳へ回収 | `e7770aa` `src/collection-workflow.js` `tests/collection-workflow.test.js`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0066 | 台帳へ回収 | `e7770aa` `src/print-prep.jsx` `tests/print-prep.test.js`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |
| WAP-0067 | 台帳へ回収 | `d5c7676` `src/sales.jsx` `tests/browser/workflow.spec.js`。3代目がPR本文から追加回収。専用の受入試験と原発言の細部は未確認。 | 未確認 |

### 変更・維持・検証
- 元の対象ID集合とPR・完了報告を照合。受入条件、未知ID、結果行欠落、誤実機合格、旧意図の消失を検出する。
- ルール正本は REQUEST_HANDOFF、要望正本は REQUEST_LEDGER。既存の開発・会計・UX・CI手順を継承。
- テスト実績と保存読み戻しは docs/REQUEST_AUDIT_20261026.md、統合先SHA・CI結果はIssue #25へ記録。
- WAP-0001・0002は既存の6204a5eまで追跡。実機確認待ちを維持し、本PRでアプリ改修したとは報告しない。
- PRを作成しただけでChatの自動運用を完成扱いにしない。
