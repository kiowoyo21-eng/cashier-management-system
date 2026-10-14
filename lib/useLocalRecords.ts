"use client";
import {useEffect,useState,type Dispatch,type SetStateAction} from "react";
/** Frontend review persistence only. Never store real personal/confidential records here. */
export function useLocalRecords<T>(key:string,seed:T):[T,Dispatch<SetStateAction<T>>]{
 const [value,setValue]=useState<T>(seed);
 const [ready,setReady]=useState(false);
 useEffect(()=>{try{const raw=window.localStorage.getItem(`uc-hr-ui-${key}`);if(raw!==null){setValue(JSON.parse(raw) as T)}}catch{}setReady(true)},[key]);
 useEffect(()=>{if(ready){try{window.localStorage.setItem(`uc-hr-ui-${key}`,JSON.stringify(value))}catch{}}},[key,value,ready]);
 return [value,setValue];
}
