import { useEffect, useState } from 'react';

const preferenceKey = 'auxilium-spatial-text-scale';
const scales = [1, 1.25, 1.5, 2];
/** User text preference plus Apple's dynamic system body font where supported.
 * The browser preference is portable; native category propagation still needs
 * verification in the installed WKWebView on the supported iPhones.
 */
export function useTextScale() {
  const [preferred, setPreferred] = useState(() => {
    try { const value = Number(localStorage.getItem(preferenceKey)); return scales.includes(value) ? value : 1; } catch { return 1; }
  });
  const [system, setSystem] = useState(1);
  useEffect(() => {
    if (!CSS.supports('font', '-apple-system-body')) return;
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true'); probe.textContent = 'M';
    Object.assign(probe.style, { font: '-apple-system-body', position: 'fixed', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'nowrap' });
    document.body.appendChild(probe);
    const read = () => { const points=Number.parseFloat(getComputedStyle(probe).fontSize);if(Number.isFinite(points)&&points>0)setSystem(Math.max(1,points/17)); };
    read(); const observer=new ResizeObserver(read);observer.observe(probe);
    window.addEventListener('resize',read);document.addEventListener('visibilitychange',read);
    return()=>{observer.disconnect();window.removeEventListener('resize',read);document.removeEventListener('visibilitychange',read);probe.remove();};
  },[]);
  const set = (value:number) => { if(!scales.includes(value))return;setPreferred(value);try{localStorage.setItem(preferenceKey,String(value));}catch{/* A display preference need not prevent authoring when storage is full. */} };
  return { scale: Math.max(preferred,system), preferred, set };
}
