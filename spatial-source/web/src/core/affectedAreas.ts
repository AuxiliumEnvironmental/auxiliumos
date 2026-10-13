import type { AffectedArea, AffectedAttachment, AffectedKind, EditCommand, Point2, SceneFace, SpatialDocument, SurfaceDomain, SurfacePoint, SurfacePolygon, SurfaceRef, SurfaceRemap, SurfaceRemapReceipt, SurfaceTransform, ValidationIssue } from '../types';
import { establishCeilingSchema } from './ceilings';
import { distance, isSimplePolygon, wallPath } from './geometry';
import { resolveSurface, surfaceKey, surfaceNormal, surfacePointToWorld } from './surfaces';
import { AFFECTED_LIMITS, IDENTITY, areaWorkBudget, asDomain, composeTransform, domainArea, domainBounds, intersectDomains, inverseTransform, isRigidTransform, rectangle, stripeDomain, transformDomain, domainGrid } from './affectedAreaGeometry';
import { AFFECTED_COLORS, affectedRole } from '../affectedAreaPalette';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const refEqual = (a: SurfaceRef, b: SurfaceRef) => surfaceKey(a) === surfaceKey(b);
const finitePoint = (p: SurfacePoint) => [p.u,p.v].every(v=>Number.isFinite(v)&&Math.abs(v)<=20000);
function assertPolygon(p: SurfacePolygon): void {
  if(p.outer.length>1000||p.holes.length>100||[p.outer,...p.holes].some(r=>r.length<3||r.length>1000||!r.every(finitePoint)||!isSimplePolygon(r.map(p=>({x:p.u,z:p.v})))))throw new Error('Use a bounded, simple affected-area polygon.');
}
/** Dedicated observations, not instrument readings, measurements or scope authorization. */
export function recordAffectedArea(document: SpatialDocument, id: string, kind: AffectedKind, surface: SurfaceRef, footprint: SurfacePolygon, previous?: AffectedArea): AffectedArea {
  if(!/^[A-Za-z0-9_-]{1,96}$/.test(id)||!['moisture','fire'].includes(kind))throw new Error('Invalid affected-area identifier or record type.');
  assertPolygon(footprint);
  const host=resolveSurface(document,surface);if(!host)throw new Error('Select an existing wall side, room floor, or established ceiling.');
  const support=intersectDomains([asDomain(footprint),host.domain]);
  if(!support.polygons.length)throw new Error('The affected region does not cover any current host material.');
  if(support.polygons.length>AFFECTED_LIMITS.polygons)throw new Error('Record a smaller affected region on this complex surface.');
  return {id,kind,surface:structuredClone(surface),footprint:structuredClone(footprint),recordedSupport:support,sourceRevision:document.revision,sourceDocumentID:document.documentID,provenance:{origin:'edited',sourceIDs:[...new Set([...(previous?.provenance.sourceIDs??[]),surface.kind==='wall'?surface.wallID:surface.roomID])].sort(),classificationConfidence:'unknown'},measurementStatus:'unverified',reviewState:'needsReview',attachments:[{surface:structuredClone(surface),sourceDomain:structuredClone(support),transform:IDENTITY,outcome:'exact'}]};
}
export function isAffectedCommand(command: EditCommand): boolean { return ['recordAffectedArea','reshapeAffectedArea','reattachAffectedArea','deleteAffectedArea','reviewAffectedArea'].includes(command.type); }
export function mutateAffectedArea(document: SpatialDocument, command: EditCommand): boolean {
  if(!isAffectedCommand(command))return false;
  if(!('areaID' in command))throw new Error('An affected-area edit needs an identifier.');
  document.affectedAreas??=[];
  const index=document.affectedAreas.findIndex(a=>a.id===command.areaID),previous=document.affectedAreas[index];
  switch(command.type) {
    case 'recordAffectedArea':
      if(previous||document.affectedAreas.length>=AFFECTED_LIMITS.records)throw new Error('Duplicate affected area or observation capacity reached.');
      document.affectedAreas.push(recordAffectedArea(document,command.areaID,command.kind,command.surface,command.footprint));break;
    case 'reshapeAffectedArea':
      if(!previous||previous.attachments.length!==1||previous.attachments[0].outcome==='unresolved'||!previous.attachments[0].surface||!refEqual(previous.attachments[0].surface,command.surface))throw new Error('This retained region needs explicit reattachment before reshaping.');
      document.affectedAreas[index]=recordAffectedArea(document,previous.id,previous.kind,command.surface,command.footprint,previous);break;
    case 'reattachAffectedArea':
      if(!previous)throw new Error('Missing affected area.');
      document.affectedAreas[index]=recordAffectedArea(document,previous.id,previous.kind,command.surface,command.footprint,previous);break;
    case 'deleteAffectedArea':if(!previous)throw new Error('Missing affected area.');document.affectedAreas.splice(index,1);break;
    case 'reviewAffectedArea':
      if(!previous||previous.attachments.some(a=>!a.surface||!resolveSurface(document,a.surface)))throw new Error('Reattach unresolved observations before marking them reviewed.');
      previous.reviewState='reviewed';break;
  }
  establishCeilingSchema(document);document.schemaVersion='1.5.0';return true;
}
export interface VisibleAffectedPiece { areaID: string; kind: AffectedKind; surface: SurfaceRef; domain: SurfaceDomain }
function overlaps(a:SurfaceDomain,b:SurfaceDomain):boolean{if(!a.polygons.length||!b.polygons.length)return false;const x=domainBounds(a),y=domainBounds(b);return x.minU<y.maxU&&x.maxU>y.minU&&x.minV<y.maxV&&x.maxV>y.minV;}
/** The only observation clipping path used by plan, scene and frozen derivatives. */
export function visibleAffectedAreas(document: SpatialDocument, floorID: string, dualMarks=true): VisibleAffectedPiece[] {
  const result:VisibleAffectedPiece[]=[],budget=areaWorkBudget();
  for(const area of document.affectedAreas??[])for(const a of area.attachments){
    if(!a.surface||!a.transform||a.surface.floorID!==floorID)continue;
    const host=resolveSurface(document,a.surface);if(!host)continue;
    const domain=intersectDomains([transformDomain(asDomain(area.footprint),a.transform),transformDomain(area.recordedSupport,a.transform),transformDomain(a.sourceDomain,a.transform),host.domain],budget);
    if(domain.polygons.length)result.push({areaID:area.id,kind:area.kind,surface:a.surface,domain});
  }
  if(!dualMarks)return result;
  return result.map(piece=>{
    const opposite=result.filter(p=>p.kind!==piece.kind&&refEqual(p.surface,piece.surface)&&overlaps(p.domain,piece.domain));
    if(!opposite.length)return piece;
    const other={polygons:opposite.flatMap(p=>p.domain.polygons)},overlap=intersectDomains([piece.domain,other],budget),plain=intersectDomains([piece.domain],budget,[other]);
    return{...piece,domain:{polygons:[...plain.polygons,...stripeDomain(overlap,piece.kind==='moisture'?0:1,0.12,budget).polygons]}};
  });
}
/** Every bent-wall cell is split at real segment boundaries, never triangulated across a bend. */
export function affectedSceneFaces(document: SpatialDocument, floorID: string): SceneFace[] {
  const faces:SceneFace[]=[],budget=areaWorkBudget();
  for(const piece of visibleAffectedAreas(document,floorID)){
    let cells=piece.domain.polygons;
    if(piece.surface.kind==='wall'){
      const floor=document.floors.find(f=>f.id===floorID)!,wall=floor.walls.find(w=>w.id===(piece.surface as Extract<SurfaceRef,{kind:'wall'}>).wallID)!,path=wallPath(floor,wall);
      const next:SurfacePolygon[]=[];let start=0;
      for(let i=1;i<path.length;i++){const end=start+distance(path[i-1],path[i]);for(const cell of cells){const b=domainBounds(asDomain(cell));if(b.maxU>start&&b.minU<end)next.push(...intersectDomains([asDomain(cell),asDomain(rectangle(start,-10000,end,10000))],budget).polygons);}start=end;}cells=next;
    }
    for(const cell of cells){const center=cell.outer.reduce((s,p)=>s+p.u/cell.outer.length,0),normal=surfaceNormal(document,piece.surface,center);if(!normal)continue;
      const vertices=cell.outer.map(p=>surfacePointToWorld(document,piece.surface,p));if(vertices.some(p=>!p))continue;
      const triangles:number[][]=[];const reverse=piece.surface.kind==='floor'||piece.surface.kind==='wall'&&piece.surface.side==='negative';
      for(let i=1;i<vertices.length-1;i++)triangles.push(reverse?[0,i+1,i]:[0,i,i+1]);
      // 1 mm is a derived display bias, not a stored dimension or material thickness.
      faces.push({objectID:piece.areaID,role:affectedRole(piece.kind),surface:piece.surface,vertices:vertices.map(p=>({x:p!.x+normal.x*0.001,y:p!.y+normal.y*0.001,z:p!.z+normal.z*0.001})),triangles});
      if(faces.length>20000)throw new Error('Affected-area scene exceeds the bounded face capacity.');
    }
  }return faces;
}
/** Keep authored geometry/support immutable through host edits, including split pieces. */
export function affectedMaterialRemaps(before: SpatialDocument, after: SpatialDocument, receipt: SurfaceRemapReceipt): SurfaceRemapReceipt {
  return { ...receipt, mappings: receipt.mappings.filter(mapping => {
    if (!mapping.to || !mapping.transform || !refEqual(mapping.from, mapping.to) || !same(mapping.transform, IDENTITY)) return true;
    const source = resolveSurface(before, mapping.from), target = resolveSurface(after, mapping.to);
    if (!source || !target || !same(source.domain, target.domain)) return true;
    const sample = source.domain.polygons[0]?.outer[0] ?? { u: 0, v: 0 };
    // Canonical receipts may include metadata-only lineage. Resolve the same
    // chart point and normal to distinguish that from a physical host move.
    return !same(surfacePointToWorld(before, mapping.from, sample), surfacePointToWorld(after, mapping.to, sample)) || !same(surfaceNormal(before, mapping.from, sample.u), surfaceNormal(after, mapping.to, sample.u));
  }) };
}
export function remapAffectedAreas(areas: AffectedArea[], receipt: SurfaceRemapReceipt): AffectedArea[] {
  return areas.map(original=>{
    const area=structuredClone(original),next:AffectedAttachment[]=[],budget=areaWorkBudget();let changed=false;
    for(const attachment of area.attachments){
      if(!attachment.surface||!attachment.transform){next.push(attachment);continue;}
      const mappings=receipt.mappings.filter(m=>refEqual(m.from,attachment.surface!));
      if(!mappings.length){next.push(attachment);continue;}
      changed=true;
      if(mappings.some(m=>m.transform&&!isRigidTransform(m.transform)))throw new Error('A surface remap cannot stretch a recorded observation.');
      // A same-host material change must not trim the historical support to the
      // smaller current domain. Enlargement later can reveal only prior support.
      if(mappings.length===1&&mappings[0].to&&refEqual(mappings[0].to,attachment.surface)&&mappings[0].transform){const m=mappings[0];next.push({...attachment,surface:m.to,transform:composeTransform(attachment.transform,m.transform!),outcome:m.outcome});continue;}
      const assigned:SurfaceDomain[]=[];
      for(const m of mappings){
        if(m.transform&&!isRigidTransform(m.transform))throw new Error('A surface remap cannot stretch a recorded observation.');
        const sourceDomain=intersectDomains([attachment.sourceDomain,transformDomain(m.sourceDomain,inverseTransform(attachment.transform))],budget);
        if(!sourceDomain.polygons.length)continue;assigned.push(sourceDomain);
        next.push({surface:m.to,sourceDomain,transform:m.to&&m.transform?composeTransform(attachment.transform,m.transform):null,outcome:m.to?m.outcome:'unresolved'});
      }
      const remainder=intersectDomains([attachment.sourceDomain],budget,assigned);
      if(remainder.polygons.length)next.push({surface:null,sourceDomain:remainder,transform:null,outcome:'unresolved'});
    }
    if(next.length>AFFECTED_LIMITS.attachments)throw new Error('This host change creates too many affected-area pieces. Resolve the observation first.');
    const combined:AffectedAttachment[]=[];
    for(const a of next){const prior=combined.find(b=>same(a.surface,b.surface)&&same(a.transform,b.transform));if(prior){prior.sourceDomain.polygons.push(...a.sourceDomain.polygons);if(a.outcome==='clipped_needs_review')prior.outcome=a.outcome;if(prior.sourceDomain.polygons.length>AFFECTED_LIMITS.polygons)throw new Error('Resolve this complex observation before changing its host again.');}else combined.push(a);}
    area.attachments=combined;
    if(changed)area.reviewState=next.some(a=>a.outcome==='unresolved')?'unresolved':'needsReview';
    return area;
  });
}
/** Compose old-chart domains through the batch; never concatenate ID-only guesses. */
export function composeAffectedReceipts(previous:SurfaceRemapReceipt,step:SurfaceRemapReceipt):SurfaceRemapReceipt{
  const mappings:SurfaceRemap[]=[],used=new Set<string>(),budget=areaWorkBudget();
  for(const p of previous.mappings){
    if(!p.to||!p.transform){mappings.push(p);continue;}
    const next=step.mappings.filter(m=>refEqual(m.from,p.to!));if(!next.length){mappings.push(p);continue;}used.add(surfaceKey(p.to));
    const assigned:SurfaceDomain[]=[];
    for(const n of next){
      const sameHost=next.length===1&&n.to&&refEqual(n.to,n.from)&&n.transform;
      const sourceDomain=sameHost?p.sourceDomain:intersectDomains([p.sourceDomain,transformDomain(n.sourceDomain,inverseTransform(p.transform))],budget);
      if(!sourceDomain.polygons.length)continue;assigned.push(sourceDomain);
      mappings.push({from:p.from,to:n.to,sourceDomain,transform:n.transform?composeTransform(p.transform,n.transform):null,outcome:n.outcome==='unresolved'?'unresolved':p.outcome==='clipped_needs_review'||n.outcome==='clipped_needs_review'?'clipped_needs_review':'exact'});
    }
    const remainder=intersectDomains([p.sourceDomain],budget,assigned);
    if(remainder.polygons.length)mappings.push({from:p.from,to:null,sourceDomain:remainder,transform:null,outcome:'unresolved'});
  }
  for(const n of step.mappings)if(!used.has(surfaceKey(n.from)))mappings.push(n);
  return{sourceRevision:previous.sourceRevision,resultingRevision:step.resultingRevision,mappings};
}

export interface AffectedPlanPolygon { areaID:string; kind:AffectedKind; points:Point2[]; color:string }
export interface AffectedPlanLine { areaID:string; kind:AffectedKind; surface:SurfaceRef; a:Point2; b:Point2; color:string; wall:boolean }
/** Shared physical plan interpretation for the editor and SVG/PDF/PNG. */
export function affectedPlanPrimitives(document:SpatialDocument,floorID:string):{polygons:AffectedPlanPolygon[];lines:AffectedPlanLine[]}{
  const polygons:AffectedPlanPolygon[]=[],lines:AffectedPlanLine[]=[];
  for(const p of visibleAffectedAreas(document,floorID)){
    const color=AFFECTED_COLORS[p.kind];
    if(p.surface.kind==='floor')for(const cell of p.domain.polygons)polygons.push({areaID:p.areaID,kind:p.kind,points:cell.outer.map(p=>({x:p.u,z:p.v})),color:color.fill});
    else if(p.surface.kind==='ceiling')for(const line of domainGrid(p.domain,0.2,p.kind==='fire'?0.1:0))lines.push({areaID:p.areaID,kind:p.kind,surface:p.surface,a:{x:line.a.u,z:line.a.v},b:{x:line.b.u,z:line.b.v},color:color.line,wall:false});
    else {
      const floor=document.floors.find(f=>f.id===floorID)!,wall=floor.walls.find(w=>w.id===(p.surface as Extract<SurfaceRef,{kind:'wall'}>).wallID)!,path=wallPath(floor,wall);
      // Project the actual supported cells, not their bounding rectangle across holes.
      const intervals=p.domain.polygons.map(cell=>domainBounds(asDomain(cell))).map(b=>[b.minU,b.maxU]).sort((a,b)=>a[0]-b[0]);
      const merged:number[][]=[];for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+1e-8)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
      let start=0;for(let i=1;i<path.length;i++){const end=start+distance(path[i-1],path[i]),normal=surfaceNormal(document,p.surface,(start+end)/2)!;
        for(const interval of merged){const lo=Math.max(start,interval[0]),hi=Math.min(end,interval[1]);if(hi-lo<=1e-8)continue;const a=surfacePointToWorld(document,p.surface,{u:lo,v:0})!,b=surfacePointToWorld(document,p.surface,{u:hi,v:0})!;
          // A side-specific 6 cm diagrammatic offset is shared by every plan output.
          lines.push({areaID:p.areaID,kind:p.kind,surface:p.surface,a:{x:a.x+normal.x*0.06,z:a.z+normal.z*0.06},b:{x:b.x+normal.x*0.06,z:b.z+normal.z*0.06},color:color.line,wall:true});
        }start=end;
      }
    }
  }return{polygons,lines};
}
export function validateAffectedSemantics(document:SpatialDocument):ValidationIssue[]{
  const issues:ValidationIssue[]=[],budget=areaWorkBudget(),add=(id:string,message:string)=>issues.push({code:'affected_area',path:`affectedAreas.${id}`,message});
  for(const area of document.affectedAreas??[])try{
    assertPolygon(area.footprint);
    if(area.sourceDocumentID===document.documentID&&area.sourceRevision>document.revision)throw new Error('Recorded support cannot come from a future revision.');
    for(const d of [area.recordedSupport,...area.attachments.map(a=>a.sourceDomain)])for(const p of d.polygons)assertPolygon(p);
    const supported=intersectDomains([area.recordedSupport,asDomain(area.footprint)],budget);
    if(!supported.polygons.length||domainArea(intersectDomains([area.recordedSupport],budget,[asDomain(area.footprint)]))>1e-7)throw new Error('Recorded support must lie in the authored footprint.');
    for(const a of area.attachments){
      if((a.surface===null)!==(a.transform===null)||a.outcome==='unresolved'&&(a.surface!==null||a.transform!==null))throw new Error('Unresolved attachments need a null destination and transform.');
      if(a.transform&&!isRigidTransform(a.transform))throw new Error('Attachment transforms must preserve physical size.');
      if(a.surface&&!resolveSurface(document,a.surface))throw new Error('A missing host must be retained as an unresolved attachment.');
      if(domainArea(intersectDomains([a.sourceDomain],budget,[area.recordedSupport]))>1e-7)throw new Error('An attachment cannot add recorded material support.');
    }
    if(domainArea(intersectDomains([area.recordedSupport],budget,area.attachments.map(a=>a.sourceDomain)))>1e-7)throw new Error('Attachment pieces must retain all recorded support, including unresolved portions.');
    if(area.attachments.some(a=>a.outcome==='unresolved')&&area.reviewState!=='unresolved')throw new Error('Unresolved pieces must remain visible in review.');
  }catch(cause){add(area.id,cause instanceof Error?cause.message:String(cause));if(issues.length>=100)break;}
  return issues;
}
