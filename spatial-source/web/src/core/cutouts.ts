import type { Cutout, SpatialDocument } from '../types';
import { profileRing, profileInside, profilesTouch } from './cutoutGeometry';
import { samePhysicalSurface, uncutSurfaceDomain, wallRun } from './surfaces';
export function validateCutout(document:SpatialDocument,cutout:Cutout):void{
 const floor=document.floors.find(f=>f.id===cutout.surface.floorID),domain=uncutSurfaceDomain(document,cutout.surface);if(!floor||!domain)throw new Error('Choose an existing surface; a ceiling must have established ceiling intent');
 const ring=profileRing(cutout.profile);
 if(!domain.polygons.some(p=>profileInside(cutout.profile,p)))throw new Error('Cutout must be strictly inside the surface, clear of its boundary and existing openings');
 if(cutout.surface.kind==='wall'&&!wallRun(document,cutout.surface,Math.min(...ring.map(p=>p.u)),Math.max(...ring.map(p=>p.u))))throw new Error('A rigid cutout cannot cross a wall bend');
 for(const other of floor.cutouts??[])if(other.id!==cutout.id&&samePhysicalSurface(cutout.surface,other.surface)&&profilesTouch(cutout.profile,other.profile))throw new Error('Cutouts must be disjoint; move or resize the overlapping or touching profile');
}
