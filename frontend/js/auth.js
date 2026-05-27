import { API_URL } from "./config.js";

const SUPABASE_URL =
  "https://pwffqajfzyhewcannguz.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3ZmZxYWpmenloZXdjYW5uZ3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTA5MzIsImV4cCI6MjA5NTQ4NjkzMn0.SsGyAv7PNuM_pPd_WkITJGd1sPQZ6M9gz-LYXlnzRmA";

export const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

export async function cadastrarUsuario(email, senha) {
  const { data, error } =
    await supabaseClient.auth.signUp({
      email,
      password: senha
    });

  if (error || !data.user) {
    return { data, error };
  }

  try {
    await fetch(`${API_URL}/criar-perfil`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: data.user.id,
        email: data.user.email
      })
    });
  } catch (err) {
    console.log("Perfil ainda não criado:", err);
  }

  return { data, error };
}

export async function logarUsuario(email, senha) {
  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password: senha
    });

  return { data, error };
}

export async function pegarUsuarioAtual() {
  const { data } =
    await supabaseClient.auth.getUser();

  return data.user;
}

export async function sairUsuario() {
  await supabaseClient.auth.signOut();
}