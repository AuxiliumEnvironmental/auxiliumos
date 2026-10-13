import { readFileSync } from 'node:fs';
import type { Floor, Provenance, SpatialDocument } from '../../src/types';
export const fixture=():SpatialDocument=>JSON.parse(readFileSync(new URL('../../../fixtures/geometry.json',import.meta.url),'utf8'));
export const provenance=():Provenance=>({origin:'synthetic',sourceIDs:[],classificationConfidence:'unknown'});
export const emptyFloor=(id='empty'):Floor=>({id,label:'Empty floor',elevation:0,nodes:[],walls:[],openings:[],rooms:[]});
