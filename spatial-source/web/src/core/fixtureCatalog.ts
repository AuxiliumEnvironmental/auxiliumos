export type FixtureArchetype = 'toilet'|'appliance'|'shower'|'tub'|'sink'|'vanity'|'furniture'|'fireplace'|'island'|'cabinet';
export interface FixturePreset { id:string; version:1; label:string; family:string; archetype:FixtureArchetype; mount:'floor'|'wall'; width:number; depth:number; height:number; bowls?:1|2; provisional?:boolean }
const preset=(id:string,label:string,family:string,archetype:FixtureArchetype,width:number,depth:number,height:number,extras:Partial<FixturePreset>={}):FixturePreset=>({id,version:1,label,family,archetype,mount:'floor',width,depth,height,...extras});
/** Starter model dimensions are editable diagrammatic choices, never measurements. */
export const FIXTURE_CATALOG:readonly FixturePreset[] = [
 preset('toilet','Toilet','Toilets','toilet',.42,.7,.78),
 ...(['refrigerator','range','dishwasher','washer','dryer'] as const).map(id=>preset(id,id[0].toUpperCase()+id.slice(1),'Appliances','appliance',id==='refrigerator'?.9:.6,.65,id==='refrigerator'?1.8:.9,{provisional:true})),
 preset('walk-in-shower','Walk-in shower','Showers and tubs','shower',1.2,.9,2),
 preset('tub-shower','Tub with shower','Showers and tubs','tub',1.7,.8,2),
 preset('garden-tub','Garden tub','Showers and tubs','tub',1.8,1.1,.6),
 preset('single-sink','Standalone single sink','Sinks','sink',.6,.5,.85,{bowls:1}),
 preset('double-sink','Standalone double sink','Sinks','sink',1.2,.5,.85,{bowls:2}),
 preset('single-vanity','Single sink with vanity','Sinks with cabinets','vanity',.9,.55,.9,{bowls:1}),
 preset('double-vanity','Double sink with vanity','Sinks with cabinets','vanity',1.5,.55,.9,{bowls:2}),
 preset('built-in-bench','Built-in bench','Built-in furniture','furniture',1.5,.55,.8,{provisional:true}),
 preset('built-in-shelves','Built-in shelving','Built-in furniture','furniture',1.2,.35,2,{provisional:true}),
 preset('fireplace','Fireplace','Fireplaces and chimneys','fireplace',1.2,.5,1.2),
 preset('chimney','Chimney','Fireplaces and chimneys','fireplace',.8,.8,2.4),
 preset('kitchen-island','Kitchen island','Kitchen','island',1.8,.9,.9),
 preset('upper-cabinet','Upper cabinet','Kitchen','cabinet',.9,.35,.75,{mount:'wall'}),
 preset('lower-cabinet','Lower cabinet','Kitchen','cabinet',.9,.6,.9),
];
export function fixturePreset(id:string):FixturePreset { const value=FIXTURE_CATALOG.find(p=>p.id===id);if(!value)throw new Error('Choose a supported fixture catalog item');return value; }
