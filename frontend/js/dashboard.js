import { buscarHistorico } from "./api.js";

export async function atualizarDashboard() {

  const postsGerados =
    document.getElementById("postsGerados");

  const uploadsGerados =
    document.getElementById("uploadsGerados");

  const iaStatus =
    document.getElementById("iaStatus");

  try {

    const historico =
      await buscarHistorico();

    const totalPosts =
      Array.isArray(historico)
        ? historico.length
        : 0;

    const totalUploads =
      Array.isArray(historico)
        ? historico.filter(
            item => item.imagem
          ).length
        : 0;

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
      "Erro dashboard:",
      err
    );
  }
}