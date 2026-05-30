export function atualizarPlanoVisual(
  plan,
  remaining
) {
  const planoNome =
    document.getElementById("planoNome");

  const postsRestantes =
    document.getElementById("postsRestantes");

  const planoAtual =
    document.getElementById("planoAtual");

  const pricingSection =
    document.querySelector(".pricing-section");

  if (planoNome) {
    planoNome.innerText =
      plan === "pro"
        ? "👑 Plano PRO"
        : "👑 Plano FREE";
  }

  if (postsRestantes) {
    postsRestantes.innerText =
      plan === "pro"
        ? "Posts ilimitados"
        : `${remaining} posts restantes`;
  }

  if (planoAtual) {
    planoAtual.innerText =
      plan === "pro"
        ? "PRO"
        : "FREE";
  }

  if (pricingSection) {
    pricingSection.style.display =
      plan === "pro"
        ? "none"
        : "block";
  }
}