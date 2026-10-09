import type { WebGLRenderer } from 'three';
let nextID=1;
const active=new Map<number,WebGLRenderer>();
const released:Array<{id:number;geometries:number;textures:number}>=[];
export function trackRenderer(renderer:WebGLRenderer){const id=nextID++;active.set(id,renderer);return()=>{released.push({id,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});if(released.length>32)released.shift();active.delete(id);};}
/** Inspection only. Contains allocation counters, no geometry, identities or user data. */
export function rendererDiagnostics(){return{active:[...active].map(([id,renderer])=>({id,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,drawCalls:renderer.info.render.calls,renderFrames:renderer.info.render.frame})),released:[...released]};}
