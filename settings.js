//document.getElementById("settings-dialog").showModal();
//document.getElementById("ok-button").addEventListener("click", () => {
//});

function getCookie(name) {
  let matches = document.cookie.match(new RegExp(
    "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
  ));
  return matches ? decodeURIComponent(matches[1]) : null;
}
window.addEventListener('message', async (event) => {
    console.log(event);
    document.requestStorageAccess();
    const command = event.data[0];
    let result; 
    if (command == "set_common_settings") {
        const settings = event.data[1];
        document.cookie = `common_settings=${settings}`;
        result = "done";
    } else if (command == "get_common_settings") {
        result = getCookie("common_settings");
    } else if (command == "set_site_settings") {
        const site = event.data[1]
        const settings = event.data[2];
        document.cookie = `${encodeURIComponent(site)}=${encodeURIComponent(settings)}`;
        result = "done";
    } else if (command == "get_site_settings") {
        const site = event.data[1]
        const cookie = getCookie(encodeURIComponent(site));
        result = decodeURIComponent(cookie);
    } else {
        event.ports[0].postMessage({error: "unknown command"});
    }
    event.ports[0].postMessage({result});
});

