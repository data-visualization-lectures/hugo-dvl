# GA4 運用セットアップ（売上改善）

講習販売サイトのコンバージョン計測を、GA4 管理画面で活用するための手順です。コード側のイベント実装と合わせて、この設定を完了してください。

## 1. 計測されているイベント

| イベント | 意味 | 主なパラメータ |
|---|---|---|
| `view_item` | 講習ページで商品情報を表示 | `course_key`, `value`, `items` |
| `form_view` | 申し込みフォームが画面内に入った | `course_key`, `form_name` |
| `form_start` | フォーム入力開始 | `course_key` / `contact` |
| `select_item` | 希望日程を選択 | `schedule`, `items` |
| `select_content` | CTA / 外部導線クリック | `content_type`, `link_url` |
| `generate_lead` | 申込フォーム送信 or お問い合わせ完了 | `form_name`, `course_key` |
| `begin_checkout` | Stripe Checkout 開始 | ecommerce |
| `purchase` | 決済完了 | `transaction_id`, ecommerce |

`purchase` は次の2経路で送られます。

1. ブラウザ: `/pages/checkout-complete/`（consent 許可時）
2. サーバ: Stripe Webhook → Measurement Protocol

どちらも `transaction_id = Stripe Checkout Session ID` を使うため、同一ユーザーでは GA4 側で重複排除されます。サーバ側はブラウザ未到達・consent 拒否時の取りこぼし防止が目的です。

## 2. Netlify / Stripe 環境変数

本番 Netlify に次を設定します。

| 変数 | 用途 |
|---|---|
| `STRIPE_SECRET_KEY` | Checkout Session 作成（既存） |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証 |
| `GA4_API_SECRET` | Measurement Protocol 認証 |
| `GA4_MEASUREMENT_ID` | 省略時は `G-GGNSDEK3RD` |

### GA4 API Secret の作成

1. GA4 管理 → データストリーム → Web ストリーム
2. Measurement Protocol API secrets → 作成
3. 表示された Secret を `GA4_API_SECRET` に設定

### Stripe Webhook の作成

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://data-viz-lectures.com/.netlify/functions/stripe-webhook`
3. 監視イベント:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. Signing secret を `STRIPE_WEBHOOK_SECRET` に設定

## 3. キーイベント化

GA4 管理 → イベント で、次をキーイベント（旧コンバージョン）に設定します。

必須:

- `purchase`
- `generate_lead`
- `begin_checkout`

推奨（ファネル分析用）:

- `view_item`
- `form_start`
- `form_view`

## 4. 探索レポート（ファネル）

探索 → ファネル探索 を新規作成し、次のステップを設定します。

### 講習申込ファネル

1. `view_item`
2. `form_view`
3. `form_start`
4. `select_item`（任意）
5. `generate_lead`
6. `begin_checkout`
7. `purchase`

内訳ディメンション候補:

- `course_key` / `course_name`
- `content_category`
- セッションのデフォルトチャネルグループ
- `schedule`

### 外部導線

フリーフォームまたはセグメントで `select_content` を監視し、`content_type` / `link_domain` 別にクリック数を確認します。

- `external_link_card`
- `home_feature_card`
- `outbound_sales_link`（パーソナルトレーニング / Udemy）

## 5. 週次で見る最小ダッシュボード

毎週同じ条件で確認する項目です（期間: 直近7日、比較: 前週）。

1. **収益**: 総収益、`purchase` 数、講座別収益（`course_name`）
2. **CVR**: `view_item` → `purchase`、および `begin_checkout` → `purchase`
3. **リード**: `generate_lead`（講習 vs contact）
4. **離脱箇所**: ファネル探索で落ちが大きいステップ
5. **流入**: チャネル別の `purchase` / 収益
6. **外部導線**: `select_content` のクリック上位

標準レポートのショートカット:

- レポート → エンゲージメント → イベント
- レポート → 収益化 → 収益化の概要 / e コマース購入数
- 探索で保存したファネルをブックマーク

## 6. 動作確認チェックリスト

1. 本番で講習ページを開き、DebugView（またはリアルタイム）に `view_item` が出る
2. フォームへスクロール → `form_view`、入力開始 → `form_start`、日程選択 → `select_item`
3. 申し込み → `generate_lead` → `begin_checkout` → Stripe へ遷移
4. テスト決済完了 → ブラウザ `purchase`（`event_source=browser`）
5. Stripe Webhook ログが 200、サーバ `purchase`（`event_source=server`）が届く
6. 同一 `transaction_id` の二重カウントがレポート上で問題ないことを翌日以降に確認

## 7. 注意事項

- プレビュー / ブランチデプロイには GA ID を入れない（本番ノイズ防止）
- Consent で拒否した場合、ブラウザイベントは送られない。サーバ `purchase` は届くが、`ga_client_id` が無いとチャネル紐付けは弱くなる
- 広告（Google Ads / Meta）は現状未接続。出稿を始める場合は Consent Mode の `ad_*` 設計から見直す
