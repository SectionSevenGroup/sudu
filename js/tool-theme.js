// Bridge the site's CSS colour tokens to the two WebGL studies. No filtering,
// physics mutation or scene rebuilding: the existing materials change colour.
export function bindToolTheme({ scenes = [], paper = [], ink = [], accent = [], onChange } = {}) {
  const root = document.documentElement;
  function paint() {
    const css = getComputedStyle(root);
    const colours = {
      paper: css.getPropertyValue('--ground').trim() || '#F3F1EA',
      ink: css.getPropertyValue('--ink').trim() || '#171613',
      accent: css.getPropertyValue('--accent').trim() || '#C0431F'
    };
    scenes.forEach(scene => scene.background?.set(colours.paper));
    for (const [role, materials] of Object.entries({ paper, ink, accent })) {
      materials.flat().forEach(material => material?.color?.set(colours[role]));
    }
    onChange?.(colours);
  }
  const observer = new MutationObserver(paint);
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
  paint();
  return () => observer.disconnect();
}
