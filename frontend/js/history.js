import { atualizarDashboard } from "./dashboard.js";
import { mostrarToast } from "./ui.js";

import {
  buscarHistorico,
  salvarHistoricoAPI,
  limparHistoricoAPI
} from "./api.js";

let historicoAtual = [];

export async function salvarHistorico(texto, imagem) {
  await salvarHistoricoAPI(
    texto,
    imagem && !imagem.startsWith("data:image")
      ? imagem
      : null
  );

  await carregarHistorico();
  atualizarDashboard();
}

export async function carregarHistorico() {
  const historicoDiv =
    document.getElementById("historico");

  if (!historicoDiv) return;

  historicoAtual = await buscarHistorico();

  if (!Array.isArray(historicoAtual)) {
    historicoAtual = [];
  }

  historicoDiv.innerHTML = "";

  if (historicoAtual.length === 0) {
    historicoDiv.innerHTML = `
      <div class="historico-item">
        <p>Nenhum post gerado ainda.</p>
      </div>
    `;
    return;
  }

  historicoAtual.forEach((item, index) => {
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
                onerror="this.style.display='none'"
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
          ${new Date(item.created_at).toLocaleString()}
        </div>

      </div>
    `;
  });

  document
    .querySelectorAll(".copiar-historico-btn")
    .forEach(botao => {
      botao.addEventListener("click", () => {
        copiarHistorico(botao.dataset.index);
      });
    });
}

export async function limparHistorico() {
  await limparHistoricoAPI();

  await carregarHistorico();
  atualizarDashboard();

  mostrarToast("🗑 Histórico apagado");
}

export function copiarHistorico(index) {
  const item = historicoAtual[index];

  if (!item) {
    mostrarToast("Post não encontrado");
    return;
  }

  navigator.clipboard.writeText(item.texto);

  mostrarToast("📋 Post copiado");
}