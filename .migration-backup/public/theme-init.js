(function () {
  try {
    var t = localStorage.getItem("theme");
    document.documentElement.dataset.theme =
      t === "light" || t === "dark" ? t : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();