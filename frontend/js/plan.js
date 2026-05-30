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

  if (
    !planoNome ||
    !postsRestantes ||
    !planoAtual
  ) {
    return;
  }

  planoNome.innerText =
    plan === "pro"
      ? "👑 Plano PRO"
      : "👑 Plano FREE";

  postsRestantes.innerText =
    plan === "pro"
      ? "Posts ilimitados"
      : `${remaining} posts restantes`;

  planoAtual.innerText =
    plan === "pro"
      ? "PRO"
      : "FREE";

      const pricingSection =
  document.querySelector(".pricing-section");

if (pricingSection) {
  pricingSection.style.display =
    plano === "pro"
      ? "none"
      : "block";
}
}