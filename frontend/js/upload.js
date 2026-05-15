import { mostrarToast } from "./ui.js";

const inputImagem =
  document.getElementById("imagem");

const preview =
  document.getElementById("preview");

export function iniciarUpload() {

  inputImagem.addEventListener(
    "change",
    () => {

      const arquivo =
        inputImagem.files[0];

      if (!arquivo) {

        preview.style.display =
          "none";

        return;
      }

      const formatosPermitidos = [
        "image/png",
        "image/jpeg",
        "image/webp"
      ];

      const tamanhoMaximo =
        5 * 1024 * 1024;

      if (
        !formatosPermitidos.includes(
          arquivo.type
        )
      ) {

        mostrarToast(
          "Formato inválido 😢"
        );

        inputImagem.value = "";

        preview.style.display =
          "none";

        return;
      }

      if (arquivo.size > tamanhoMaximo) {

        mostrarToast(
          "Imagem muito grande 😢"
        );

        inputImagem.value = "";

        preview.style.display =
          "none";

        return;
      }

      preview.src =
        URL.createObjectURL(
          arquivo
        );

      preview.style.display =
        "block";
    }
  );
}