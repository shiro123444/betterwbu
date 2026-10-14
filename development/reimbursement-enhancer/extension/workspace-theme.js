(() => {
 async function configure(){try{const s=await chrome.storage.local.get({enabled:true,visual:true,wallet:true});if(document.documentElement)document.documentElement.dataset.bwUi=String(s.enabled&&s.visual&&s.wallet)}catch{if(document.documentElement)document.documentElement.dataset.bwUi='false'}}
 configure();document.addEventListener('DOMContentLoaded',configure,{once:true});chrome.storage.onChanged.addListener(configure);
})();
