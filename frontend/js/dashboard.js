import { buscarHistorico } from "./api.js";

export async function atualizarDashboard() {
  const postsGerados =
    document.getElementById("postsGerados");

  const uploadsGerados =
    document.getElementById("uploadsGerados");

  const iaStatus =
    document.getElementById("iaStatus");

  const historico = await buscarHistorico();

  console.log("HISTÓRICO DASHBOARD:", historico);

  const lista = Array.isArray(historico)
    ? historico
    : [];

  if (postsGerados) {
    postsGerados.textContent = lista.length;
  }

  if (uploadsGerados) {
    uploadsGerados.textContent =
      lista.filter(item => item.imagem).length;
  }

  if (iaStatus) {
    iaStatus.textContent = "ONLINE";
  }
}