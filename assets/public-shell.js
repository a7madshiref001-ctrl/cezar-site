(function () {
  'use strict';
  const dock = document.querySelector('.cezar-dock');
  if (!dock) return;

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
