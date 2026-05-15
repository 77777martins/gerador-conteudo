import { atualizarDashboard } from "./dashboard.js";
import { mostrarToast } from "./ui.js";

export function salvarHistorico(texto, imagem) {

  let historico =
    JSON.parse(
      localStorage.getItem("historico")
    ) || [];

  historico.unshift({
    texto,
    imagem,
    data: new Date().toLocaleString()
  });

  historico = historico.slice(0, 20);

  localStorage.setItem(
    "historico",
    JSON.stringify(historico)
  );

  carregarHistorico();
  atualizarDashboard();
}

export function carregarHistorico() {

  const historico =
    JSON.parse(
      localStorage.getItem("historico")
    ) || [];

  const historicoDiv =
    document.getElementById("historico");

  historicoDiv.innerHTML = "";

  if (historico.length === 0) {

    historicoDiv.innerHTML = `
      <div class="historico-item">
        <p>Nenhum post gerado ainda.</p>
      </div>
    `;

    return;
  }

  historico.forEach((item, index) => {

    historicoDiv.innerHTML += `
      <div class="historico-item">

        <div>${item.texto}</div>

        <button
          class="copiar-historico-btn"
          data-index="${index}"
        >
          📋 Copiar este post
        </button>

        ${
  item.imagem
    ? `
      <img
        src="${item.imagem}"
        class="historico-img"
      >

      <a
        href="${item.imagem}"
        download="post-ia.png"
        class="download-historico-btn"
      >
        ⬇️ Baixar imagem
      </a>
    `
    : ""
}

        <div class="data-post">
          ${item.data}
        </div>

      </div>
    `;
  });

  const botoesCopiar =
    document.querySelectorAll(
      ".copiar-historico-btn"
    );

  botoesCopiar.forEach(botao => {

    botao.addEventListener(
      "click",
      () => {

        const index =
          botao.dataset.index;

        copiarHistorico(index);
      }
    );
  });
}

export function limparHistorico() {

  localStorage.removeItem("historico");

  carregarHistorico();

  atualizarDashboard();

  mostrarToast(
    "🗑 Histórico apagado"
  );
}

export function copiarHistorico(index) {

  const historico =
    JSON.parse(
      localStorage.getItem("historico")
    ) || [];

  const item = historico[index];

  if (!item) {

    mostrarToast(
      "Post não encontrado"
    );

    return;
  }

  navigator.clipboard.writeText(
    item.texto
  );

  mostrarToast(
    "📋 Post copiado"
  );
}