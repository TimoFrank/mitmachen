const hero = document.querySelector('[data-pages-atlas]');

if (hero) {
  const home = hero.closest('[data-view-panel="home"]');
  const destinations = home.querySelector('#home-destinations');
  hero.querySelector('[data-atlas-modules]').addEventListener('click', (event) => {
    event.preventDefault();
    destinations.focus({ preventScroll: true });
    destinations.scrollIntoView({ block: 'start' });
  });

  let controller;
  let session;
  let visible = false;
  let hasPlayed = false;
  let failed = false;

  function stop() {
    if (!controller) return;
    controller.abort();
    controller = undefined;
    session?.dispose();
    session = undefined;
    delete hero.dataset.renderer;
  }

  function synchronize() {
    if (!home.classList.contains('is-active')) {
      stop();
      return;
    }
    const enabled = visible && !document.hidden;
    if (controller || failed || !enabled) {
      session?.setVisible(enabled);
      return;
    }

    const request = new AbortController();
    controller = request;
    hero.dataset.renderer = 'loading';
    function showFallback() {
      if (request.signal.aborted) return;
      stop();
      failed = true;
      hero.dataset.renderer = 'fallback';
    }

    // Loading the rest of the map is unnecessary on direct links to other modules.
    import(new URL('./scene.js', import.meta.url).href)
      .then(async ({ mountAtlas }) => {
        if (request.signal.aborted) return;
        session = mountAtlas(hero, request.signal, hasPlayed, showFallback);
        await session.ready;
        if (request.signal.aborted) return;
        hasPlayed = true;
        session.setVisible(visible && !document.hidden);
      })
      .catch(showFallback);
  }

  const viewport = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    synchronize();
  });
  viewport.observe(hero);
  const route = new MutationObserver(synchronize);
  route.observe(home, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('pagehide', (event) => {
    stop();
    if (!event.persisted) {
      route.disconnect();
      viewport.disconnect();
      document.removeEventListener('visibilitychange', synchronize);
    }
  });
  window.addEventListener('pageshow', synchronize);
}
