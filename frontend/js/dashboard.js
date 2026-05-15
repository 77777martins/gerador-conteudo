export function atualizarDashboard() {
  const historico =
    JSON.parse(localStorage.getItem("historico")) || [];

  document.getElementById("totalPosts").innerText =
    historico.length;

  document.getElementById("totalUploads").innerText =
    historico.filter(item => item.imagem).length;
}