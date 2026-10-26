// Apply the saved theme and accent before first paint so there is no flash
try {
  var t = localStorage.getItem('mf-theme');
  var dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
  var a = localStorage.getItem('mf-accent');
  if (a && /^[a-z]+$/.test(a)) document.documentElement.setAttribute('data-accent', a);
} catch (e) {}
