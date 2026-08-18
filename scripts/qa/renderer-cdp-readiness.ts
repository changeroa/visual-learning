import { z } from "zod";

export const targetInfoSchema = z.object({
  targetId: z.string(),
  type: z.string(),
  url: z.string(),
});
export const targetsSchema = z.object({ targetInfos: z.array(targetInfoSchema) });
export type TargetInfo = z.infer<typeof targetInfoSchema>;

export const evalValueSchema = z.object({
  result: z.object({ value: z.unknown().optional() }),
  exceptionDetails: z.object({ text: z.string() }).optional(),
});

export const readinessSchema = z.object({
  ready: z.literal(true),
  failedPredicates: z.array(z.string()).length(0),
  url: z.literal("app://obsidian.md/index.html"),
  readyState: z.literal("complete"),
  inProgress: z.literal(false),
  appPresent: z.literal(true),
  workspacePresent: z.literal(true),
  vaultPresent: z.literal(true),
  layoutReady: z.literal(true),
  basePath: z.string(),
  settingsPresent: z.literal(true),
  settingsVisible: z.literal(true),
});

export function buildSettingsEntryProbe(): string {
  return `(()=>{const point=(element)=>{const rect=element.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}};const root=document.querySelector('[aria-label="Settings"],.side-dock-settings');if(!root)throw new Error('Settings control missing after semantic readiness');const descendants=[...(root.querySelectorAll?.('[aria-label],button,.clickable-icon')??[])];const semantic=descendants.find(el=>/^Settings$/i.test(el.getAttribute?.('aria-label')??el.getAttribute?.('title')??el.textContent?.trim()??''));const control=root.matches?.('[aria-label="Settings"]')?root:semantic??descendants.at(-1)??root;const general=[...document.querySelectorAll('.vertical-tab-nav-item')].find(x=>x.textContent?.trim()==='General');const blocker=[...document.querySelectorAll('.modal,[role="dialog"]')].find(m=>m.getClientRects().length>0&&!/Set up CLI to work in the terminal/i.test(m.textContent||'')&&m.querySelector('.modal-close-button,[aria-label="Close"]'));const close=blocker?.querySelector('.modal-close-button,[aria-label="Close"]');window.__visualNoteSettingsBlocker=blocker;return {settings:point(control),blocker:close?point(close):null,general:general?point(general):null}})()`;
}

export function buildBlockerWaitArm(): string {
  return `(()=>{const blocker=window.__visualNoteSettingsBlocker;window.__visualNoteBlockerWait=new Promise((ok,bad)=>{if(!blocker?.isConnected)return ok(true);const observer=new MutationObserver(()=>{if(!blocker.isConnected){observer.disconnect();clearTimeout(timer);ok(true)}});observer.observe(document,{subtree:true,childList:true});const timer=setTimeout(()=>{observer.disconnect();bad(new Error('blocking modal close timeout'))},30000)});return true})()`;
}

export function buildGeneralWaitArm(): string {
  return `(()=>{const find=()=>[...document.querySelectorAll('.vertical-tab-nav-item')].find(x=>x.textContent?.trim()==='General');const point=(element)=>{const rect=element.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}};window.__visualNoteGeneralWait=new Promise((ok,bad)=>{const hit=find();if(hit)return ok(point(hit));const observer=new MutationObserver(()=>{const value=find();if(value){observer.disconnect();clearTimeout(timer);ok(point(value))}});observer.observe(document,{subtree:true,childList:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();bad(new Error('General settings tab timeout'))},30000)});return true})()`;
}

export function buildCliRowWaitArm(): string {
  return `(()=>{const find=()=>[...document.querySelectorAll('.setting-item')].find(x=>x.querySelector('.setting-item-name')?.textContent?.trim()==='Command line interface');const result=(item)=>{const control=item.querySelector('.checkbox-container');if(!control)throw new Error('Command line interface toggle missing');const rect=control.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,enabled:control.classList.contains('is-enabled')}};window.__visualNoteCliRowWait=new Promise((ok,bad)=>{const hit=find();if(hit)return ok(result(hit));const observer=new MutationObserver(()=>{const value=find();if(value){observer.disconnect();clearTimeout(timer);ok(result(value))}});observer.observe(document,{subtree:true,childList:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();bad(new Error('Command line interface row timeout'))},30000)});return true})()`;
}

export function buildToggleProbe(): string {
  return `(async()=>{const wait=(find,message)=>new Promise((ok,bad)=>{const hit=find();if(hit)return ok(hit);const observer=new MutationObserver(()=>{const value=find();if(value){observer.disconnect();clearTimeout(timer);ok(value)}});observer.observe(document,{subtree:true,childList:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();bad(new Error(message))},30000)});const settings=await wait(()=>document.querySelector('[aria-label="Settings"],.side-dock-settings'),'settings control timeout');settings.click();const general=await wait(()=>[...document.querySelectorAll('.vertical-tab-nav-item')].find(x=>x.textContent?.trim()==='General'),'General settings tab timeout');general.click();const item=await wait(()=>[...document.querySelectorAll('.setting-item')].find(x=>x.querySelector('.setting-item-name')?.textContent?.trim()==='Command line interface'),'Command line interface row timeout');const control=item.querySelector('.checkbox-container');if(!control)throw new Error('Command line interface toggle missing');const rect=control.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,enabled:control.classList.contains('is-enabled')};})()`;
}

export function buildReadinessWait(expectedVault: string, timeoutMs: number): string {
  const expected = JSON.stringify(expectedVault);
  return `new Promise((resolve,reject)=>{
    let settled=false,layoutObserved=false,layoutArmed=false,detachLayout,observer;
    const snapshot=()=>{const appValue=window.app,workspace=appValue?.workspace,vault=appValue?.vault;const settings=[...document.querySelectorAll('[aria-label],.side-dock-settings')].find(el=>el.getAttribute('aria-label')==='Settings'||el.classList.contains('side-dock-settings'));const base=vault?.adapter?.getBasePath?.()??vault?.adapter?.basePath??null;const settingsVisible=!!settings&&!!(settings.offsetWidth||settings.offsetHeight||settings.getClientRects().length);const result={ready:false,failedPredicates:[],url:location.href,readyState:document.readyState,inProgress:document.body?.classList.contains('in-progress')===true,appPresent:!!appValue,workspacePresent:!!workspace,vaultPresent:!!vault,layoutReady:workspace?.layoutReady===true||layoutObserved,basePath:base,settingsPresent:!!settings,settingsVisible};if(result.url!=='app://obsidian.md/index.html')result.failedPredicates.push('app_page');if(result.readyState!=='complete')result.failedPredicates.push('document_complete');if(result.inProgress)result.failedPredicates.push('bootstrap_not_in_progress');if(!result.appPresent)result.failedPredicates.push('app_present');if(!result.workspacePresent)result.failedPredicates.push('workspace_present');if(!result.vaultPresent)result.failedPredicates.push('vault_present');if(!result.layoutReady)result.failedPredicates.push('layout_ready');if(result.basePath!==${expected})result.failedPredicates.push('isolated_base_path');if(!result.settingsVisible)result.failedPredicates.push('settings_control_visible');result.ready=result.failedPredicates.length===0;return result};
    const cleanup=()=>{observer?.disconnect();clearTimeout(timer);document.removeEventListener?.('DOMContentLoaded',documentChanged);document.removeEventListener?.('readystatechange',documentChanged);window.removeEventListener?.('load',documentChanged);detachLayout?.()};
    const armLayout=()=>{if(layoutArmed||!window.app?.workspace)return;layoutArmed=true;const workspace=window.app.workspace;if(workspace.layoutReady===true)layoutObserved=true;if(typeof workspace.onLayoutReady==='function')workspace.onLayoutReady(()=>{layoutObserved=true;check()});else if(typeof workspace.on==='function'){const ref=workspace.on('layout-ready',()=>{layoutObserved=true;check()});if(ref&&typeof workspace.offref==='function')detachLayout=()=>workspace.offref(ref)}};
    const check=()=>{if(settled||!document.documentElement)return;armLayout();const result=snapshot();if(result.ready){settled=true;cleanup();resolve(result)}};
    const armDocument=()=>{if(observer||!document.documentElement)return;observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true})};
    const documentChanged=()=>{armDocument();check()};document.addEventListener?.('DOMContentLoaded',documentChanged);document.addEventListener?.('readystatechange',documentChanged);window.addEventListener?.('load',documentChanged);const timer=setTimeout(()=>{if(settled)return;settled=true;const result=snapshot();cleanup();reject(new Error('renderer readiness predicate timed out: '+JSON.stringify(result)))},${timeoutMs});documentChanged();
  })`;
}
