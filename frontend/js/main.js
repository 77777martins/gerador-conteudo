import {
  cadastrarUsuario,
  logarUsuario,
  pegarUsuarioAtual,
  sairUsuario
} from "./auth.js";

import {
  gerarPost,
  criarPagamento,
  pegarPerfil
} from "./api.js";

import { atualizarPlanoVisual } from "./plan.js";
import { iniciarUpload } from "./upload.js";

import {
  salvarHistorico,
  carregarHistorico,
  limparHistorico
} from "./history.js";

import { atualizarDashboard } from "./dashboard.js";

import {
  mostrarToast,
  digitarTexto
} from "./ui.js";

let ultimoTexto = "";

async function carregarPerfil() {
  try {
    const perfil = await pegarPerfil();

    if (perfil.error) {
      return;
    }

    atualizarPlanoVisual(
      perfil.plan,
      perfil.plan === "free"
        ? Math.max(3 - perfil.posts_used, 0)
        : "∞"
    );
  } catch (err) {
    console.log("Erro ao carregar perfil:", err);
  }
}

async function verificarAuth() {
  const usuario = await pegarUsuarioAtual();
  const authModal = document.getElementById("authModal");

  if (!authModal) return null;

  if (usuario) {
    authModal.style.display = "none";
    return usuario;
  }

  authModal.style.display = "flex";
  return null;
}

async function iniciarApp() {
  iniciarUpload();

  const usuario = await verificarAuth();

  if (usuario) {
    localStorage.setItem("user_id", usuario.id);

    await carregarPerfil();
    await carregarHistorico();
    await atualizarDashboard();
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get("payment") === "success") {
    mostrarToast("Pagamento aprovado ✅ Atualizando plano...");

    setTimeout(async () => {
      await carregarPerfil();
    }, 2000);

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }

  if (params.get("payment") === "cancel") {
    mostrarToast("Pagamento cancelado");

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }
}

async function gerarConteudo() {
  const gerarBtn = document.getElementById("gerarBtn");
  const tema = document.getElementById("tema").value.trim();
  const resultado = document.getElementById("resultado");
  const imagem = document.getElementById("imagem").files[0];

  if (gerarBtn.disabled) {
    return;
  }

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
    <div class="ai-loading">
      <div class="ai-loader"></div>

      <h3>
        🤖 IA criando conteúdo...
      </h3>

      <p>
        Gerando estratégia, copy e marketing.
      </p>
    </div>
  `;

  try {
    const formData = new FormData();
    formData.append("tema", tema);

    if (imagem) {
      formData.append("imagem", imagem);
    }

    const { response, data } = await gerarPost(formData);

    if (!response.ok || data.error) {
      resultado.innerHTML = `
        <div class="error-card">
          <h3>🚧 Não foi possível gerar</h3>
          <p>${data.error || "Tente novamente em alguns instantes."}</p>

          <button id="erroProBtn" class="pro-btn">
            👑 Ver Plano PRO
          </button>
        </div>
      `;

      document
        .getElementById("erroProBtn")
        ?.addEventListener("click", virarPro);

      return;
    }

    ultimoTexto = data.texto;

 await salvarHistorico(
  data.texto,
  data.imagem || null
);

   resultado.innerHTML = `
  <div class="resultado-card">

    <div class="resultado-header">
      <span>✨ Conteúdo gerado</span>
      <strong>${data.plan.toUpperCase()}</strong>
    </div>

    <div id="textoIA"></div>

     ${
  data.imagem
    ? `
      <img
        src="${data.imagem}"
        class="imagem-gerada"
      >

      <a
        href="${data.imagem}"
        download="post-ia.png"
        class="download-btn"
      >
        ⬇️ Baixar Imagem
      </a>
    `
    : ""
}

          <div class="plan-info">
        Plano: ${data.plan}
        |
        Restante: ${data.remaining}
      </div>

  </div>
`;

    atualizarPlanoVisual(data.plan, data.remaining);

    await digitarTexto(
      document.getElementById("textoIA"),
      data.texto
    );

    document.getElementById("copiarBtn").style.display = "block";
  } catch (err) {
    console.log(err);

    resultado.innerHTML = `
      <div class="error-card">
        <h3>Erro na conexão 😢</h3>
        <p>Verifique se o backend está rodando.</p>
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

async function virarPro() {
  try {
    const data = await criarPagamento();

    if (data.url) {
      window.location.href = data.url;
    } else {
      mostrarToast(data.error || "Erro ao gerar pagamento");
    }
  } catch (err) {
    console.log(err);
    mostrarToast("Erro na conexão");
  }
}

async function fazerLogin() {
  const loginBtn = document.getElementById("loginBtn");
  const email = document.getElementById("authEmail").value.trim();
  const senha = document.getElementById("authSenha").value.trim();

  if (!email || !senha) {
    mostrarToast("Preencha email e senha");
    return;
  }

  loginBtn.disabled = true;

  try {
    const { error } = await logarUsuario(email, senha);

    if (error) {
      mostrarToast(error.message || "Erro ao entrar");
      return;
    }

    mostrarToast("Login realizado ✅");

const usuario =
  await pegarUsuarioAtual();

if (usuario) {
  localStorage.setItem(
    "user_id",
    usuario.id
  );
}

await verificarAuth();
await carregarPerfil();
carregarHistorico();

  } catch (err) {
    console.log(err);
    mostrarToast("Erro ao entrar");
  } finally {
    loginBtn.disabled = false;
  }
}

async function fazerCadastro() {
  const registerBtn = document.getElementById("registerBtn");
  const email = document.getElementById("authEmail").value.trim();
  const senha = document.getElementById("authSenha").value.trim();

  if (!email || !senha) {
    mostrarToast("Preencha email e senha");
    return;
  }

  registerBtn.disabled = true;

  try {
    const { error } = await cadastrarUsuario(email, senha);

    if (error) {
      mostrarToast(error.message || "Erro ao criar conta");
      return;
    }

    mostrarToast("Conta criada ✅");

const usuario =
  await pegarUsuarioAtual();

if (usuario) {
  localStorage.setItem(
    "user_id",
    usuario.id
  );
}

await verificarAuth();
await carregarPerfil();
carregarHistorico();

  } catch (err) {
    console.log(err);
    mostrarToast("Erro ao criar conta");
  } finally {
    registerBtn.disabled = false;
  }
}

async function fazerLogout() {
  localStorage.removeItem("user_id");
  await sairUsuario();

  mostrarToast("Você saiu da conta");

  setTimeout(() => {
    location.reload();
  }, 800);
}

document
  .getElementById("gerarBtn")
  ?.addEventListener("click", gerarConteudo);

document
  .getElementById("proBtn")
  ?.addEventListener("click", virarPro);

document
  .getElementById("pricingProBtn")
  ?.addEventListener("click", virarPro);

document
  .getElementById("heroProBtn")
  ?.addEventListener("click", virarPro);

document
  .getElementById("limparBtn")
  ?.addEventListener("click", limparHistorico);

document
  .getElementById("loginBtn")
  ?.addEventListener("click", fazerLogin);

document
  .getElementById("registerBtn")
  ?.addEventListener("click", fazerCadastro);

document
  .getElementById("logoutBtn")
  ?.addEventListener("click", fazerLogout);

document
  .getElementById("copiarBtn")
  ?.addEventListener("click", copiarTexto);

document
  .getElementById("authSenha")
  ?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      fazerLogin();
    }
  });

iniciarApp();