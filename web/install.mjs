const installButton = document.querySelector('#install');
const installDialog = document.querySelector('#install-dialog');
const installSteps = document.querySelector('#install-steps');
const appMode = window.matchMedia(
  '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)',
);
const appleTouch =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (appleTouch) {
  installSteps.textContent =
    'In Safari, open Share → Add to Home Screen → Add. If shown, keep Open as Web App enabled. Then launch Knights Onrush from your home screen.';
} else if (/Android/.test(navigator.userAgent)) {
  installSteps.textContent =
    'In Chrome, open the ⋮ menu → Add to home screen or Install app, then confirm. If you opened this link inside another app, open it in Chrome first.';
} else if (
  /Mac/.test(navigator.platform) &&
  /Safari/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent)
) {
  installSteps.textContent =
    'In Safari, choose File → Add to Dock, then confirm Add. Launch Knights Onrush from your Dock. If Add to Dock is unavailable, try Chrome or Edge.';
} else {
  installSteps.textContent =
    'In Chrome or Edge, use the install icon in the address bar or look for Install in the browser menu. If no install option appears, open this site in Chrome or Edge.';
}
let installRequest = null;
let installed = Boolean(navigator.standalone) || appMode.matches;
function updateInstallHint() {
  installButton.hidden = installed || Boolean(navigator.standalone) || appMode.matches;
  if (installDialog.open && installButton.hidden) installDialog.close();
}
updateInstallHint();
appMode.addEventListener('change', updateInstallHint);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installRequest = event;
});
window.addEventListener('appinstalled', () => {
  installed = true;
  installRequest = null;
  updateInstallHint();
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && installDialog.open) installDialog.close();
});
installButton.onclick = async () => {
  const request = installRequest;
  if (!request) {
    installDialog.showModal();
    return;
  }
  installRequest = null;
  installButton.disabled = true;
  try {
    await request.prompt();
    const choice = await request.userChoice;
    if (choice.outcome === 'accepted') {
      installed = true;
      updateInstallHint();
    }
  } catch {
    installDialog.showModal();
  } finally {
    installButton.disabled = false;
  }
};
