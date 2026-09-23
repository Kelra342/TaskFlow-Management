window.addEventListener("load", function () {

    const loader = document.querySelector(".loader");

    setTimeout(function () {

        loader.classList.add("loader-hidden");

    }, 1200);

});

function togglePassword(inputId, iconId) {

    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);

    if (input.type === "password") {
        input.type = "text";
        icon.innerHTML = "🙈";
    } else {
        input.type = "password";
        icon.innerHTML = "👁";
    }

}