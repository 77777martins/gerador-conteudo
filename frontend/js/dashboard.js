import {
  buscarHistorico,
  pegarPerfil
} from "./api.js";

export async function atualizarDashboard() {
  const totalPosts =
    document.getElementById("totalPosts");

  const totalUploads =
    document.getElementById("totalUploads");

  const iaStatus =
    document.getElementById("iaStatus");

  try {
    const perfil = await pegarPerfil();
    const historico = await buscarHistorico();

    const lista = Array.isArray(historico)
      ? historico
      : [];

    if (totalPosts) {
      totalPosts.textContent =
        perfil?.posts_used ?? 0;
    }

    if (totalUploads) {
      totalUploads.textContent =
        lista.filter(item => item.imagem).length;
    }

    if (iaStatus) {
      iaStatus.textContent = "ONLINE";
    }
  } catch (err) {
    console.log("ERRO DASHBOARD:", err);
  }
}