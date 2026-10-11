import { freshDocument } from '../../src/ui/geometry';
import type { SpatialDocument } from '../../src/types';
export function stressFixture():SpatialDocument{
  const document=freshDocument('Synthetic rendering stress'),floor=document.floors[0],provenance={origin:'synthetic' as const,sourceIDs:[],classificationConfidence:'unknown' as const};
  for(let r=0;r<100;r++){const x=(r%10)*10,z=Math.floor(r/10)*10,points=[[0,0],[8/3,0],[16/3,0],[8,0],[8,4],[8,8],[16/3,8],[8/3,8],[0,8],[0,4]];floor.nodes.push(...points.map(([dx,dz],i)=>({id:`n-${r}-${i}`,point:{x:x+dx,z:z+dz}})));for(let i=0;i<10;i++){const wallID=`w-${r}-${i}`;floor.walls.push({id:wallID,nodeIDs:[`n-${r}-${i}`,`n-${r}-${(i+1)%10}`],baseY:0,height:2.6,heightBasis:'synthetic',provenance:{...provenance}});if(i<5)floor.openings.push({id:`o-${r}-${i}`,wallID,kind:i===0?'door':'window',offset:.65,width:.9,bottom:i===0?0:.9,height:i===0?2.05:1.1,provenance:{...provenance}});}floor.rooms.push({id:`r-${r}`,label:`Synthetic room ${r+1}`,boundary:Array.from({length:10},(_,i)=>({wallID:`w-${r}-${i}`,reversed:false}))});}
  return document;
}
