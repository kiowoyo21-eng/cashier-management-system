'use client';
import {useCallback,useEffect,useMemo,useState,type KeyboardEvent} from 'react';
import {supabase} from '../lib/supabase';
import {useNotify} from './Notifications';

export type VehicleSelection={year:string;brand:string;model:string};
type Brand={id:string;name:string};
type Model={id:string;name:string;brand_id:string};
const norm=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();

function AutoBox({label,value,placeholder,options,onChange,onAdd,canAdd=true}:{label:string;value:string;placeholder:string;options:string[];onChange:(v:string)=>void;onAdd?:(v:string)=>void;canAdd?:boolean}){
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const filtered=useMemo(()=>{const q=norm(value);return options.filter(x=>!q||norm(x).includes(q)).slice(0,10)},[options,value]);
 const exact=options.some(x=>norm(x)===norm(value));
 const pick=(v:string)=>{onChange(v);setOpen(false);setActive(-1)};
 function keyDown(e:KeyboardEvent<HTMLInputElement>){
  if(e.key==='Escape'){setOpen(false);return}
  if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,Math.max(0,filtered.length-1)));return}
  if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,i-1));return}
  if(e.key==='Enter'&&open){
   if(filtered.length){e.preventDefault();pick(filtered[Math.max(0,Math.min(active,filtered.length-1))]);return}
   if(canAdd&&onAdd&&value.trim()&&!exact){e.preventDefault();onAdd(value);setOpen(false)}
  }
 }
 return <label className="vehicle-auto">{label}<div className="vehicle-auto-wrap"><input className="input" autoComplete="off" role="combobox" aria-expanded={open} value={value} placeholder={placeholder} onFocus={()=>{setOpen(true);setActive(-1)}} onBlur={()=>setTimeout(()=>setOpen(false),120)} onChange={e=>{onChange(e.target.value);setActive(-1);setOpen(true)}} onKeyDown={keyDown}/>{value&&<button type="button" className="vehicle-clear" aria-label={`Clear ${label}`} onClick={()=>{onChange('');setOpen(false)}}>×</button>}{open&&<div className="vehicle-suggestions" role="listbox">{filtered.map((x,i)=><button type="button" role="option" aria-selected={i===active} className={i===active?'vehicle-option-active':''} key={x} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>pick(x)}>{x}</button>)}{canAdd&&onAdd&&value.trim()&&!exact&&<button type="button" className="vehicle-add" onMouseDown={e=>e.preventDefault()} onClick={()=>{onAdd(value);setOpen(false)}}>+ Add “{value.trim()}”</button>}{!filtered.length&&(!canAdd||exact||!value.trim())&&<div className="vehicle-none">No matching value</div>}</div>}</div></label>
}

export function useVehicleMaster(){
 const [brands,setBrands]=useState<Brand[]>([]),[models,setModels]=useState<Model[]>([]),[years,setYears]=useState<number[]>([]),[loading,setLoading]=useState(false);
 const reload=useCallback(async()=>{if(!supabase)return;setLoading(true);try{const [b,m,y]=await Promise.all([supabase.from('vehicle_brands').select('id,name').eq('is_active',true).order('name'),supabase.from('vehicle_models').select('id,name,brand_id').eq('is_active',true).order('name'),supabase.from('vehicle_years').select('year').eq('is_active',true).order('year',{ascending:false})]);if(b.error)throw b.error;if(m.error)throw m.error;if(y.error)throw y.error;const activeBrands=(b.data||[]) as Brand[];const activeIds=new Set(activeBrands.map(x=>x.id));setBrands(activeBrands);setModels(((m.data||[]) as Model[]).filter(x=>activeIds.has(x.brand_id)));setYears((y.data||[]).map((x:any)=>Number(x.year)))}catch{setBrands([]);setModels([]);setYears([])}finally{setLoading(false)}},[]);
 useEffect(()=>{void reload()},[reload]);
 return {brands,models,years,loading,reload};
}

export function VehicleFields({value,onChange,allowAdd=true,preserveModelOnBrandChange=false}:{value:VehicleSelection;onChange:(v:VehicleSelection)=>void;allowAdd?:boolean;preserveModelOnBrandChange?:boolean}){
 const notify=useNotify();const master=useVehicleMaster();
 const brandNames=master.brands.map(x=>x.name);
 const selectedBrand=master.brands.find(x=>norm(x.name)===norm(value.brand));
 const modelRows=selectedBrand?master.models.filter(x=>x.brand_id===selectedBrand.id):master.models;
 const modelNames:string[]=[...new Set<string>(modelRows.map(x=>x.name))];
 async function addBrand(raw:string){if(!supabase)return;const name=raw.trim().replace(/\s+/g,' ');const existing=master.brands.find(x=>norm(x.name)===norm(name));if(existing){onChange({...value,brand:existing.name});notify(`Brand already exists. Using ${existing.name}.`,'warning');return}const {data,error}=await supabase.rpc('add_vehicle_brand',{p_name:name});if(error){notify(error.message,'error');return}await master.reload();onChange({...value,brand:data?.name||name});notify('Car brand added.','success')}
 async function addYear(raw:string){if(!supabase)return;const year=Number(raw.trim());if(!Number.isInteger(year)||year<1900||year>2100){notify('Enter a valid 4-digit year.','warning');return}if(master.years.includes(year)){onChange({...value,year:String(year)});notify('Year already exists. Using the existing value.','warning');return}const {error}=await supabase.rpc('add_vehicle_year',{p_year:year});if(error){notify(error.message,'error');return}await master.reload();onChange({...value,year:String(year)});notify('Year model added.','success')}
 async function addModel(raw:string){if(!supabase)return;const name=raw.trim().replace(/\s+/g,' ');if(!value.brand.trim()){notify('Choose or add the car brand before adding a new model.','warning');return}const existingBrand=master.brands.find(x=>norm(x.name)===norm(value.brand));const duplicate=master.models.find(x=>norm(x.name)===norm(name)&&(!existingBrand||x.brand_id===existingBrand.id));if(duplicate){onChange({...value,model:duplicate.name});notify('Car model already exists for this brand. Using the existing value.','warning');return}const {data,error}=await supabase.rpc('add_vehicle_model',{p_brand_name:value.brand,p_name:name});if(error){notify(error.message,'error');return}await master.reload();onChange({...value,model:data?.name||name});notify('Car model added.','success')}
 return <div className="vehicle-fields"><AutoBox label="Year Model" value={value.year} placeholder="Search year..." options={master.years.map(String)} onChange={year=>onChange({...value,year})} onAdd={addYear} canAdd={allowAdd}/><AutoBox label="Car Brand" value={value.brand} placeholder="Search brand..." options={brandNames} onChange={brand=>onChange(preserveModelOnBrandChange?{...value,brand}:{...value,brand,model:''})} onAdd={addBrand} canAdd={allowAdd}/><AutoBox label="Car Model / Unit" value={value.model} placeholder="Search model..." options={modelNames} onChange={model=>onChange({...value,model})} onAdd={addModel} canAdd={allowAdd}/></div>
}

export function VehicleFilterBar({value,onChange,onClear}:{value:VehicleSelection;onChange:(v:VehicleSelection)=>void;onClear:()=>void}){
 return <div className="vehicle-filter-inline"><VehicleFields value={value} onChange={onChange} preserveModelOnBrandChange/><button className="btn ghost vehicle-filter-clear" onClick={onClear}>Clear Filters</button></div>
}
