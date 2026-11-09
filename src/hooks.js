import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { translate } from './i18n.js';

/** Translator bound to the current UI language. */
export function useT() {
  const lang = useSelector((s) => s.settings.lang);
  return useCallback((key, ...args) => translate(lang, key, ...args), [lang]);
}

export { useDispatch, useSelector };

/** Convert a pointer event to the SVG's user (viewBox) coordinates. */
export function svgPoint(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
