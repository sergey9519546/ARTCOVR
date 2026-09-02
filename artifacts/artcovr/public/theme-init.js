(function () {
  try {
    var t = localStorage.getItem("theme");
    document.documentElement.dataset.theme =
      t === "light" || t === "dark" ? t : "dark";
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();