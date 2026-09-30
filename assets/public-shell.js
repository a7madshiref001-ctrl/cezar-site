(function () {
  'use strict';
  const dock = document.querySelector('.cezar-dock');
  if (!dock) return;

  // HTML Preview rewrites hashed links to the current file on subpages.
  // Rebuild only its preview URLs from the raw file location, never from rewritten hrefs.
  if (location.hostname === 'htmlpreview.github.io') {
    const rawFile = location.search.slice(1).split('?')[0];
    if (/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(index|join|member)\.html$/.test(rawFile)) {
      const rawDir = rawFile.slice(0, rawFile.lastIndexOf('/') + 1);
      const destinations = {
        home:'index.html#top', gym:'index.html#inside', prices:'index.html#pricing',
        join:'join.html', member:'member.html',
      };
      dock.querySelectorAll('a[data-dock]').forEach(link => {
        const destination = destinations[link.dataset.dock];
        if (destination) link.href = `https://htmlpreview.github.io/?${rawDir}${destination}`;
      });
    }
  }

  if (!document.querySelector('main#top')) return;
  const links = [...dock.querySelectorAll('a[data-dock]')];
  const inside = document.querySelector('#inside');
  const pricing = document.querySelector('#pricing');
  let queued = false;

  function updateCurrent() {
    queued = false;
    const position = window.scrollY + Math.min(window.innerHeight * .32, 280);
    const current = pricing && position >= pricing.offsetTop ? 'prices'
      : inside && position >= inside.offsetTop ? 'gym' : 'home';
    links.forEach(link => {
      const active = link.dataset.dock === current;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', current === 'home' ? 'page' : 'location');
      else link.removeAttribute('aria-current');
    });
  }

  window.addEventListener('scroll', () => {
    if (!queued) {queued = true; requestAnimationFrame(updateCurrent);}
  }, {passive:true});
  window.addEventListener('hashchange', updateCurrent);
  updateCurrent();
})();
