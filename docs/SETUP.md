# 利用準備

## 2026年9月15日時点の完了状況

- Supabaseプロジェクト **wappan-order** を Shoko’s Org の無料プラン、東京リージョンで作成済み。
- Project ref: `vywgmxegeemlpsescika`
- Project URL: `https://vywgmxegeemlpsescika.supabase.co`
- DB、RLS、共有保存、更新履歴、競合防止を適用済み。既知の商品8件・購入者2件・固定注文を初期登録済み。実注文・テスト注文は0件。
- ローカル接続設定と本番ビルドを確認済み。秘密キーは使用していません。
- Authユーザー1名を登録し、係の利用権限を確認済み。GitHub mainへの反映は接続側の書込権限不足で未完了。公開URLはまだ利用開始できません。

**このプロジェクトでSQLを再実行する必要はありません。係のアカウント作成後、係の利用権限登録はこちらで進めます。**

別の新規プロジェクトに復元する場合だけ、`supabase/migrations/` のSQLをファイル番号順に適用してください。番号は実環境のmigration履歴と一致させています。

## 係のログインを登録

1. **Authentication → Users → Add user → Create new user** で、利用する係のメールアドレス・初期パスワードを登録します。メール確認済み（Auto Confirm User）にします。係ごとに別アカウントを作成してください。
2. SQL Editorで次のSQLのメールアドレスだけを実際の係に変えて実行します。1人から開始でき、後で追加できます。

```sql
insert into wappan_private.wappan_staff(user_id)
select id from auth.users
where lower(email) in (lower('係の実際のメールアドレス'))
on conflict do nothing;
```

**Results が INSERT 0 0 の場合は、メールアドレスとAuthのユーザー登録を確認してください。** Authにアカウントがあるだけでは注文データにアクセスできません。上記の係登録も必要です。

利用停止は次のSQLでできます。過去の業務データ・履歴は残ります。

```sql
delete from wappan_private.wappan_staff
where user_id in (select id from auth.users where lower(email)=lower('停止する係のメールアドレス'));
```

**Authentication の設定**で一般ユーザーの新規サインアップを無効にしてください。アプリにも一般公開の登録フォームはありません。

## 接続設定

`.env.production` にプロジェクトURLとブラウザー用Publishable keyを設定済みです。Actions変数へのコピーは不要です。秘密キーは含めていません。データはAuthとRLSで保護します。

## スマートフォンから開けるようにする

このリポジトリにはGitHub Pages用の公開ワークフローを用意しています。

1. [Pages設定](https://github.com/h6r1c0/wappan_order/settings/pages)の **Build and deployment → Source** を **GitHub Actions** にします。
2. [Actions](https://github.com/h6r1c0/wappan_order/actions/workflows/app.yml)の **Wappan app → Run workflow** で、**Publish to GitHub Pages** をオンにして実行します。

緑の完了表示になった後のURL： **https://h6r1c0.github.io/wappan_order/**

main更新時には自動で検証・公開します。接続情報を変更したらワークフローを再実行してください。DB未設定での実運用はできません。

Supabase **Authentication → URL Configuration** の **Site URL** と **Redirect URLs** に、このアプリURLを設定してください。パスワード再設定メールがアプリへ戻れるようになります。メール送信の運用制限がある場合はSupabase側のSMTP設定を確認してください。

## 最後の接続確認

- 所有者の端末でログインして、テスト注文回を1件保存する。
- 別の係の端末でログインして「最新を読込」。同じテスト注文が見えることを確認する。
- ログアウトしたブラウザーで開き、購入者や注文が表示されないことを確認する。
- ログインした別の未登録アカウントでも共有データが取得できないことを確認する。

実DBのアクセス制御は検証済みですが、利用者のログインと実端末共有はまだ未確認です。接続後に[9月11日分の照合](ACCEPTANCE.md)へ進みます。
