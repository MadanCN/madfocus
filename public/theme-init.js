// Apply the saved theme before first paint so there is no flash
try {
  var t = localStorage.getItem('mf-theme');
  var dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
