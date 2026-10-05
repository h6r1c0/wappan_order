import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { client, configured, readWorkspace, writeWorkspace } from "./store";
import { validate } from "./domain";
import { upgrade } from "./commerce";
import { AppContext, Button, Field } from "./ui";
import { Orders } from "./orders";
import { Reports } from "./reports";
import { Masters } from "./masters";
import { StaffSettings } from "./staff-settings";
import "./style.css";
function App() {
  const [session, setSession] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [state, setState] = useState(null),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState("業務"),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [epoch, setEpoch] = useState(0),
    [recovery, setRecovery] = useState(false),
    [newer, setNewer] = useState(false);
  const lock = useRef(false),
    revisionRef = useRef(0);
  const notify = (text) => setMessage(text);
  useEffect(() => {
    if (message !== '保存しました') return;
    const timeout = setTimeout(() => setMessage(''), 2500);
    return () => clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    if (!client) {
      setAuthLoading(false);
      return;
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) notify("ログイン状態を確認できませんでした");
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!session) setState(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const load = async () => {
    setLoading(true);
    try {
      const d = await readWorkspace();
      setState(d.state);
      setRevision(d.revision);
      revisionRef.current = d.revision;
      setEpoch((x) => x + 1);
      setNewer(false);
    } catch (e) {
      notify(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (session?.user.id) load();
  }, [session?.user.id]);
  useEffect(() => {
    if (!session) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await client
        .from("wappan_workspace")
        .select("revision")
        .eq("id", true)
        .maybeSingle();
      if (data && data.revision > revisionRef.current) setNewer(true);
    };
    const timer = setInterval(check, 20000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [session?.user.id]);
  useEffect(() => {
    const handler = (e) => {
      if (
        document.querySelector('[role="dialog"], [data-unsaved="true"]') ||
        saving
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving]);
  const save = async (change, description) => {
    if (lock.current) return false;
    lock.current = true;
    setSaving(true);
    try {
      const next = structuredClone(state);
      change(next);
      upgrade(next);
      validate(next);
      const rev = await writeWorkspace(revision, next, description);
      setState(next);
      setRevision(rev);
      revisionRef.current = rev;
      notify("保存しました");
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <header className={!session ? 'login-header' : 'workspace-header'}>
        {session ? <img className="workspace-logo" src={new URL("../wappan_title_logo_display.png", import.meta.url).href} alt="わっぱん" /> : <>
          <img className="school-logo"
            src={new URL("../ohisama_header_logo.png", import.meta.url).href}
            alt="おひさま保育園" />
          <img className="login-brand"
            src={new URL("../wappan_title_logo_display.png", import.meta.url).href}
            alt="わっぱん" />
        </>}
        {session && (
          <Button
            secondary
            onClick={async () => {
              if (confirm("ログアウトしますか？未保存の入力は失われます。")) {
                const { error } = await client.auth.signOut();
                if (error) notify("ログアウトできませんでした。通信状態を確認してください。");
                else { setSession(null); setState(null); }
              }
            }}
          >
            ログアウト
          </Button>
        )}
      </header>
      {message && (
        <div
          role="alert"
          className={`toast ${message === "保存しました" ? "success" : ""}`}
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage("")}
            aria-label="お知らせを閉じる"
          >
            ×
          </button>
        </div>
      )}
      {!configured ? (
        <main className="login">
          <h1>利用開始の準備</h1>
          <p>
            まだ共有データベースへ接続されていません。係のログインと共有保存を設定すると利用できます。
          </p>
          <a
            className="button"
            href="https://github.com/h6r1c0/wappan_order/blob/main/docs/SETUP.md"
            target="_blank"
            rel="noreferrer"
          >
            接続の準備手順を開く
          </a>
          <p>接続前に購入者名や注文内容は入力できません。</p>
        </main>
      ) : authLoading ? (
        <main>
          <p>ログイン状態を確認しています…</p>
        </main>
      ) : !session ? (
        <Login notify={notify} />
      ) : recovery ? (
        <PasswordReset done={() => setRecovery(false)} notify={notify} />
      ) : (
        <AppContext.Provider value={{ state, save, notify, saving }}>
          <div className={`sync ${saving || loading || newer || !state ? '' : 'sync-idle'}`}>
            <span>
              {saving
                ? "共有データへ保存中…"
                : loading
                  ? "読み込み中…"
                  : newer
                    ? "別の係がデータを更新しました"
                    : "共有中"}
            </span>
            <Button
              secondary
              disabled={loading || saving}
              onClick={() => {
                if (
                  confirm(
                    "最新データを読み込みます。未保存の入力は失われます。続けますか？",
                  )
                )
                  load();
              }}
            >
              最新を読込
            </Button>
          </div>
          {state ? (
            <>
              <main key={epoch} aria-busy={saving}>
                <fieldset disabled={saving} className="workspace">
                  {page === "業務" ? (
                    <Orders />
                  ) : page === "集計" ? (
                    <Reports />
                  ) : page === "設定" ? <Settings userId={session.user.id}/> : <section className="usage-guide"><h1>使い方</h1>
                    <ol><li>注文を入力する</li><li>発注数を確認して注文確定</li><li>納品後、欠品・販売先・おやつ・仕入額を確認</li><li>集金を記録する</li></ol>
                    <p>欠品時は03 納品・精算で配分を確認してから確定します。</p>
                  </section>}
                </fieldset>
              </main>
              <nav aria-label="主な業務">
                {[
                  ["業務", "order"],
                  ["集計", "report"],
                  ["設定", "people"],
                  ["使い方", "event"],
                ].map(([label, icon]) => (
                  <button
                    type="button"
                    key={label}
                    className={page === label ? "active" : ""}
                    onClick={() => {
                      if (
                        document.querySelector(
                          '[role="dialog"], [data-unsaved="true"]',
                        ) &&
                        !confirm(
                          "入力画面を閉じて移動しますか？未保存の内容は失われます。",
                        )
                      )
                        return;
                      setPage(label);
                      window.scrollTo(0, 0);
                    }}
                  >
                    <Icon type={icon} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </>
          ) : (
            <main>
              <p>
                {loading
                  ? "共有データを読み込んでいます…"
                  : "共有データに接続できません。「最新を読込」で再試行してください。"}
              </p>
            </main>
          )}
        </AppContext.Provider>
      )}
    </>
  );
}
function Settings({ userId }) {
  const [area,setArea]=useState('商品・購入者');
  return <>
    <div className="settings-nav" role="tablist" aria-label="設定の対象">
      {['商品・購入者','係・権限'].map(label=><button type="button" key={label} role="tab" aria-selected={area===label}
        onClick={()=>setArea(label)}>{label}</button>)}
    </div>
    {area==='商品・購入者'?<Masters/>:<StaffSettings userId={userId}/>}
  </>;
}
function Login({ notify }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          setBusy(true);
          const { error } = await client.auth.signInWithPassword({
            email: String(fields.get("email") || "").trim(),
            password: String(fields.get("password") || ""),
          });
          if (error)
            notify(
              "ログインできません。メールアドレス・パスワードと通信状態を確認してください。",
            );
          setBusy(false);
        }}
      >
        <Field
          label="メールアドレス"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="パスワード"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          ログイン
        </Button>
      </form>
      <Button
        className="login-reset"
        disabled={busy}
        onClick={async () => {
          const resetEmail = document.querySelector('.login input[name="email"]')?.value.trim() || email;
          if (!resetEmail) {
            notify("先にメールアドレスを入力してください");
            return;
          }
          setBusy(true);
          const { error } = await client.auth.resetPasswordForEmail(resetEmail, {
            redirectTo: location.origin + location.pathname,
          });
          notify(
            error
              ? "再設定メールを送れませんでした。通信状態を確認してください。"
              : "登録がある場合、パスワード再設定メールが届きます。",
          );
          setBusy(false);
        }}
      >
        パスワードを忘れた方
      </Button>
      <p className="login-help">係として登録された方のみ利用できます。</p>
    </main>
  );
}
function PasswordReset({ done, notify }) {
  const [password, setPassword] = useState("");
  return (
    <main className="login">
      <h1>パスワードを設定</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await client.auth.updateUser({ password });
          if (error) notify("パスワードを更新できませんでした");
          else {
            notify("パスワードを更新しました");
            done();
          }
        }}
      >
        <Field
          label="新しいパスワード（12文字以上）"
          type="password"
          minLength="12"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit">パスワードを保存</Button>
      </form>
    </main>
  );
}
function Icon({ type }) {
  const paths = {
    order: "M8 3h8v4H8z M6 5H4v16h16V5h-2 M8 12h8 M8 16h6",
    shop: "M3 10h18l-2-6H5z M5 10v11h14V10 M9 21v-7h6v7",
    market: "M4 5h16l1 5H3z M5 10v10h14V10 M8 14h3 M14 14h3",
    event: "M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16 M8 15h2 M14 15h2",
    report: "M4 3v18h17 M8 17v-5 M13 17V8 M18 17V4",
    people:
      "M16 21v-3a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v3 M10 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M17 5a3 3 0 0 1 0 6 M19 15a3 3 0 0 1 2 3v3",
  };
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[type]} />
    </svg>
  );
}
createRoot(document.getElementById("root")).render(<App />);
