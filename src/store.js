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
    throw Error(
      `保存できませんでした。入力は画面に残っています。通信状態を確認してください。${error.code === "42501" ? " 係としての利用登録が必要です。" : ""}`,
    );
  }
  return data;
}
