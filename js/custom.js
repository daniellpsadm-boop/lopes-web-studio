(function () {
  document.querySelectorAll('.main-menu a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function () {
      var hamburger = document.querySelector(".mxd-nav__hamburger.nav-open");
      if (hamburger) hamburger.click();
    });
  });
})();
