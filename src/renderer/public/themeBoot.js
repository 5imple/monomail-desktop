// Applies the saved theme to <html> before the first paint. ThemeProvider does
// the same once React has rendered, which left dark and black theme users
// with a white first frame on every launch. A classic (blocking) script, so it
// runs before anything is drawn; served from the app itself, as the content
// security policy requires. Keep the class names in step with ThemeProvider.
(function () {
  try {
    var theme = window.localStorage.getItem('ui-theme') || 'pure-light';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var classes = theme === 'black' ? ['dark', 'black'] : [theme];
    for (var i = 0; i < classes.length; i++) {
      document.documentElement.classList.add(classes[i]);
    }
  } catch (error) {
    // No storage (private mode, blocked): ThemeProvider applies the theme.
  }
})();
