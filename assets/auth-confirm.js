(function (root) {
  'use strict';
  function confirmationUrl(fragment) {
    const raw = String(fragment || '').replace(/^#/, '');
    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    if (url.origin !== 'https://wyxuekjikvflpcmlliwn.supabase.co' ||
        url.pathname !== '/auth/v1/verify' || url.username || url.password || url.hash ||
        url.searchParams.getAll('type').length !== 1 ||
        url.searchParams.get('type') !== 'signup') return null;
    const token = url.searchParams.get('token') || url.searchParams.get('token_hash');
    if (!token || !/^[A-Za-z0-9_-]{20,256}$/.test(token)) return null;
    const target = url.searchParams.get('redirect_to');
    if (target) {
      let redirect;
      try { redirect = new URL(target); } catch (_) { return null; }
      const valid = (redirect.origin === 'https://spodora.com' &&
        ['/', '/index.html', '/driver.html', '/company-register.html', '/company.html'].includes(redirect.pathname)) ||
        (redirect.origin === 'https://hs-azuma.github.io' &&
        ['/driver-spot/', '/driver-spot/driver.html', '/driver-spot/company-register.html'].includes(redirect.pathname));
      if (!valid || redirect.username || redirect.password || redirect.search || redirect.hash) return null;
    }
    return url.href;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { confirmationUrl };
  if (!root.document) return;
  const destination = confirmationUrl(root.location.hash);
  // Keep the one-time link in memory, never in storage, page text, or referrers.
  root.history.replaceState(null, '', root.location.pathname);
  const button = root.document.getElementById('confirmEmail');
  const message = root.document.getElementById('message');
  if (!destination) {
    message.textContent = '確認リンクが見つからないか、正しくありません。届いたメール内のリンクから開き直してください。';
    return;
  }
  button.disabled = false;
  button.addEventListener('click', function () {
    button.disabled = true;
    button.textContent = '確認中…';
    root.location.replace(destination);
  });
})(typeof window === 'undefined' ? globalThis : window);
