'use client';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,History,LoaderCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Slider} from '@/components/ui/slider';
import type {TimelineStatus} from '@/lib/simulation/types';

export const timeLabel=(month:number)=>month===0?'初始时刻':`${Math.floor(month/12)} 年 ${month%12} 个月`;
export interface SeekProgress {target:number;completed:number;total:number;}
export function WorldTimelineControls({status,progress,disabled,onSeek}:{status:TimelineStatus;progress:SeekProgress|null;disabled:boolean;onSeek:(month:number|null)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 const target=draft??String(progress?.target??status.viewMonth);
 const value=Number(target),valid=target.trim()!==''&&Number.isInteger(value)&&value>=status.earliestMonth&&value<=status.latestMonth;
 const jump=(month:number|null)=>{setDraft(null);onSeek(month);};
 return <section className={`history-timeline ${status.historical?'is-historical':''}`} aria-label="历史时间轴">
  <div className="history-heading"><div><History size={18}/><h2>时间轴</h2><span>{status.historical?'历史回看':'最新时刻'}</span></div><strong>{timeLabel(status.viewMonth)}</strong><Button variant="outline" size="sm" disabled={disabled||(!status.historical&&!progress)} onClick={()=>jump(null)}>返回最新</Button></div>
  <div className="history-slider"><Button variant="ghost" size="icon-sm" aria-label="查看上一个月" disabled={disabled||status.viewMonth<=status.earliestMonth} onClick={()=>jump(status.viewMonth-1)}><ArrowLeft size={16}/></Button><Slider aria-label="选择已模拟的月份" value={[valid?value:status.viewMonth]} min={status.earliestMonth} max={Math.max(status.earliestMonth+1,status.latestMonth)} step={1} disabled={disabled||status.latestMonth===status.earliestMonth} onValueChange={v=>{setDraft(String(Array.isArray(v)?v[0]:v));}} onValueCommitted={v=>jump(Array.isArray(v)?v[0]:v)}/><Button variant="ghost" size="icon-sm" aria-label="查看下一个月" disabled={disabled||status.viewMonth>=status.latestMonth} onClick={()=>jump(status.viewMonth+1)}><ArrowRight size={16}/></Button></div>
  <div className="history-range"><span>{timeLabel(status.earliestMonth)}</span><span>已模拟至 {timeLabel(status.latestMonth)}</span></div>
  <div className="history-bottom"><form onSubmit={e=>{e.preventDefault();if(valid&&!disabled)jump(value);}}><label htmlFor="history-month">累计月数</label><Input id="history-month" type="number" min={status.earliestMonth} max={status.latestMonth} step={1} value={target} disabled={disabled} onChange={e=>{setDraft(e.target.value);}}/><Button variant="outline" size="sm" type="submit" disabled={disabled||!valid}>查看</Button>{valid&&<span>{timeLabel(value)}</span>}</form><output>{progress?<><LoaderCircle size={14} className="spin"/>正在还原 {timeLabel(progress.target)}，下方暂显示原时点…</>:status.historical?'全部图表与个体资料对应所选月份。返回最新后可继续演化。':'拖动或输入月份查看历史；查询时会暂停演化。'}</output></div>
  {status.earliestMonth>0&&<p className="history-limit">这份旧存档没有更早的回溯记录，可从 {timeLabel(status.earliestMonth)} 开始查询。</p>}
 </section>;
}
