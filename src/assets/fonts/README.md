# 印刷PDF用日本語フォント

Noto Sans JP (Google Fonts / Adobe・Google)、SIL Open Font License 1.1。
出典: https://github.com/google/fonts/tree/main/ofl/notosansjp

`NotoSansJP[wght].ttf` の wght=400 を fontTools で静的インスタンス化した（TTF）。WOFFはPDF用フォント解析に大幅な時間を要したため使用していない。字形・収録文字は削減していない。ライセンス全文はOFL.txt。印刷時だけ読み込む。PDFライブラリによる日本語フォントのサブセット化で一部文字の描画欠落を検出したため、生成PDFにも完全なフォントを埋め込み、文字の再現を優先する（帳票PDFは約3.4MB）。
