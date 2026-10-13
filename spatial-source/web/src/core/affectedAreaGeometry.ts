import type { SurfaceDomain, SurfacePoint, SurfacePolygon, SurfaceTransform } from '../types';

const TOL = 1e-8;
export const IDENTITY: SurfaceTransform = [1, 0, 0, 1, 0, 0];
export const AFFECTED_LIMITS = Object.freeze({ records: 2000, vertices: 2048, polygons: 512, attachments: 64, cells: 12000, pairTests: 4_000_000 });
export interface AreaWorkBudget { pairTests: number; cells: number }
export const areaWorkBudget = (): AreaWorkBudget => ({ pairTests: AFFECTED_LIMITS.pairTests, cells: AFFECTED_LIMITS.cells });
export const rectangle = (u0: number, v0: number, u1: number, v1: number): SurfacePolygon => ({ outer: [{ u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 }], holes: [] });
export const asDomain = (polygon: SurfacePolygon): SurfaceDomain => ({ polygons: [polygon] });
export const emptyDomain = (): SurfaceDomain => ({ polygons: [] });
const cross = (a: SurfacePoint, b: SurfacePoint) => a.u * b.v - a.v * b.u;
const sub = (a: SurfacePoint, b: SurfacePoint): SurfacePoint => ({ u: a.u - b.u, v: a.v - b.v });
export function ringArea(ring: SurfacePoint[]): number { return ring.reduce((sum, p, i) => sum + cross(p, ring[(i + 1) % ring.length]), 0) / 2; }
/** Internal geometry only; no verified quantities are exposed by this feature. */
export function domainArea(domain: SurfaceDomain): number { return domain.polygons.reduce((sum, p) => sum + Math.abs(ringArea(p.outer)) - p.holes.reduce((n, h) => n + Math.abs(ringArea(h)), 0), 0); }
function inRing(point: SurfacePoint, ring: SurfacePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.v > point.v) !== (b.v > point.v) && point.u < (b.u - a.u) * (point.v - a.v) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}
export function domainContains(domain: SurfaceDomain, point: SurfacePoint): boolean { return domain.polygons.some(p => inRing(point, p.outer) && !p.holes.some(h => inRing(point, h))); }
export function domainBounds(domain: SurfaceDomain): { minU: number; maxU: number; minV: number; maxV: number } {
  const points = domain.polygons.flatMap(p => p.outer);
  if (!points.length) throw new Error('The affected region has no material support.');
  return points.reduce((b, p) => ({ minU: Math.min(b.minU, p.u), maxU: Math.max(b.maxU, p.u), minV: Math.min(b.minV, p.v), maxV: Math.max(b.maxV, p.v) }), { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity });
}
export function transformPoint(point: SurfacePoint, t: SurfaceTransform): SurfacePoint { return { u: t[0] * point.u + t[2] * point.v + t[4], v: t[1] * point.u + t[3] * point.v + t[5] }; }
export function transformDomain(domain: SurfaceDomain, t: SurfaceTransform): SurfaceDomain { return { polygons: domain.polygons.map(p => ({ outer: p.outer.map(v => transformPoint(v, t)), holes: p.holes.map(h => h.map(v => transformPoint(v, t))) })) }; }
export function composeTransform(a: SurfaceTransform, b: SurfaceTransform): SurfaceTransform { return [b[0]*a[0]+b[2]*a[1], b[1]*a[0]+b[3]*a[1], b[0]*a[2]+b[2]*a[3], b[1]*a[2]+b[3]*a[3], b[0]*a[4]+b[2]*a[5]+b[4], b[1]*a[4]+b[3]*a[5]+b[5]]; }
export function inverseTransform(t: SurfaceTransform): SurfaceTransform {
  const det = t[0]*t[3]-t[1]*t[2];
  if (!t.every(Number.isFinite) || Math.abs(det) < TOL) throw new Error('The surface transform is not invertible.');
  return [t[3]/det,-t[1]/det,-t[2]/det,t[0]/det,(t[2]*t[5]-t[3]*t[4])/det,(t[1]*t[4]-t[0]*t[5])/det];
}
export function isRigidTransform(t: SurfaceTransform): boolean { return t.length === 6 && t.every(Number.isFinite) && Math.abs(t[0]**2+t[1]**2-1)<TOL && Math.abs(t[2]**2+t[3]**2-1)<TOL && Math.abs(t[0]*t[2]+t[1]*t[3])<TOL; }
type Edge = { a: SurfacePoint; b: SurfacePoint };
const rings = (d: SurfaceDomain) => d.polygons.flatMap(p => [p.outer, ...p.holes]);
const edges = (d: SurfaceDomain): Edge[] => rings(d).flatMap(r => r.map((a, i) => ({ a, b: r[(i + 1) % r.length] })));
const unique = (values: number[]) => values.sort((a,b)=>a-b).filter((v,i,a)=>i===0||v-a[i-1]>TOL);
const edgeV = (edge: Edge, u: number) => edge.a.v + (edge.b.v-edge.a.v)*(u-edge.a.u)/(edge.b.u-edge.a.u);
/**
 * Exact piecewise-linear intersection, emitted as disjoint convex cells. The
 * vertical arrangement includes edge crossings, not just bounding-box corners.
 * Holes, concavities and independent masks therefore share one bounded path.
 * Empty `subtract` is ordinary intersection; subtraction is used for receipts.
 */
export function intersectDomains(domains: SurfaceDomain[], budget = areaWorkBudget(), subtract: SurfaceDomain[] = []): SurfaceDomain {
  if (!domains.length || domains.some(d => !d.polygons.length)) return emptyDomain();
  const all = [...domains,...subtract], es = all.flatMap(edges);
  if (es.length > AFFECTED_LIMITS.vertices) throw new Error('Affected-area geometry exceeds the bounded vertex capacity. Record a smaller region.');
  const pairs = es.length*(es.length-1)/2;
  if ((budget.pairTests -= pairs) < 0) throw new Error('Affected-area clipping exceeds the bounded work capacity.');
  const cuts = es.flatMap(e => [e.a.u,e.b.u]);
  for (let i=0;i<es.length;i++) for (let j=i+1;j<es.length;j++) {
    const a=es[i],b=es[j],r=sub(a.b,a.a),s=sub(b.b,b.a),den=cross(r,s);
    if (Math.abs(den)<TOL) continue;
    const q=sub(b.a,a.a),t=cross(q,s)/den,v=cross(q,r)/den;
    if(t>TOL&&t<1-TOL&&v>TOL&&v<1-TOL) cuts.push(a.a.u+t*r.u);
  }
  const xs=unique(cuts), polygons: SurfacePolygon[]=[];
  for(let i=1;i<xs.length;i++) {
    const lo=xs[i-1],hi=xs[i],mid=(lo+hi)/2;
    if(hi-lo<=TOL)continue;
    const active=es.filter(e=>mid>Math.min(e.a.u,e.b.u)&&mid<Math.max(e.a.u,e.b.u)).sort((a,b)=>edgeV(a,mid)-edgeV(b,mid));
    for(let j=1;j<active.length;j++) {
      const lower=active[j-1],upper=active[j],bottom=edgeV(lower,mid),top=edgeV(upper,mid),point={u:mid,v:(bottom+top)/2};
      if(top-bottom<=TOL||!domains.every(d=>domainContains(d,point))||subtract.some(d=>domainContains(d,point)))continue;
      if(--budget.cells<0)throw new Error('Affected-area output exceeds the bounded cell capacity.');
      const ring=[{u:lo,v:edgeV(lower,lo)},{u:hi,v:edgeV(lower,hi)},{u:hi,v:edgeV(upper,hi)},{u:lo,v:edgeV(upper,lo)}];
      const outer=ring.filter((p,k)=>Math.hypot(p.u-ring[(k+3)%4].u,p.v-ring[(k+3)%4].v)>TOL);
      if(outer.length>=3&&Math.abs(ringArea(outer))>TOL*TOL)polygons.push({outer,holes:[]});
    }
  }
  return {polygons};
}
/** Pre-clipped grid primitives stay inside the existing safe SVG vocabulary. */
export function domainGrid(domain: SurfaceDomain, spacing = 0.2, phase = 0): { a: SurfacePoint; b: SurfacePoint }[] {
  if(!Number.isFinite(spacing)||spacing<0.05)throw new Error('Invalid affected-area grid spacing.');
  if(!domain.polygons.length)return[];
  const b=domainBounds(domain), es=edges(domain), result:{a:SurfacePoint;b:SurfacePoint}[]=[];
  if((b.maxU-b.minU+b.maxV-b.minV)/spacing>6000)throw new Error('Affected-area grid exceeds the bounded display capacity.');
  for(const axis of ['u','v'] as const){const other=axis==='u'?'v':'u',lo=axis==='u'?b.minU:b.minV,hi=axis==='u'?b.maxU:b.maxV;
    for(let c=Math.ceil((lo-phase)/spacing)*spacing+phase;c<hi-TOL;c+=spacing){const values=unique(es.flatMap(e=>{const a=e.a[axis],z=e.b[axis];return c>=Math.min(a,z)&&c<Math.max(a,z)&&Math.abs(z-a)>TOL?[e.a[other]+(e.b[other]-e.a[other])*(c-a)/(z-a)]:[];}));
      for(let i=1;i<values.length;i++){const a={u:axis==='u'?c:values[i-1],v:axis==='u'?values[i-1]:c},z={u:axis==='u'?c:values[i],v:axis==='u'?values[i]:c};if(domainContains(domain,{u:(a.u+z.u)/2,v:(a.v+z.v)/2})){result.push({a,b:z});if(result.length>12000)throw new Error('Affected-area grid exceeds the bounded line capacity.');}}
    }
  }return result;
}
/** Split convex arrangement cells into alternating physical stripes for dual-kind overlaps. */
export function stripeDomain(domain: SurfaceDomain, parity: 0 | 1, width = 0.12, budget = areaWorkBudget()): SurfaceDomain {
  const polygons: SurfacePolygon[]=[];
  const clip=(ring:SurfacePoint[],bound:number,greater:boolean)=>{
    const output:SurfacePoint[]=[];
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],insideA=greater?a.u>=bound:a.u<=bound,insideB=greater?b.u>=bound:b.u<=bound;if(insideA)output.push(a);if(insideA!==insideB){const t=(bound-a.u)/(b.u-a.u);output.push({u:bound,v:a.v+t*(b.v-a.v)});}}return output;
  };
  for(const p of domain.polygons){if(p.holes.length)throw new Error('Stripe input must be clipped into convex cells.');const b=domainBounds(asDomain(p));const first=Math.floor(b.minU/width),last=Math.ceil(b.maxU/width);if(last-first>12000)throw new Error('Affected-area stripe capacity exceeded.');for(let i=first;i<last;i++){if(((i%2)+2)%2!==parity)continue;const outer=clip(clip(p.outer,i*width,true),(i+1)*width,false);if(outer.length>=3&&Math.abs(ringArea(outer))>TOL*TOL){if(--budget.cells<0)throw new Error('Affected-area stripe capacity exceeded.');polygons.push({outer,holes:[]});}}}
  return{polygons};
}
