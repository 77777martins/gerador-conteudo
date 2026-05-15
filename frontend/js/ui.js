export function mostrarToast(mensagem) {

  const toast =
    document.getElementById("toast");

  toast.innerHTML = mensagem;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

export async function digitarTexto(
  elemento,
  texto
) {

  elemento.innerHTML = "";

  for (let i = 0; i < texto.length; i++) {

    elemento.innerHTML +=
      texto.charAt(i);

    await new Promise(resolve =>
      setTimeout(resolve, 12)
    );
  }
}