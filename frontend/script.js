export const API_URL =
  "http://localhost:3000";

let ultimoTexto = "";

async function gerarConteudo() {
  const gerarBtn = document.getElementById("gerarBtn");
  const tema = document.getElementById("tema").value.trim();
  const resultado = document.getElementById("resultado");
  const imagem = document.getElementById("imagem").files[0];

  if (!tema) {
    resultado.innerHTML = "Digite um tema 😅";
    return;
  }

  gerarBtn.disabled = true;
  gerarBtn.innerHTML = `
    <span class="loader"></span>
    Gerando com IA...
  `;

  resultado.innerHTML = `
    <div class="shimmer-box">
      <div class="shimmer-line"></div>
      <div class="shimmer-line medium"></div>
      <div class="shimmer-line"></div>
      <div class="shimmer-line short"></div>
    </div>
  `;

  try {
    const formData = new FormData();
    formData.append("tema", tema);

    if (imagem) {
      formData.append("imagem", imagem);
    }

    const response = await fetch(`${API_URL}/gerar`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      resultado.innerHTML = `
        <div class="error-card">
          <h3>🚧 IA temporariamente indisponível</h3>
          <p>${data.error || "Tente novamente em alguns instantes."}</p>
          <button onclick="virarPro()" class="pro-btn">
            👑 Ver Plano PRO
          </button>
        </div>
      `;

      return;
    }

    ultimoTexto = data.texto;

    salvarHistorico(data.texto, data.imagem || null);

    resultado.innerHTML = `
      <div id="textoIA"></div>

      ${
        data.imagem
          ? `
            <img
              src="${data.imagem}"
              style="
                width:100%;
                margin-top:20px;
                border-radius:20px;
              "
            >
          `
          : ""
      }

      <div class="plan-info">
        Plano: ${data.plan}
        |
        Restante: ${data.remaining}
      </div>
    `;

    atualizarPlanoVisual(data.plan, data.remaining);

    await digitarTexto(
      document.getElementById("textoIA"),
      data.texto
    );

    const copiarBtn = document.getElementById("copiarBtn");

    if (copiarBtn) {
      copiarBtn.style.display = "block";
    }

  } catch (err) {
    console.log(err);

    resultado.innerHTML = `
      <div class="error-card">
        <h3>Erro na conexão 😢</h3>
        <p>Verifique se o backend está rodando na porta 3000.</p>
      </div>
    `;
  } finally {
    gerarBtn.disabled = false;
    gerarBtn.innerHTML = "✨ Gerar Conteúdo";
  }
}

function copiarTexto() {
  if (!ultimoTexto) {
    mostrarToast("Nenhum texto para copiar");
    return;
  }

  navigator.clipboard.writeText(ultimoTexto);
  mostrarToast("✅ Texto copiado");
}

window.virarPro = async function () {
  try {
    const res = await fetch(`${API_URL}/pagamento`, {
      method: "POST"
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      mostrarToast("Erro ao gerar pagamento");
    }

  } catch (err) {
    console.log(err);
    mostrarToast("Erro na conexão");
  }
};

const inputImagem = document.getElementById("imagem");
const preview = document.getElementById("preview");

inputImagem.addEventListener("change", () => {

  const arquivo =
    inputImagem.files[0];

  if (!arquivo) {

    preview.style.display = "none";

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

    preview.style.display = "none";

    return;
  }

  if (arquivo.size > tamanhoMaximo) {

    mostrarToast(
      "Imagem muito grande 😢"
    );

    inputImagem.value = "";

    preview.style.display = "none";

    return;
  }

  preview.src =
    URL.createObjectURL(arquivo);

  preview.style.display =
    "block";
});
function salvarHistorico(texto, imagem) {
  let historico =
    JSON.parse(localStorage.getItem("historico")) || [];

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

function carregarHistorico() {
  const historico =
    JSON.parse(localStorage.getItem("historico")) || [];

  const historicoDiv = document.getElementById("historico");

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
          onclick="copiarHistorico(${index})"
        >
          📋 Copiar este post
        </button>

        ${
          item.imagem
            ? `
              <img src="${item.imagem}">
            `
            : ""
        }

        <div class="data-post">
          ${item.data}
        </div>
      </div>
    `;
  });
}

function mostrarToast(mensagem) {
  const toast = document.getElementById("toast");

  toast.innerHTML = mensagem;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function atualizarDashboard() {
  const historico =
    JSON.parse(localStorage.getItem("historico")) || [];

  document.getElementById("totalPosts").innerText =
    historico.length;

  document.getElementById("totalUploads").innerText =
    historico.filter(item => item.imagem).length;
}

async function digitarTexto(elemento, texto) {
  elemento.innerHTML = "";

  for (let i = 0; i < texto.length; i++) {
    elemento.innerHTML += texto.charAt(i);

    await new Promise(resolve =>
      setTimeout(resolve, 12)
    );
  }
}

function limparHistorico() {
  localStorage.removeItem("historico");

  carregarHistorico();
  atualizarDashboard();

  mostrarToast("🗑 Histórico apagado");
}

function copiarHistorico(index) {
  const historico =
    JSON.parse(localStorage.getItem("historico")) || [];

  const item = historico[index];

  if (!item) {
    mostrarToast("Post não encontrado");
    return;
  }

  navigator.clipboard.writeText(item.texto);
  mostrarToast("📋 Post copiado");
}

function atualizarPlanoVisual(plan, remaining) {
  const planoNome = document.getElementById("planoNome");
  const postsRestantes = document.getElementById("postsRestantes");
  const planoAtual = document.getElementById("planoAtual");

  if (!planoNome || !postsRestantes || !planoAtual) {
    return;
  }

  const planoFormatado =
    plan === "pro" ? "PRO" : "FREE";

  planoNome.innerText =
    plan === "pro"
      ? "👑 Plano PRO"
      : "👑 Plano FREE";

  postsRestantes.innerText =
    plan === "pro"
      ? "Posts ilimitados"
      : `${remaining} posts restantes`;

  planoAtual.innerText = planoFormatado;
}

const copiarBtn = document.getElementById("copiarBtn");

if (copiarBtn) {
  copiarBtn.addEventListener("click", copiarTexto);
}

carregarHistorico();
atualizarDashboard();