import { buscarHistorico } from "./api.js";

export async function atualizarDashboard(
  historicoRecebido = null
) {

  const postsGerados =
    document.getElementById("postsGerados");

  const uploadsGerados =
    document.getElementById("uploadsGerados");

  const iaStatus =
    document.getElementById("iaStatus");

  try {

    const historico =
      historicoRecebido ||
      await buscarHistorico();

    const lista =
      Array.isArray(historico)
        ? historico
        : [];

    const totalPosts =
      lista.length;

    const totalUploads =
      lista.filter(
        item => item.imagem
      ).length;

    if (postsGerados) {
      postsGerados.textContent =
        totalPosts;
    }

    if (uploadsGerados) {
      uploadsGerados.textContent =
        totalUploads;
    }

    if (iaStatus) {
      iaStatus.textContent =
        "ONLINE";
    }

  } catch (err) {

    console.log(
      "ERRO DASHBOARD:",
      err
    );
  }
}