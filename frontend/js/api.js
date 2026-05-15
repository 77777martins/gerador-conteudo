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