# 外部リンクから到達する404の調査

調査日: 2026-09-06（日本時間）

## 結果

既知の `/products/1day-dataviz` に加え、外部ページの実際のリンクから到達する404を2 URL・5掲載ページで確認した。短縮URLを追跡して最終到達先をGETで確認した結果であり、検索インデックスに旧ページが残っていることだけを根拠にしていない。

### 追加1: 二日間講習

- 掲載リンク: `http://bit.ly/dvl-2day-maps`
- 転送: HTTP 301 → `https://data-viz-lectures.com/products/2days-data-map`
- 最終応答: HTTP 404
- リンク元（いずれも公開HTMLのa要素を確認）:
  - https://dv-school.connpass.com/event/170937/
  - https://dv-school.connpass.com/event/170938/
  - https://techplay.jp/event/774824
- 旧内容: データ取得・加工・可視化と主題地図を組み合わせた二日間講習。
- 対応候補: 旧講座の終了・再編を説明し、現行のデータクレンジング講座 `/posts/1day-wrangling/` と主題地図講座 `/posts/1day-map/` へ案内するページ。現行の一日講座とは範囲が一致しないため、一対一の後継を決めずに転送しない。

### 追加2: データ取得・加工・可視化の一日講習

- 掲載リンク: `http://bit.ly/dvl-data-everything`
- 転送: HTTP 301 → `https://data-viz-lectures.com/collections/%E8%AC%9B%E7%BF%92/products/1day-data-everything`
- 読みやすい表記: `/collections/講習/products/1day-data-everything`
- 最終応答: HTTP 404
- リンク元（いずれも公開HTMLのa要素を確認）:
  - https://dv-school.connpass.com/event/170958/
  - https://dv-school.connpass.com/event/175305/
- 旧内容: データ取得・クレンジング・整形から可視化までを扱う一日講習。
- 対応候補: `/posts/1day-wrangling/` を後継候補とする。ただし旧講座の可視化部分も含め、後継の位置づけを確認してから恒久転送する。
- 補足: `/products/1day-data-everything` もGETで404だった。ただし、この短い形式に対する外部リンクは今回確認していない。外部リンク確定件数には含めない。

### 既知URLの外部リンクを再確認

- リンク元: https://note.com/mierune/n/n6e1436a76311
- 掲載リンク: `https://data-viz-lectures.com/products/1day-dataviz`
- 最終応答: HTTP 404（調査時点）
- 現行ページへの301設定はローカルの `netlify.toml` に追加済み。本番未反映。

## 調査範囲と限界

- ドメイン名、旧URLのパス、講座名、掲載サイト別の公開ウェブ検索。
- Visualizing.JPの日英サイトマップからタグ・カテゴリー一覧を除く640 URLを確認。
- Notationの日英サイトマップから同様に106 URLを確認。
- 上記746 URLで見つかった講習サイト宛てのa要素はトップページ宛てのみ。トップページはGETでHTTP 200。
- MIERUNEのnote記事、TECH PLAYのグループページとイベント2件、ストアカの講座1件も確認。
- connpassの主催グループ `dv-school` のイベント一覧をページ送りし、11イベントを確認。うち4イベントで404へ到達する短縮リンクを発見。
- これらの直接取得対象は重複を除いて762 URL。リンク先の状態確認・検索での追加閲覧は別途実施。
- 公開HTMLのリンク抽出であり、JavaScriptで後から生成されるリンク、画像に書かれたURL、未検索・未掲載ページ、ログインが必要なSNS投稿、メール等は網羅していない。
- Search Consoleの外部リンク・404レポート、アクセスログ、有料被リンクデータベースは今回使用していない。外部リンク全体を網羅した結果ではない。
- 前回提示した旧プロフィール・旧講演等の404、および `/courses/d3`・`/courses/ai` は、今回の調査では外部ページからのリンクを確定できなかった。外部リンクがないと断定するものではない。

## 実装状態

調査後、ユーザーの依頼により既存の `netlify.toml` の `[[redirects]]` 形式で301転送を追加した。本番未反映。

| 旧パス | 転送先 |
| --- | --- |
| `/products/1day-dataviz` | `/posts/1day-essentials/` |
| `/collections/講習/products/1day-data-everything` | `/posts/1day-wrangling/` |
| `/collections/%E8%AC%9B%E7%BF%92/products/1day-data-everything` | `/posts/1day-wrangling/` |
| `/products/1day-data-everything` | `/posts/1day-wrangling/` |
| `/products/2days-data-map` | `/pages/2days-data-map/` |

二日間講習の転送先は既存のHugo固定ページ形式で追加し、旧形式の募集を行っていない旨と、現行のデータクレンジング・主題地図の両講座を案内する。一日講習はデータ取得・加工を扱う現行講座へ転送する。日本語表記とパーセントエンコード表記の両方を明記し、各ルールは最終ページへ直接転送する。
