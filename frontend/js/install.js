let deferredPrompt;

window.addEventListener(
  "beforeinstallprompt",
  (e) => {
    e.preventDefault();

    deferredPrompt = e;

    mostrarPopupInstalacao();
  }
);

function mostrarPopupInstalacao() {
  const popup = document.createElement("div");

  popup.className = "install-popup";

  popup.innerHTML = `
    <div class="install-card">

      <h3>📱 Instalar Aplicativo</h3>

      <p>
        Instale o Gerador IA no seu celular
        para acesso mais rápido.
      </p>

      <div class="install-actions">

        <button id="instalarApp">
          Instalar
        </button>

        <button id="fecharInstall">
          Agora não
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(popup);

  document
    .getElementById("fecharInstall")
    .addEventListener("click", () => {
      popup.remove();
    });

  document
    .getElementById("instalarApp")
    .addEventListener("click", async () => {

      if (!deferredPrompt) return;

      deferredPrompt.prompt();

      const choice =
        await deferredPrompt.userChoice;

      deferredPrompt = null;

      popup.remove();

      console.log(choice.outcome);
    });
}