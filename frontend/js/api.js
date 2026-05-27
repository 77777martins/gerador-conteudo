import { API_URL } from "./config.js";
import { supabaseClient } from "./auth.js";

export async function gerarPost(formData) {

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const token = session?.access_token;

  console.log("TOKEN:", token);

  const response = await fetch(
    `${API_URL}/gerar`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${token}`
      },

      body: formData
    }
  );

  const data = await response.json();

  return {
    response,
    data
  };
}

export async function criarPagamento() {

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const token = session?.access_token;

  const response = await fetch(
    `${API_URL}/pagamento`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  return data;
}

export async function pegarPerfil() {

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const token = session?.access_token;

  const response = await fetch(
    `${API_URL}/perfil`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.json();
}
export async function buscarHistorico() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const response = await fetch(`${API_URL}/historico`, {
    headers: {
      Authorization: `Bearer ${session?.access_token}`
    }
  });

  return response.json();
}

export async function salvarHistoricoAPI(texto, imagem) {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const response = await fetch(`${API_URL}/historico`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`
    },
    body: JSON.stringify({
      texto,
      imagem
    })
  });

  return response.json();
}

export async function limparHistoricoAPI() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const response = await fetch(`${API_URL}/historico`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session?.access_token}`
    }
  });

  return response.json();
}