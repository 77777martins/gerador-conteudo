export function atualizarDashboard() {
  const postsGerados =
    document.getElementById("postsGerados");

  const uploadsGerados =
    document.getElementById("uploadsGerados");

  const iaStatus =
    document.getElementById("iaStatus");

  if (postsGerados) {
    postsGerados.textContent = "0";
  }

  if (uploadsGerados) {
    uploadsGerados.textContent = "0";
  }

  if (iaStatus) {
    iaStatus.textContent = "ONLINE";
  }
}