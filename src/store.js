import { createClient } from "@supabase/supabase-js";
import { initialState, validate } from "./domain";
import { upgrade } from "./commerce";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!url && !!key;
export const client = configured ? createClient(url, key) : null;
export async function readWorkspace() {
  const { data, error } = await client
    .from("wappan_workspace")
    .select("data,revision,updated_at")
    .eq("id", true)
    .single();
  if (error)
    throw Error(
      "共有データを読み込めません。通信状態と係の利用登録を確認してください。",
    );
  return { state: upgrade(data.data || initialState()), revision: data.revision };
}
export async function writeWorkspace(revision, state, description) {
  validate(state);
  const { data, error } = await client.rpc("wappan_save", {
    expected_revision: revision,
    payload: state,
    description,
  });
  if (error) {
    if (error.code === "40001" || error.message.includes("CONFLICT"))
      throw Error(
        "別の係が先に保存しました。この入力は保存されていません。入力内容を控え、画面上部の「最新を読込」で更新してから入れ直してください。",
      );
    if(error.code==='42501')throw Error('係としての利用登録が必要です。ログインし直して確認してください。');
    if(/Unknown (event|stock) cost/.test(error.message))throw Error('対象商品の仕入原価が未確定です。納品・精算の原価を確認してください。');
    if(/Missing invoice/.test(error.message))throw Error('納品書の税込合計を入力してください。');
    if(error.code?.startsWith('P0')||error.code==='23514')throw Error(`保存内容を確認してください：${error.message}`);
    throw Error('共有データへ保存できませんでした。入力は画面に残っています。通信状態を確認してください。');
  }
  return data;
}
